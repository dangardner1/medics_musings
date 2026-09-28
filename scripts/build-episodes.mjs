// Builds everything episode-related from data/episodes.json:
//   - the episode cards, topic/series chips, "Start here" and "Play latest" in index.html
//   - the PodcastEpisode list in index.html's JSON-LD
//   - episodes/<slug>/index.html, one page per episode
//   - topics/<key>/ and series/<key>/ collection pages, plus the topics/ hub
//   - sitemap.xml and sw.js (service worker, versioned by content hash)
//
// To publish an episode: add an entry to data/episodes.json (newest anywhere;
// cards are sorted newest first, so the latest always sits directly under
// "Latest episodes"), drop its audio in audio/episodes/ if self-hosted, then
//   node scripts/build-episodes.mjs
// Optional transcript: transcripts/<slug>.txt (blank line between paragraphs).
// Optional chapters: data/chapters.json ({ slug: [{ t: seconds, title }] }).
// Optional quotes: data/quotes.json ({ slug: [{ text, t }] }) with cards made by
//   scripts/make-quote-cards.py in og/quotes/.
// Also builds the explainer, teaching, submit, subscribe, embed, short-link and
// feed pages (see build-extras.mjs).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  ROOT, SITE, SHOW, esc, jsonLd, read, readJson, dateLabel, snippet, paragraphs, flat, clock,
  writePage, shareImage, pageHead, signupSection, footer, prefChoices,
} from './lib/page.mjs';
import {
  buildExtras, embedSnippet, feedsFor, faqSection, faqLd, quoteCardPath, quoteShareRow, slugify,
} from './build-extras.mjs';

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
}
if (!bySlug.has(data.startHere)) throw new Error('startHere is not an episode slug');
const startHere = bySlug.get(data.startHere);

const isoSeconds = (iso) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso) || [];
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
};

// Stable episode numbers, oldest = 1, for short links (medicsmusings.com/e/12).
const num = new Map([...episodes].reverse().map((e, i) => [e.slug, i + 1]));
const chapters = readJson('data/chapters.json', {});
const quotes = readJson('data/quotes.json', {});
const explainers = readJson('data/explainers.json', { explainers: [] }).explainers;
const guides = readJson('data/teaching.json', { guides: [] }).guides;
const eponyms = [
  ...readJson('data/eponyms.json', { entries: [] }).entries.map((r) => ({ ...r, page: '/eponyms/' })),
  ...readJson('data/eponyms-psychiatry.json', { entries: [] }).entries.map((r) => ({ ...r, page: '/eponyms/psychiatry/' })),
];
// Both timelines, each row tagged with the page it lives on.
const timeline = [
  ...readJson('data/timeline.json', { entries: [] }).entries.map((r) => ({ ...r, page: '/timeline/' })),
  ...readJson('data/timeline-psychiatry.json', { entries: [] }).entries.map((r) => ({ ...r, page: '/timeline/psychiatry/' })),
];

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

// Spotify's episode page, or (until Spotify lists a brand-new episode) the Spotify for Creators page.
const spotifyUrl = (e) => (e.spotify ? `https://open.spotify.com/episode/${e.spotify}` : e.creatorUrl);

// Media described in JSON-LD; none for an episode that is only linked out.
const mediaOf = (e) => (e.audio
  ? { '@type': 'AudioObject', contentUrl: `${SITE}/${e.audio}`, encodingFormat: 'audio/mpeg', ...(e.audioDuration && { duration: e.audioDuration }) }
  : e.spotify ? { '@type': 'MediaObject', embedUrl: `https://open.spotify.com/embed/episode/${e.spotify}` } : undefined);
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

function tagChips(e, base = '') {
  const chips = [];
  if (e.series) {
    const total = partsOf(e.series).filter((p) => !p.partLabel).length;
    const label = e.partLabel ? `${data.series[e.series]} · ${e.partLabel}` : `${data.series[e.series]} · Part ${e.part} of ${total}`;
    chips.push(`<a class="chip chip-series" href="${base}series/${e.series}/" data-series="${e.series}">${esc(label)}</a>`);
  }
  for (const t of e.tags || []) {
    chips.push(`<a class="chip" href="${base}topics/${t}/" data-topic="${t}">${esc(data.topics[t])}</a>`);
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
  html = region(html, 'signupPrefs', `<details class="signup-prefs">
          <summary>Only want some topics?</summary>
          <p class="prefs-note">Tick what you want. Leave everything blank to get every episode.</p>
          <div class="prefs">
            ${prefChoices(data)}
          </div>
        </details>`);
  const featured = ['prior-authorization', 'ai-scribes', 'physician-burnout', 'inguinal-hernia']
    .map((s) => explainers.find((x) => x.slug === s)).filter(Boolean);
  html = region(html, 'beyond', `<span class="eyebrow">Beyond the episodes</span>
        <h2>The real medicine, the classroom, and your worst stories.</h2>
        <p class="beyond-sub">The jokes land harder when you know what they're about. Look up the terms, teach with an episode, or send us the healthcare absurdity you lived through.</p>
        <div class="beyond-grid">
          <div class="beyond-card">
            <h3>Explained</h3>
            <p>Plain-English guides to the medicine our satire leans on.</p>
            <ul>
              ${featured.map((x) => `<li><a href="explained/${x.slug}/">${esc(x.title)}</a></li>`).join('\n              ')}
            </ul>
            <a class="chips-link" href="explained/">All ${explainers.length} explainers →</a>
          </div>
          <div class="beyond-card">
            <h3>Teach with it</h3>
            <p>Free discussion guides for residency didactics, med school small groups and grand rounds: objectives, questions and a quick activity.</p>
            <a class="chips-link" href="teach/">${guides.length} teaching guides →</a>
          </div>
          <div class="beyond-card">
            <h3>Tell us yours</h3>
            <p>Your worst prior authorization saga or hospital phone-tree nightmare could be the next episode. If we use it, we'll send you the link.</p>
            <a class="chips-link" href="submit/">Submit a story or pitch a guest spot →</a>
          </div>
          <div class="beyond-card">
            <h3>Names &amp; dates</h3>
            <p>${eponyms.length} real eponyms, surgical and psychiatric, and timelines from Hippocrates to the robot in the room.</p>
            <a class="chips-link" href="eponyms/">The eponym index →</a>
            <a class="chips-link" href="eponyms/psychiatry/">Psychiatric eponyms →</a>
            <a class="chips-link" href="timeline/">The history timeline →</a>
            <a class="chips-link" href="timeline/psychiatry/">The psychiatry timeline →</a>
          </div>
        </div>`);

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
    associatedMedia: mediaOf(e),
  }));
  html = html.replace(ldRe, (_, a, __, c) => `${a}\n${jsonLd(ld)}\n${c}`);
  writeFileSync(join(ROOT, 'index.html'), html);
}

// ---- Episode pages -------------------------------------------------------------

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

  const player = !ep.audio && !ep.spotify ? '' : ep.audio
    ? `<audio class="ep-audio" controls preload="metadata" src="/${ep.audio}" aria-label="Play ${esc(ep.title)}"></audio>`
    : `<div class="ep-embed" id="ep-embed" data-spotify="${ep.spotify}">
          <iframe title="${esc(ep.title)}" src="https://open.spotify.com/embed/episode/${ep.spotify}?utm_source=generator" width="100%" height="152" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
        </div>`;

  const download = ep.audio ? `<a class="ep-link" href="/${ep.audio}" download>Download MP3</a>` : '';
  const notes = paragraphs(ep.description).map((p) => `<p>${esc(p)}</p>`).join('\n        ');
  const more = truncated && spotify
    ? `\n        <p><a class="ep-link" href="${spotify}" target="_blank" rel="noopener" data-platform="spotify">Full show notes on Spotify</a></p>` : '';

  // Chapters jump the on-page player (episode.js); ?t= links work from anywhere.
  const chs = (chapters[ep.slug] || []).slice().sort((a, b) => a.t - b.t);
  const chapterList = chs.length ? `
      <h2 id="chapters">Chapters</h2>
      <ol class="chapters">
        ${chs.map((c) => `<li><a href="?t=${Math.floor(c.t)}" data-seek="${Math.floor(c.t)}"><span class="ch-time">${clock(c.t)}</span> ${esc(c.title)}</a></li>`).join('\n        ')}
      </ol>` : '';
  const endSec = ep.audioDuration ? isoSeconds(ep.audioDuration) : ep.minutes * 60;
  const clips = chs.map((c, i) => ({
    '@type': 'Clip',
    name: c.title,
    startOffset: Math.floor(c.t),
    endOffset: Math.floor(chs[i + 1]?.t ?? endSec),
    url: `${ep.url}?t=${Math.floor(c.t)}`,
  }));

  // Quote cards (only quotes whose card image exists).
  const qs = (quotes[ep.slug] || []).map((q, i) => ({ ...q, n: i + 1 }))
    .filter((q) => existsSync(join(ROOT, quoteCardPath(ep.slug, q.n))));
  const quoteSection = qs.length ? `
      <h2 id="quotes">Share a quote</h2>
      <div class="quotes">
        ${qs.map((q) => `<figure class="quote">
          <img src="/${quoteCardPath(ep.slug, q.n)}" width="1200" height="630" loading="lazy" alt="Quote card: “${esc(q.text)}”">
          <figcaption>
            <blockquote>“${esc(q.text)}”</blockquote>${q.t != null ? `
            <a class="ep-link" href="?t=${Math.floor(q.t)}" data-seek="${Math.floor(q.t)}">Hear it at ${clock(q.t)}</a>` : ''}
            ${quoteShareRow(ep, q, q.n)}
          </figcaption>
        </figure>`).join('\n        ')}
      </div>` : '';

  // The real medicine behind the episode, a teaching guide, and any names/dates it mentions.
  const exps = explainers.filter((x) => x.episodes.includes(ep.slug));
  const guide = guides.find((g) => g.slug === ep.slug);
  const eponymHits = eponyms.filter((r) => r.episodes.some((e) => e.slug === ep.slug));
  const timelineHits = timeline.filter((r) => r.episodes.some((e) => e.slug === ep.slug));
  const learnMore = exps.length || guide || eponymHits.length || timelineHits.length ? `
      <aside class="learn-more" aria-label="Learn more">${exps.length ? `
        <p><span class="eyebrow">The real medicine</span> ${exps.map((x) => `<a href="/explained/${x.slug}/">${esc(x.title)}</a>`).join(' · ')}</p>` : ''}${guide ? `
        <p><span class="eyebrow">Teaching this?</span> <a href="/teach/${ep.slug}/">Free discussion guide: ${esc(guide.theme.toLowerCase())}</a></p>` : ''}${eponymHits.length ? `
        <p><span class="eyebrow">Names in this episode</span> ${eponymHits.map((r) => `<a href="${r.page}#${slugify(r.name)}">${esc(r.name)}</a>`).join(' · ')}</p>` : ''}${timelineHits.length ? `
        <p><span class="eyebrow">On the timeline</span> ${timelineHits.map((r) => `<a href="${r.page}#${r.slug}">${esc(r.yearLabel)}: ${esc(snippet(r.event, 60))}</a>`).join(' · ')}</p>` : ''}
      </aside>` : '';

  const embed = player ? `
      <details class="embed-box">
        <summary>Embed this episode on your site</summary>
        <p>Paste this into a blog post, newsletter or course page. It shows a small player and links back here.</p>
        <textarea readonly rows="4" aria-label="Embed code">${esc(embedSnippet(ep))}</textarea>
        <p><button type="button" class="ctl" data-copy-embed>Copy embed code</button> <a class="ep-link" href="/embed/${ep.slug}/" target="_blank" rel="noopener">Preview</a></p>
        <p class="short-link">Short link: <a href="/e/${num.get(ep.slug)}/">medicsmusings.com/e/${num.get(ep.slug)}</a> <button type="button" class="link-btn" data-copy="${SITE}/e/${num.get(ep.slug)}/">Copy</button></p>
      </details>` : '';

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
        image: shareImage(ep).url,
        keywords: (ep.tags || []).map((t) => data.topics[t]).join(', ') || undefined,
        partOfSeries: { '@type': 'PodcastSeries', '@id': `${SITE}/#podcast`, name: 'Medics Musings', url: `${SITE}/` },
        author: [
          { '@type': 'Person', '@id': `${SITE}/#leo`, name: 'Leo A. Gordon, MD' },
          { '@type': 'Person', '@id': `${SITE}/#dan`, name: 'Dan Gardner, MD' },
        ],
        associatedMedia: mediaOf(ep),
        ...(transcript && { transcript: transcript.join('\n\n') }),
        ...(clips.length && { hasPart: clips }),
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

  const chips = tagChips(ep, '/');

  const head = pageHead({
    title: pageTitle,
    description,
    url: ep.url,
    ogTitle: ep.title,
    image: shareImage(ep),
    type: 'article',
    extraMeta: `\n<meta property="article:published_time" content="${ep.date}">` + (ep.audio
      ? `\n<meta property="og:audio" content="${SITE}/${ep.audio}">\n<meta property="og:audio:type" content="audio/mpeg">` : ''),
    ld,
    feeds: feedsFor(data, { topic: (ep.tags || [])[0], series: ep.series }),
  });

  return `${head}
<main>
  <article class="episode" data-slug="${ep.slug}" data-title="${esc(ep.title)}" data-next-url="${next.ep.path}" data-next-title="${esc(next.ep.title)}" data-next-kind="${next.kind}"${ep.spotify ? ` data-spotify="${ep.spotify}"` : ''}>
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/#episodes">Episodes</a></nav>
      <h1>${esc(ep.title)}</h1>
      <p class="ep-meta"><time datetime="${ep.date}">${dateLabel(ep.date)}</time> · ${ep.minutes} min</p>
      ${chips}
      ${player ? `<div class="player">
        ${player}
      </div>` : ''}
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
      </p>${embed}
      ${seriesPanel(ep)}${learnMore}${chapterList}

      <h2>Show notes</h2>
      <div class="notes">
        ${notes}${more}
      </div>${quoteSection}${transcript ? `

      <details class="transcript" id="transcript">
        <summary>Transcript</summary>
        ${transcript.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
      </details>` : ''}
      <p class="satire-note"><b>Satire alert:</b> Medics Musings is medical satire made for entertainment. Characters and stories may be fictional, and nothing in this episode is medical advice.</p>
    </div>
  </article>

  ${upNextSection(next)}

${signupSection(data, { picked: ep.series ? [`series-${ep.series}`] : [] })}

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
<script src="/extras.js" defer></script>
<script src="/episodes/episode.js" defer></script>
</body>
</html>
`;
}

// ---- Topic and series pages ---------------------------------------------------------

const TOPICS_URL = `${SITE}/topics/`;

function collectionCard(e, { showPart = false } = {}) {
  const part = showPart && e.series ? `<span class="coll-part">${esc(partLabel(e))}</span>` : '';
  return `<li>
          <a class="coll-card" href="${e.path}">
            ${part}<span class="coll-title">${esc(e.title)}</span>
            <span class="ep-meta">${dateLabel(e.date)} · ${e.minutes} min</span>
            <span class="coll-desc">${esc(snippet(e.summary, 190))}</span>
          </a>
        </li>`;
}

function browseLinks(current) {
  const topics = Object.entries(data.topics).map(([k, label]) => k === current
    ? `<span class="chip is-current" aria-current="page">${esc(label)}</span>`
    : `<a class="chip" href="/topics/${k}/">${esc(label)}</a>`);
  const series = Object.entries(data.series).map(([k, label]) => k === current
    ? `<span class="chip chip-series is-current" aria-current="page">${esc(label)}</span>`
    : `<a class="chip chip-series" href="/series/${k}/">${esc(label)}</a>`);
  return `<nav class="browse" aria-label="Browse topics and series">
        <p class="chips"><span class="chips-label">Topics</span> ${topics.join(' ')}</p>
        <p class="chips"><span class="chips-label">Series</span> ${series.join(' ')}</p>
      </nav>`;
}

function collectionPage({ url, crumb, eyebrow, heading, intro, list, ordered = false, cta = '', current, pageTitle, faq = [], feeds = [], picked = [] }) {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        url,
        name: pageTitle,
        description: intro,
        isPartOf: { '@id': `${SITE}/#website` },
        about: { '@id': `${SITE}/#podcast` },
        mainEntity: {
          '@type': 'ItemList',
          itemListOrder: ordered ? 'https://schema.org/ItemListOrderAscending' : 'https://schema.org/ItemListOrderDescending',
          numberOfItems: list.length,
          itemListElement: list.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: e.url, name: e.title })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Medics Musings', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Topics & series', item: TOPICS_URL },
          ...(crumb ? [{ '@type': 'ListItem', position: 3, name: crumb, item: url }] : []),
        ],
      },
      ...(faq.length ? [faqLd(faq)] : []),
    ],
  };
  const tag = ordered ? 'ol' : 'ul';
  const feed = feeds.at(-1);
  return `${pageHead({ title: pageTitle, description: snippet(intro), url, ogTitle: heading, image: shareImage(null), ld, feeds })}
<main>
  <section class="collection">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/topics/">Topics &amp; series</a>${crumb ? ` <span aria-hidden="true">/</span> <span>${esc(crumb)}</span>` : ''}</nav>
      <span class="eyebrow">${esc(eyebrow)}</span>
      <h1>${esc(heading)}</h1>
      <p class="coll-intro">${esc(intro)}</p>
      ${cta}
      <${tag} class="coll-list">
        ${list.map((e) => collectionCard(e, { showPart: ordered })).join('\n        ')}
      </${tag}>${feed && picked.length ? `
      <p class="feed-line">Follow just ${esc(heading)}: <a href="#newsletter">by email</a> · <a href="${feed.href}">RSS feed</a> <button type="button" class="link-btn" data-copy="${feed.href}">Copy feed URL</button></p>` : ''}
      ${faqSection(faq)}
      ${browseLinks(current)}
    </div>
  </section>

${signupSection(data, { picked, heading: picked.length ? `${heading} episodes, straight to your inbox.` : undefined })}
</main>

${footer()}

<script src="/signup.js" defer></script>
<script src="/site.js" defer></script>
<script src="/extras.js" defer></script>
</body>
</html>
`;
}

const NOT_ADVICE = 'No. Medics Musings is satire made for entertainment by two physicians. Episodes are AI-generated conversations; characters, stories and some “facts” are fictional. For medical questions, see your own clinician.';
const titleList = (list) => list.map((e) => e.title).join('; ');
const explainersFor = (pred) => explainers.filter(pred);

function topicFaq(key, label, list) {
  const pick = list.includes(startHere) ? startHere : list[0];
  const faq = [
    { q: `Which Medics Musings episodes are about ${label.toLowerCase()}?`, a: `${list.length} so far: ${titleList(list)}.` },
    { q: `Where should I start with the ${label.toLowerCase()} episodes?`, a: `Try “${pick.title}” (${pick.minutes} min): ${snippet(pick.summary, 200)}` },
  ];
  const exps = explainersFor((x) => (x.topics || []).includes(key));
  if (exps.length) faq.push({ q: 'Where can I read about the real medicine behind the jokes?', a: `Our plain-English explainers cover it: ${exps.map((x) => x.title).join('; ')}. Find them at medicsmusings.com/explained.` });
  faq.push({ q: 'Is Medics Musings medical advice?', a: NOT_ADVICE });
  return faq;
}

function seriesFaq(label, list) {
  const total = list.reduce((n, e) => n + e.minutes, 0);
  return [
    { q: `In what order should I listen to ${label}?`, a: `In this order: ${list.map((e) => `${partLabel(e)}, “${e.title}”`).join('; ')}.` },
    { q: `How long is ${label}?`, a: `${list.length} parts, about ${total} minutes in total.` },
    { q: 'Is Medics Musings medical advice?', a: NOT_ADVICE },
  ];
}

function topicPage(key) {
  const label = data.topics[key];
  const list = episodes.filter((e) => (e.tags || []).includes(key));
  return collectionPage({
    url: `${SITE}/topics/${key}/`,
    crumb: label,
    eyebrow: `Topic · ${list.length} episode${list.length === 1 ? '' : 's'}`,
    heading: label,
    intro: data.topicIntros?.[key] || `Medics Musings episodes about ${label.toLowerCase()}.`,
    list,
    current: key,
    pageTitle: `${label} Episodes — Medics Musings Medical Satire Podcast`,
    faq: topicFaq(key, label, list),
    feeds: feedsFor(data, { topic: key }),
    picked: [key],
  });
}

function seriesPage(key) {
  const label = data.series[key];
  const list = partsOf(key);
  const first = list[0];
  return collectionPage({
    url: `${SITE}/series/${key}/`,
    crumb: label,
    eyebrow: `Series · ${list.length} parts`,
    heading: label,
    intro: data.seriesIntros?.[key] || `Every part of ${label}, in order.`,
    list,
    ordered: true,
    cta: `<p><a class="btn btn-primary" href="${first.path}?autoplay=1">▶ Start with ${esc(partLabel(first))}</a></p>`,
    current: key,
    pageTitle: `${label} (Series) — Medics Musings Medical Satire Podcast`,
    faq: seriesFaq(label, list),
    feeds: feedsFor(data, { series: key }),
    picked: [`series-${key}`],
  });
}

function hubPage() {
  const block = (href, label, intro, count, unit) => `<li>
          <a class="coll-card" href="${href}">
            <span class="coll-title">${esc(label)}</span>
            <span class="ep-meta">${count} ${unit}</span>
            <span class="coll-desc">${esc(snippet(intro, 190))}</span>
          </a>
        </li>`;
  const topics = Object.entries(data.topics).map(([k, label]) =>
    block(`/topics/${k}/`, label, data.topicIntros?.[k] || '', episodes.filter((e) => (e.tags || []).includes(k)).length, 'episodes'));
  const series = Object.entries(data.series).map(([k, label]) =>
    block(`/series/${k}/`, label, data.seriesIntros?.[k] || '', partsOf(k).length, 'parts'));
  const intro = 'Browse every Medics Musings episode by topic or series: AI and technology, surgery, aging, the mind, hospital life and culture, plus the multi-part Pax Inguinalis summit.';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: TOPICS_URL,
    name: 'Topics & series',
    description: intro,
    isPartOf: { '@id': `${SITE}/#website` },
  };
  return `${pageHead({ title: 'Topics & Series — Medics Musings Medical Satire Podcast', description: intro, url: TOPICS_URL, ogTitle: 'Medics Musings: topics & series', image: shareImage(null), ld })}
<main>
  <section class="collection">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <span>Topics &amp; series</span></nav>
      <span class="eyebrow">Browse</span>
      <h1>Topics &amp; series</h1>
      <p class="coll-intro">${esc(intro)}</p>
      <h2>Topics</h2>
      <ul class="coll-list">
        ${topics.join('\n        ')}
      </ul>
      <h2>Series</h2>
      <ul class="coll-list">
        ${series.join('\n        ')}
      </ul>
    </div>
  </section>

${signupSection(data)}
</main>

${footer()}

<script src="/signup.js" defer></script>
<script src="/site.js" defer></script>
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

writePage('topics', hubPage());
for (const k of Object.keys(data.topics)) writePage(`topics/${k}`, topicPage(k));
for (const k of Object.keys(data.series)) writePage(`series/${k}`, seriesPage(k));

const extras = buildExtras({ data, episodes, bySlug, num, quotes, collectionCard });

// Sitemap
const newest = episodes[0].date;
const urls = [
  { loc: `${SITE}/`, lastmod: newest, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE}/tools.html`, lastmod: '2026-09-25', changefreq: 'monthly', priority: '0.6' },
  { loc: TOPICS_URL, lastmod: newest, changefreq: 'weekly', priority: '0.7' },
  ...Object.keys(data.topics).map((k) => ({
    loc: `${SITE}/topics/${k}/`, changefreq: 'weekly', priority: '0.7',
    lastmod: episodes.find((e) => (e.tags || []).includes(k))?.date || newest,
  })),
  ...Object.keys(data.series).map((k) => ({
    loc: `${SITE}/series/${k}/`, changefreq: 'monthly', priority: '0.7',
    lastmod: partsOf(k).map((e) => e.date).sort().pop() || newest,
  })),
  ...episodes.map((e) => ({ loc: e.url, lastmod: e.date, changefreq: 'yearly', priority: '0.8' })),
  ...extras.sitemap,
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
  '/signup.js', '/feedback.js', '/player.js', '/discover.js', '/site.js', '/extras.js',
  '/favicon.svg', '/icon-192.png', '/icon-512.png', '/channel-poster.webp', '/host-leo.jpg', '/host-dan.jpg',
].filter((u) => u === '/' || existsSync(join(ROOT, u.slice(1))));
const hash = createHash('sha1');
for (const u of PRECACHE) hash.update(read(u === '/' ? 'index.html' : u.slice(1)));
for (const e of episodes) hash.update(read(`episodes/${e.slug}/index.html`));
for (const k of Object.keys(data.topics)) hash.update(read(`topics/${k}/index.html`));
for (const k of Object.keys(data.series)) hash.update(read(`series/${k}/index.html`));
for (const rel of extras.pages) hash.update(read(`${rel}/index.html`));
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

console.log(`Built ${episodes.length} episode pages, ${Object.keys(data.topics).length} topic and ${Object.keys(data.series).length} series pages, ${extras.explainers.length} explainers, ${extras.guides.length} teaching guides, embeds, short links and feeds; updated index.html, sitemap.xml and sw.js.`);
