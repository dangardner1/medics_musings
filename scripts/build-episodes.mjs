// Builds everything episode-related from data/episodes.json:
//   - the episode cards, topic/series chips, "Start here" and "Play latest" in index.html
//   - the PodcastEpisode list in index.html's JSON-LD
//   - episodes/<slug>/index.html, one page per episode
//   - sitemap.xml and sw.js (service worker, versioned by content hash)
//
// To publish an episode: add an entry to data/episodes.json (newest anywhere;
// cards are sorted newest first, so the latest always sits directly under
// "Latest episodes"), drop its audio in audio/episodes/ if self-hosted, then
//   node scripts/build-episodes.mjs
// Optional transcript: transcripts/<slug>.txt (blank line between paragraphs).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.medicsmusings.com';
const SHOW = {
  spotify: 'https://open.spotify.com/show/7zknqhZkTKZ8WA8SuMlWlj',
  apple: 'https://podcasts.apple.com/us/podcast/medics-musings/id1780716650',
  youtube: 'https://www.youtube.com/@MedicsMusings',
  rss: 'https://anchor.fm/s/117844514/podcast/rss',
  overcast: 'https://overcast.fm/itunes1780716650',
  pocketcasts: 'https://pca.st/itunes/1780716650',
  amazon: 'https://music.amazon.com/search/Medics%20Musings',
};
const INBOX = 'BialystockMDandBloomMD@Gmail.com';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const jsonLd = (data) => JSON.stringify(data, null, 1).replace(/</g, '\\u003c');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const dateLabel = (iso) => new Date(iso + 'T12:00:00Z')
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Trim to a search-snippet length on a word boundary.
function snippet(text, max = 158) {
  const t = text.replace(/\s+/g, ' ').replace(/…$/, '').trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(' ', max - 1)).replace(/[\s,;:.—-]+$/, '') + '…';
}

// Spotify show notes sometimes arrive with paragraph breaks stripped
// ("medicine.From the"), so split where a sentence runs into the next capital.
function paragraphs(text) {
  const blocks = text.includes('\n\n') ? text.split(/\n\n+/) : text.split(/(?<=[a-z)][.!?])(?=[A-Z])/);
  return blocks.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const flat = (text) => text.replace(/\s+/g, ' ').trim();

// ---- Data --------------------------------------------------------------------

const data = JSON.parse(read('data/episodes.json'));
const episodes = data.episodes
  .map((e, i) => [e, i])
  .sort((a, b) => b[0].date.localeCompare(a[0].date) || a[1] - b[1])
  .map(([e]) => ({ ...e, url: `${SITE}/episodes/${e.slug}/`, path: `/episodes/${e.slug}/` }));
const bySlug = new Map(episodes.map((e) => [e.slug, e]));
for (const e of episodes) {
  for (const t of e.tags || []) if (!data.topics[t]) throw new Error(`${e.slug}: unknown topic "${t}"`);
  if (e.series && !data.series[e.series]) throw new Error(`${e.slug}: unknown series "${e.series}"`);
  if (!e.audio && !e.spotify) throw new Error(`${e.slug}: needs audio or a spotify id`);
}
if (!bySlug.has(data.startHere)) throw new Error('startHere is not an episode slug');
const startHere = bySlug.get(data.startHere);

const partsOf = (series) => episodes.filter((e) => e.series === series).sort((a, b) => a.part - b.part);
const partLabel = (e) => e.partLabel || `Part ${e.part}`;

function seriesNext(ep) {
  if (!ep.series) return null;
  const parts = partsOf(ep.series);
  return parts[parts.indexOf(ep) + 1] || null;
}

// Next up: the next part of a series, else the newest episode sharing the most
// topics, else the "start here" pick.
function upNext(ep) {
  const nextPart = seriesNext(ep);
  if (nextPart) return { ep: nextPart, kind: 'series' };
  const scored = episodes
    .filter((e) => e !== ep && !(ep.series && e.series === ep.series))
    .map((e) => ({ e, score: (e.tags || []).filter((t) => (ep.tags || []).includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.e.date.localeCompare(a.e.date));
  if (scored.length) return { ep: scored[0].e, kind: 'recommended' };
  return { ep: startHere === ep ? episodes.find((e) => e !== ep) : startHere, kind: 'recommended' };
}

const spotifyUrl = (e) => e.spotify && `https://open.spotify.com/episode/${e.spotify}`;
const appleUrl = (e) => e.apple || SHOW.apple;
const youtubeUrl = (e) => (e.youtube ? `https://www.youtube.com/watch?v=${e.youtube}` : SHOW.youtube);

function listenRow(e, extra = '') {
  const links = [
    spotifyUrl(e) && `<a href="${spotifyUrl(e)}" target="_blank" rel="noopener" data-platform="spotify">Spotify</a>`,
    `<a href="${appleUrl(e)}" target="_blank" rel="noopener" data-platform="apple">Apple Podcasts</a>`,
    `<a href="${youtubeUrl(e)}" target="_blank" rel="noopener" data-platform="youtube">YouTube</a>`,
  ].filter(Boolean);
  return `<p class="ep-listen">Listen on ${links.join(' · ')}${extra}</p>`;
}

// ---- Homepage pieces -----------------------------------------------------------

function tagChips(e) {
  const chips = [];
  if (e.series) {
    const total = partsOf(e.series).filter((p) => !p.partLabel).length;
    const label = e.partLabel ? `${data.series[e.series]} · ${e.partLabel}` : `${data.series[e.series]} · Part ${e.part} of ${total}`;
    chips.push(`<a class="chip chip-series" href="?series=${e.series}#episodes" data-series="${e.series}">${esc(label)}</a>`);
  }
  for (const t of e.tags || []) {
    chips.push(`<a class="chip" href="?topic=${t}#episodes" data-topic="${t}">${esc(data.topics[t])}</a>`);
  }
  return chips.length ? `<p class="ep-tags">${chips.join(' ')}</p>` : '';
}

function card(e) {
  const attrs = `id="${e.slug}" data-tags="${(e.tags || []).join(' ')}"${e.series ? ` data-series="${e.series}"` : ''}`;
  const audio = e.audio
    ? `\n          <audio class="ep-audio" controls preload="none" src="${e.audio}" aria-label="Play ${esc(e.title)}"></audio>` : '';
  const play = !e.audio && e.spotify
    ? `\n            <button type="button" class="btn btn-ghost ep-play" data-ep="${e.spotify}" data-title="${esc(e.title)}">▶ Play here</button>` : '';
  const download = e.audio ? `\n            <a class="ep-link" href="${e.audio}" download>Download MP3</a>` : '';
  const embed = !e.audio && e.spotify ? '\n          <div class="ep-embed"></div>' : '';
  return `<article class="ep-card" ${attrs}>
          <h3><a href="episodes/${e.slug}/">${esc(e.title)}</a></h3>
          <p class="ep-meta"><time datetime="${e.date}">${dateLabel(e.date)}</time> · ${e.minutes} min</p>
          <p class="ep-desc">${esc(e.summary)}</p>
          ${tagChips(e)}${audio}
          <div class="ep-actions">${play}
            <button type="button" class="btn btn-ghost ep-share" data-share-url="${e.url}" data-share-title="${esc(e.title)} — Medics Musings">Share</button>${download}
          </div>
          ${listenRow(e)}${embed}
        </article>`;
}

function filterChips() {
  const count = (fn) => episodes.filter(fn).length;
  const topics = Object.entries(data.topics)
    .map(([k, label]) => `<button type="button" class="chip" data-topic="${k}">${esc(label)} · ${count((e) => (e.tags || []).includes(k))}</button>`);
  const series = Object.entries(data.series)
    .map(([k, label]) => `<button type="button" class="chip" data-series="${k}">${esc(label)} · ${count((e) => e.series === k)}</button>`);
  return `<div class="chips" role="group" aria-label="Filter by topic">
          <span class="chips-label">Topic</span>
          <button type="button" class="chip is-active" data-topic="">All</button>
          ${topics.join('\n          ')}
        </div>
        <div class="chips" role="group" aria-label="Filter by series">
          <span class="chips-label">Series</span>
          ${series.join('\n          ')}
        </div>`;
}

function region(html, name, body) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error(`index.html is missing the build:${name} markers`);
  return html.replace(re, (_, a, b) => `${a}\n        ${body}\n        ${b}`);
}

function updateHomepage() {
  let html = read('index.html');
  html = region(html, 'cards', episodes.map(card).join('\n        '));
  html = region(html, 'chips', filterChips());
  html = region(html, 'startHere',
    `<p class="start-here">New here? Start with <a href="episodes/${startHere.slug}/">${esc(startHere.title)}</a> (${startHere.minutes} min).</p>`);
  html = region(html, 'playLatest',
    `<button type="button" class="btn btn-latest" data-play-latest title="${esc(episodes[0].title)}">▶ Play the latest episode</button>`);

  html = html.replace(/(id="ep-toggle"[^>]*>)Show all \d+ episodes/, `$1Show all ${episodes.length} episodes`);
  html = html.replace(/'Show all \d+ episodes'/, `'Show all ' + document.querySelectorAll('#ep-grid .ep-card').length + ' episodes'`);

  // JSON-LD: keep everything else, regenerate the episode list.
  const ldRe = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;
  const ld = JSON.parse(html.match(ldRe)[2]);
  const series = ld['@graph'].find((n) => n['@type'] === 'PodcastSeries');
  series.episode = episodes.map((e) => ({
    '@type': 'PodcastEpisode',
    name: e.title,
    url: e.url,
    datePublished: e.date,
    timeRequired: `PT${e.minutes}M`,
    description: flat(e.description),
    associatedMedia: e.audio
      ? { '@type': 'AudioObject', contentUrl: `${SITE}/${e.audio}`, encodingFormat: 'audio/mpeg', ...(e.audioDuration && { duration: e.audioDuration }) }
      : { '@type': 'MediaObject', embedUrl: `https://open.spotify.com/embed/episode/${e.spotify}` },
  }));
  html = html.replace(ldRe, (_, a, __, c) => `${a}\n${jsonLd(ld)}\n${c}`);
  writeFileSync(join(ROOT, 'index.html'), html);
}

// ---- Episode pages -------------------------------------------------------------

const signupSection = () => `  <section class="newsletter" id="newsletter">
    <div class="wrap">
      <span class="eyebrow">Refill Reminder</span>
      <h2>New episodes, straight to your inbox.</h2>
      <p class="newsletter-sub">One short email when a new episode drops. No spam, no upsell, no prior authorization. By subscribing you agree to get these emails; unsubscribe anytime.</p>
      <form class="signup" data-location="episode_page">
        <label class="sr-only" for="signup-email">Email address</label>
        <input id="signup-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
        <button type="submit" class="btn btn-primary">Subscribe</button>
        <p class="signup-status" role="status" aria-live="polite"></p>
      </form>
    </div>
  </section>`;

const footer = () => `<footer>
  <div class="wrap footer-nav">
    <a href="/#about">About</a>
    <a href="/#episodes">All episodes</a>
    <a href="mailto:${INBOX}">Contact</a>
    <span>© 2026 Medics Musings Productions — no prior authorization required.</span>
  </div>
  <div class="wrap">
    <p class="disclaimer"><b>For entertainment only.</b> Medics Musings episodes are satirical, AI-generated conversations; characters, stories and “facts” may be fictional. Nothing on this site, including the AI chat assistant, is medical advice or creates a doctor–patient relationship. For medical concerns, see your own clinician. In an emergency, call 911.</p>
  </div>
</footer>`;

function neighbour(ep, label, rel) {
  if (!ep) return '<span></span>';
  return `<a class="ep-nav-link" href="${ep.path}" rel="${rel}">
        <span class="eyebrow">${label}</span>
        <span class="ep-nav-title">${esc(ep.title)}</span>
      </a>`;
}

function seriesPanel(ep) {
  if (!ep.series) return '';
  const items = partsOf(ep.series).map((p) => {
    const label = `${partLabel(p)}: ${p.title}`;
    return p === ep
      ? `<li aria-current="page"><span>${esc(label)}</span></li>`
      : `<li><a href="${p.path}">${esc(label)}</a></li>`;
  });
  return `<aside class="series-panel" aria-label="Series">
        <span class="eyebrow">Series · ${esc(data.series[ep.series])}</span>
        <ol>
          ${items.join('\n          ')}
        </ol>
      </aside>`;
}

function upNextSection(next) {
  const heading = next.kind === 'series' ? 'Next in the series' : 'Recommended next';
  return `<section class="up-next" id="up-next" aria-label="${heading}">
    <div class="wrap">
      <span class="eyebrow">${heading}</span>
      <a class="up-next-card" href="${next.ep.path}${next.kind === 'series' ? '?autoplay=1' : ''}">
        <span class="up-next-title">${esc(next.ep.title)}</span>
        <span class="ep-meta">${dateLabel(next.ep.date)} · ${next.ep.minutes} min</span>
        <span class="up-next-desc">${esc(snippet(next.ep.summary, 170))}</span>
        <span class="btn btn-primary">Play next →</span>
      </a>
    </div>
  </section>`;
}

function episodePage(ep, newer, older) {
  const next = upNext(ep);
  const description = snippet(ep.description);
  const pageTitle = `${ep.title} — Medics Musings Podcast`;
  const spotify = spotifyUrl(ep);
  const truncated = flat(ep.description).endsWith('…');
  const transcriptPath = `transcripts/${ep.slug}.txt`;
  const transcript = existsSync(join(ROOT, transcriptPath)) ? paragraphs(read(transcriptPath)) : null;

  const player = ep.audio
    ? `<audio class="ep-audio" controls preload="metadata" src="/${ep.audio}" aria-label="Play ${esc(ep.title)}"></audio>`
    : `<div class="ep-embed" id="ep-embed" data-spotify="${ep.spotify}">
          <iframe title="${esc(ep.title)}" src="https://open.spotify.com/embed/episode/${ep.spotify}?utm_source=generator" width="100%" height="152" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
        </div>`;

  const download = ep.audio ? `<a class="ep-link" href="/${ep.audio}" download>Download MP3</a>` : '';
  const notes = paragraphs(ep.description).map((p) => `<p>${esc(p)}</p>`).join('\n        ');
  const more = truncated && spotify
    ? `\n        <p><a class="ep-link" href="${spotify}" target="_blank" rel="noopener" data-platform="spotify">Full show notes on Spotify</a></p>` : '';

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'PodcastEpisode',
        '@id': `${ep.url}#episode`,
        url: ep.url,
        name: ep.title,
        datePublished: ep.date,
        timeRequired: `PT${ep.minutes}M`,
        description: flat(ep.description),
        inLanguage: 'en',
        image: `${SITE}/channel-poster.jpg`,
        keywords: (ep.tags || []).map((t) => data.topics[t]).join(', ') || undefined,
        partOfSeries: { '@type': 'PodcastSeries', '@id': `${SITE}/#podcast`, name: 'Medics Musings', url: `${SITE}/` },
        author: [
          { '@type': 'Person', '@id': `${SITE}/#leo`, name: 'Leo A. Gordon, MD' },
          { '@type': 'Person', '@id': `${SITE}/#dan`, name: 'Dan Gardner, MD' },
        ],
        associatedMedia: ep.audio
          ? { '@type': 'AudioObject', contentUrl: `${SITE}/${ep.audio}`, encodingFormat: 'audio/mpeg', ...(ep.audioDuration && { duration: ep.audioDuration }) }
          : { '@type': 'MediaObject', embedUrl: `https://open.spotify.com/embed/episode/${ep.spotify}` },
        ...(transcript && { transcript: transcript.join('\n\n') }),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Medics Musings', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Episodes', item: `${SITE}/#episodes` },
          { '@type': 'ListItem', position: 3, name: ep.title, item: ep.url },
        ],
      },
    ],
  };

  const chips = tagChips(ep).replace(/href="\?/g, 'href="/?');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="canonical" href="${ep.url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="Leo A. Gordon, MD and Dan Gardner, MD">
<meta name="theme-color" content="#0b0f14">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Medics Musings">
<meta property="og:url" content="${ep.url}">
<meta property="og:title" content="${esc(ep.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Medics Musings podcast artwork featuring hosts Leo A. Gordon, MD and Dan Gardner, MD">
<meta property="og:locale" content="en_US">
<meta property="article:published_time" content="${ep.date}">${ep.audio ? `
<meta property="og:audio" content="${SITE}/${ep.audio}">
<meta property="og:audio:type" content="audio/mpeg">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ep.title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og-image.jpg">
<link rel="alternate" type="application/rss+xml" title="Medics Musings podcast feed" href="${SHOW.rss}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<!-- Google Analytics (GA4) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HPV5BLPF1B"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-HPV5BLPF1B');
</script>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="/episodes/episode.css">
<script type="application/ld+json">
${jsonLd(ld)}
</script>
</head>
<body>

<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="wordmark" href="/" aria-label="Medics Musings home"><img src="/favicon.svg" width="30" height="30" alt="">Medics<span>Musings</span></a>
    <a class="btn btn-ghost" href="/#episodes">All episodes</a>
  </div>
</header>

<main>
  <article class="episode" data-slug="${ep.slug}" data-title="${esc(ep.title)}" data-next-url="${next.ep.path}" data-next-title="${esc(next.ep.title)}" data-next-kind="${next.kind}"${ep.spotify ? ` data-spotify="${ep.spotify}"` : ''}>
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/#episodes">Episodes</a></nav>
      <h1>${esc(ep.title)}</h1>
      <p class="ep-meta"><time datetime="${ep.date}">${dateLabel(ep.date)}</time> · ${ep.minutes} min</p>
      ${chips}
      <div class="player">
        ${player}
      </div>
      <div class="ep-actions">
        <button type="button" class="btn btn-primary ep-share" data-share-url="${ep.url}" data-share-title="${esc(ep.title)} — Medics Musings">Share</button>
        <button type="button" class="ctl react" data-react="like" aria-pressed="false">👍 Loved it</button>
        ${download}
        <span class="react-note" role="status" aria-live="polite"></span>
      </div>
      ${listenRow(ep)}
      <p class="follow-line">Follow the show:
        <a href="${SHOW.spotify}" target="_blank" rel="noopener" data-platform="spotify">Spotify</a> ·
        <a href="${SHOW.apple}" target="_blank" rel="noopener" data-platform="apple">Apple Podcasts</a> ·
        <a href="${SHOW.youtube}" target="_blank" rel="noopener" data-platform="youtube">YouTube</a> ·
        <a href="${SHOW.overcast}" target="_blank" rel="noopener" data-platform="overcast">Overcast</a> ·
        <a href="${SHOW.pocketcasts}" target="_blank" rel="noopener" data-platform="pocketcasts">Pocket Casts</a> ·
        <a href="${SHOW.amazon}" target="_blank" rel="noopener" data-platform="amazon">Amazon Music</a> ·
        <a href="${SHOW.rss}" target="_blank" rel="noopener" data-platform="rss">RSS</a> ·
        <button type="button" class="link-btn" data-copy-rss>Copy RSS</button>
      </p>
      ${seriesPanel(ep)}

      <h2>Show notes</h2>
      <div class="notes">
        ${notes}${more}
      </div>${transcript ? `

      <details class="transcript" id="transcript">
        <summary>Transcript</summary>
        ${transcript.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
      </details>` : ''}
      <p class="satire-note"><b>Satire alert:</b> Medics Musings is medical satire made for entertainment. Characters and stories may be fictional, and nothing in this episode is medical advice.</p>
    </div>
  </article>

  ${upNextSection(next)}

${signupSection()}

  <nav class="wrap ep-nav" aria-label="More episodes">
    ${neighbour(newer, '← Newer episode', 'prev')}
    ${neighbour(older, 'Older episode →', 'next')}
  </nav>
</main>

<div class="toast" id="up-next-toast" role="status" aria-live="polite" hidden>
  <span class="toast-text"></span>
  <a class="btn btn-primary toast-go" href="#">Play</a>
  <button type="button" class="ctl toast-cancel">Cancel</button>
</div>

${footer()}

<script src="/signup.js" defer></script>
<script src="/player.js" defer></script>
<script src="/site.js" defer></script>
<script src="/episodes/episode.js" defer></script>
</body>
</html>
`;
}

// ---- Write everything -------------------------------------------------------------

updateHomepage();

episodes.forEach((ep, i) => {
  const dir = join(ROOT, 'episodes', ep.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), episodePage(ep, episodes[i - 1], episodes[i + 1]));
});

// Sitemap
const newest = episodes[0].date;
const urls = [
  { loc: `${SITE}/`, lastmod: newest, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/tools.html`, lastmod: '2026-09-25', changefreq: 'monthly', priority: '0.6' },
  ...episodes.map((e) => ({ loc: e.url, lastmod: e.date, changefreq: 'yearly', priority: '0.8' })),
];
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`);

// Service worker: versioned by a hash of the files it precaches, so a deploy
// with any change invalidates the old cache.
const PRECACHE = [
  '/', '/tools.html', '/offline.html', '/manifest.webmanifest',
  '/episodes/episode.css', '/episodes/episode.js',
  '/signup.js', '/feedback.js', '/player.js', '/discover.js', '/site.js',
  '/favicon.svg', '/icon-192.png', '/icon-512.png', '/channel-poster.webp', '/host-leo.jpg', '/host-dan.jpg',
].filter((u) => u === '/' || existsSync(join(ROOT, u.slice(1))));
const hash = createHash('sha1');
for (const u of PRECACHE) hash.update(read(u === '/' ? 'index.html' : u.slice(1)));
for (const e of episodes) hash.update(read(`episodes/${e.slug}/index.html`));
writeFileSync(join(ROOT, 'sw.js'), `// GENERATED by scripts/build-episodes.mjs. Do not edit.
const VERSION = 'mm-${hash.digest('hex').slice(0, 10)}';
const PRECACHE = ${JSON.stringify(PRECACHE, null, 2)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Audio streams (Range requests) always go to the network.
  if (req.headers.has('range') || /\\.(mp3|m4a)$/i.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    // Pages: network first so new episodes appear, cache as the offline fallback.
    const key = new Request(url.origin + url.pathname);
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
          return res;
        })
        .catch(() => caches.match(key).then((hit) => hit || caches.match('/offline.html')))
    );
    return;
  }

  // Static assets: cache first, refreshed in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
`);

console.log(`Built ${episodes.length} episode pages, updated index.html, sitemap.xml and sw.js.`);
