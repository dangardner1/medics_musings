// Adds new podcast episodes to data/episodes.json, then rebuilds the site.
//
//   node scripts/sync-episodes.mjs          show what would be added
//   node scripts/sync-episodes.mjs --write  update data/episodes.json and rebuild
//
// For each episode in the RSS feed that the site doesn't have yet, it creates an
// entry with the title, date, length and show notes from the feed, plus the
// Spotify, Apple Podcasts and YouTube links it can find. It waits a few hours for
// Spotify to list a brand-new episode (so the page can embed it), then adds it
// anyway with a link to the Spotify for Creators page. Topic tags are guessed from
// keywords; edit them in data/episodes.json any time.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, fetchFeed, findByTitle } from './lib/feed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_FILE || join(ROOT, 'data', 'episodes.json');
const WRITE = process.argv.includes('--write');
const MAX_AGE_DAYS = 14;
const SPOTIFY_WAIT_HOURS = 4;
const MAX_ADDS = 5;
const SPOTIFY_SHOW = 'https://open.spotify.com/show/7zknqhZkTKZ8WA8SuMlWlj';
const APPLE_ID = '1780716650';
const YOUTUBE_CHANNEL = 'UCyK_iXDV6K6SPuNDqp9ftKw';

// ---- Where else the episode lives ----------------------------------------------------

async function attempt(label, fn) {
  try { return await fn(); } catch (e) { console.log(`(${label} lookup failed: ${e.message})`); return []; }
}

const spotifyEpisodes = () => attempt('Spotify', async () => {
  const res = await fetch(SPOTIFY_SHOW, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const re = /href="\/episode\/([A-Za-z0-9]{22})"[^>]*>\s*<h4[^>]*>(?:<span[^>]*><\/span>)?([^<]*)<\/h4>/g;
  return [...html.matchAll(re)].map((m) => ({ id: m[1], title: decode(m[2]).trim() }));
});

const appleEpisodes = () => attempt('Apple Podcasts', async () => {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${APPLE_ID}&entity=podcastEpisode&limit=100`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.results
    .filter((r) => r.kind === 'podcast-episode' && r.trackViewUrl)
    .map((r) => ({ title: r.trackName, url: r.trackViewUrl.replace(/[?&]uo=\d+/, '') }));
});

const youtubeVideos = () => attempt('YouTube', async () => {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, b]) => ({
    id: (b.match(/<yt:videoId>([^<]*)</) || [])[1],
    title: decode((b.match(/<title>([^<]*)</) || [])[1] || ''),
  })).filter((v) => v.id);
});

// ---- Building an entry -----------------------------------------------------------------

const TOPIC_WORDS = {
  ai: /\b(ai|a\.i\.|artificial intelligence|robots?|chatbots?|algorithms?|machine learning|automation|digital)\b/gi,
  surgery: /\b(surger(y|ies)|surgeons?|surgical|operating room|hernia|laparoscop\w*|scalpels?|gallbladder|cholecyst\w*)\b/gi,
  aging: /\b(seniors?|elderly|aging|ageing|geriatric|retire[ds]?|nursing home|\d{2}-year-old)\b/gi,
  mind: /\b(psychiatr\w*|therap\w*|psycho\w*|mental|burnout|anxiety|depress\w*|happiness|mood)\b/gi,
  hospital: /\b(hospitals?|clinics?|nurses?|patients?|voicemail|grand rounds|emergency room|insurance)\b/gi,
  culture: /\b(comedy|sports?|games?|danc\w*|pickleball|burlesque|hollywood|music|films?|movies?)\b/gi,
};

function guessTags(text, topics) {
  return Object.entries(TOPIC_WORDS)
    .filter(([k]) => topics[k])
    .map(([k, re]) => [k, (text.match(re) || []).length])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
}

function slugify(title, taken) {
  let s = title.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 60) s = s.slice(0, 60).replace(/-[^-]*$/, '');
  let slug = s || 'episode';
  for (let n = 2; taken.has(slug); n++) slug = `${s}-${n}`;
  return slug;
}

function summarize(paragraph, max = 200) {
  const t = paragraph.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(' ', max)).replace(/[\s,;:.—-]+$/, '') + '…';
}

// The first real sentence-length paragraph, skipping a heading line and any
// "Episode Overview:" style label.
function blurbParagraph(paras) {
  const body = paras.find((p) => p.length >= 60) || paras[0] || '';
  return body.replace(/^(episode\s+)?(overview|summary|description):\s*/i, '');
}

function newEntry(item, links, data) {
  const paras = item.description.split('\n').map((p) => p.trim()).filter(Boolean);
  const entry = {
    slug: slugify(item.title, new Set(data.episodes.map((e) => e.slug))),
    title: item.title,
    date: item.date.toISOString().slice(0, 10),
    minutes: item.minutes || 1,
    summary: summarize(blurbParagraph(paras) || item.title),
    description: paras.join('\n\n') || item.title,
  };
  if (links.spotify) entry.spotify = links.spotify;
  else if (item.link) entry.creatorUrl = item.link;
  if (links.apple) entry.apple = links.apple;
  if (links.youtube) entry.youtube = links.youtube;
  entry.tags = guessTags(`${item.title} ${item.description}`, data.topics);
  return entry;
}

// ---- Main -----------------------------------------------------------------------------------

async function main() {
  const items = await fetchFeed();
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  const [spotify, apple, youtube] = [await spotifyEpisodes(), await appleEpisodes(), await youtubeVideos()];
  const find = (list, item) => findByTitle(list, item.title, (x) => x.title, true);

  const changes = [];
  let added = 0;
  for (const item of items) {
    const ageDays = (Date.now() - item.date.getTime()) / 86400000;
    if (ageDays > MAX_AGE_DAYS) continue;
    const links = {
      spotify: find(spotify, item)?.id,
      apple: find(apple, item)?.url,
      youtube: find(youtube, item)?.id,
    };

    const existing = findByTitle(data.episodes, item.title);
    if (existing) {
      // Fill in links that weren't available when the episode was first added.
      if (!existing.spotify && links.spotify) { existing.spotify = links.spotify; delete existing.creatorUrl; changes.push(`${existing.title}: Spotify link`); }
      if (!existing.apple && links.apple) { existing.apple = links.apple; changes.push(`${existing.title}: Apple link`); }
      if (!existing.youtube && links.youtube) { existing.youtube = links.youtube; changes.push(`${existing.title}: YouTube link`); }
      continue;
    }

    if (added >= MAX_ADDS) { console.log(`Limit of ${MAX_ADDS} new episodes per run reached.`); break; }
    if (!links.spotify && ageDays * 24 < SPOTIFY_WAIT_HOURS) {
      console.log(`"${item.title}" isn't on Spotify yet; waiting up to ${SPOTIFY_WAIT_HOURS}h before adding it.`);
      continue;
    }
    const entry = newEntry(item, links, data);
    data.episodes.push(entry);
    added++;
    changes.push(`NEW ${entry.title} -> /episodes/${entry.slug}/ (tags: ${entry.tags.join(', ') || 'none'}; ` +
      `Spotify ${links.spotify ? 'yes' : 'no'}, Apple ${links.apple ? 'yes' : 'no'}, YouTube ${links.youtube ? 'yes' : 'no'})`);
  }

  if (!changes.length) { console.log('The site already has every episode in the feed.'); return; }
  console.log(changes.join('\n'));
  if (!WRITE) { console.log('\nDry run: nothing written. Use --write to apply.'); return; }

  writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
  if (!process.env.SKIP_BUILD) execFileSync('node', [join(ROOT, 'scripts', 'build-episodes.mjs')], { stdio: 'inherit' });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
