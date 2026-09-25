// Builds a standalone page for every episode card in index.html:
//   episodes/<card id>/index.html  ->  https://www.medicsmusings.com/episodes/<card id>/
// then points the homepage's episode titles, share links and JSON-LD at those
// pages and rewrites sitemap.xml. index.html stays the single source of truth,
// so re-run this after adding or editing an episode card:
//   node scripts/build-episodes.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.medicsmusings.com';
const SHOW = {
  spotify: 'https://open.spotify.com/show/7zknqhZkTKZ8WA8SuMlWlj',
  apple: 'https://podcasts.apple.com/us/podcast/medics-musings/id1780716650',
  youtube: 'https://www.youtube.com/@MedicsMusings',
  rss: 'https://anchor.fm/s/117844514/podcast/rss',
};
const INBOX = 'BialystockMDandBloomMD@Gmail.com';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const jsonLd = (data) => JSON.stringify(data, null, 1).replace(/</g, '\\u003c');

// Trim to a search-snippet length on a word boundary.
function summary(text, max = 158) {
  const t = text.replace(/\s+/g, ' ').replace(/…$/, '').trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(' ', max - 1)).replace(/[\s,;:.—-]+$/, '') + '…';
}

// Spotify show notes arrive with paragraph breaks stripped ("medicine.From the"),
// so split where a sentence runs straight into the next capital.
function paragraphs(text) {
  return text.split(/(?<=[a-z)][.!?])(?=[A-Z])/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// ---- Read episodes from index.html -------------------------------------------

const indexPath = join(ROOT, 'index.html');
let html = readFileSync(indexPath, 'utf8');

const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
const series = graph.find((n) => n['@type'] === 'PodcastSeries');
const ldByName = new Map(series.episode.map((e) => [e.name, e]));

const CARD = /<article class="ep-card" id="([^"]+)">([\s\S]*?)<\/article>/g;
const episodes = [...html.matchAll(CARD)].map(([, slug, body]) => {
  const title = decode(body.match(/<h3>([\s\S]*?)<\/h3>/)[1].replace(/<[^>]+>/g, '')).trim();
  const meta = body.match(/<time datetime="([^"]+)">([^<]+)<\/time> · ([^<]+)<\/p>/);
  const ld = ldByName.get(title);
  if (!meta) throw new Error(`Episode card "${slug}" has no date/length line`);
  if (!ld) throw new Error(`No JSON-LD PodcastEpisode named "${title}" (card "${slug}")`);
  return {
    slug,
    title,
    date: meta[1],
    dateLabel: meta[2],
    length: meta[3].trim(),
    spotifyId: (body.match(/data-ep="([^"]+)"/) || [])[1],
    audio: (body.match(/<audio class="ep-audio"[^>]* src="([^"]+)"/) || [])[1],
    ld,
    url: `${SITE}/episodes/${slug}/`,
  };
});
if (!episodes.length) throw new Error('No episode cards found in index.html');

// ---- Shared page pieces ------------------------------------------------------

const signupSection = () => `  <section class="newsletter" id="newsletter">
    <div class="wrap">
      <span class="eyebrow">Refill Reminder</span>
      <h2>New episodes, straight to your inbox.</h2>
      <p class="newsletter-sub">One short email when a new episode drops. No spam, no upsell, no prior authorization. Unsubscribe anytime.</p>
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
  return `<a class="ep-nav-link" href="/episodes/${ep.slug}/" rel="${rel}">
        <span class="eyebrow">${label}</span>
        <span class="ep-nav-title">${esc(ep.title)}</span>
      </a>`;
}

function episodePage(ep, newer, older) {
  const description = summary(ep.ld.description);
  const pageTitle = `${ep.title} — Medics Musings Podcast`;
  const truncated = ep.ld.description.trim().endsWith('…');
  const spotifyUrl = ep.spotifyId && `https://open.spotify.com/episode/${ep.spotifyId}`;

  const player = ep.audio
    ? `<audio class="ep-audio" controls preload="metadata" src="/${ep.audio}" aria-label="Play ${esc(ep.title)}"></audio>`
    : `<div class="ep-embed">
          <iframe title="${esc(ep.title)}" src="https://open.spotify.com/embed/episode/${ep.spotifyId}?utm_source=generator" width="100%" height="152" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
        </div>`;

  const links = [
    spotifyUrl && `<a class="ep-link" href="${spotifyUrl}" target="_blank" rel="noopener" data-platform="spotify">Open in Spotify</a>`,
    ep.audio && `<a class="ep-link" href="/${ep.audio}" download>Download MP3</a>`,
  ].filter(Boolean).join('\n        ');

  const notes = paragraphs(ep.ld.description).map((p) => `<p>${esc(p)}</p>`).join('\n        ');
  const more = truncated && spotifyUrl
    ? `\n        <p><a class="ep-link" href="${spotifyUrl}" target="_blank" rel="noopener" data-platform="spotify">Full show notes on Spotify</a></p>`
    : '';

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'PodcastEpisode',
        '@id': `${ep.url}#episode`,
        url: ep.url,
        name: ep.title,
        datePublished: ep.date,
        timeRequired: ep.ld.timeRequired,
        description: ep.ld.description,
        inLanguage: 'en',
        image: `${SITE}/channel-poster.jpg`,
        partOfSeries: { '@type': 'PodcastSeries', '@id': `${SITE}/#podcast`, name: 'Medics Musings', url: `${SITE}/` },
        author: [
          { '@type': 'Person', '@id': `${SITE}/#leo`, name: 'Leo A. Gordon, MD' },
          { '@type': 'Person', '@id': `${SITE}/#dan`, name: 'Dan Gardner, MD' },
        ],
        associatedMedia: ep.ld.associatedMedia,
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
  <article class="episode" data-slug="${ep.slug}">
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/#episodes">Episodes</a></nav>
      <h1>${esc(ep.title)}</h1>
      <p class="ep-meta"><time datetime="${ep.date}">${esc(ep.dateLabel)}</time> · ${esc(ep.length)}</p>
      <div class="player">
        ${player}
      </div>
      <div class="ep-actions">
        <button type="button" class="btn btn-primary ep-share" data-share-url="${ep.url}" data-share-title="${esc(ep.title)} — Medics Musings">Share</button>
        ${links}
      </div>
      <p class="follow-line">Follow the show:
        <a href="${SHOW.spotify}" target="_blank" rel="noopener" data-platform="spotify">Spotify</a> ·
        <a href="${SHOW.apple}" target="_blank" rel="noopener" data-platform="apple">Apple Podcasts</a> ·
        <a href="${SHOW.youtube}" target="_blank" rel="noopener" data-platform="youtube">YouTube</a> ·
        <a href="${SHOW.rss}" target="_blank" rel="noopener" data-platform="rss">RSS</a>
      </p>

      <h2>Show notes</h2>
      <div class="notes">
        ${notes}${more}
      </div>
      <p class="satire-note"><b>Satire alert:</b> Medics Musings is medical satire made for entertainment. Characters and stories may be fictional, and nothing in this episode is medical advice.</p>
    </div>
  </article>

${signupSection()}

  <nav class="wrap ep-nav" aria-label="More episodes">
    ${neighbour(newer, '← Newer episode', 'prev')}
    ${neighbour(older, 'Older episode →', 'next')}
  </nav>
</main>

${footer()}

<script src="/signup.js" defer></script>
<script src="/episodes/episode.js" defer></script>
</body>
</html>
`;
}

// ---- Write episode pages -----------------------------------------------------

episodes.forEach((ep, i) => {
  const dir = join(ROOT, 'episodes', ep.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), episodePage(ep, episodes[i - 1], episodes[i + 1]));
});

// ---- Point the homepage at the episode pages ---------------------------------

html = html.replace(CARD, (card, slug, body) => {
  const ep = episodes.find((e) => e.slug === slug);
  const next = body
    .replace(/<h3>([\s\S]*?)<\/h3>/, (_, inner) =>
      `<h3><a href="episodes/${slug}/">${inner.replace(/<[^>]+>/g, '')}</a></h3>`)
    .replace(/data-share-url="[^"]*"/, `data-share-url="${ep.url}"`);
  return `<article class="ep-card" id="${slug}">${next}</article>`;
});

for (const ep of episodes) {
  const pattern = new RegExp(`("name": ${JSON.stringify(ep.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\\s*"url": )"[^"]*"`);
  if (!pattern.test(html)) throw new Error(`Could not find JSON-LD url for "${ep.title}"`);
  html = html.replace(pattern, `$1"${ep.url}"`);
}
writeFileSync(indexPath, html);

// ---- Sitemap -----------------------------------------------------------------

const newest = episodes.map((e) => e.date).sort().pop();
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

console.log(`Built ${episodes.length} episode pages, updated index.html and sitemap.xml.`);
