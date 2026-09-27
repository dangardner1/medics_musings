// Shared pieces for the generated pages: site constants, escaping, the page
// head/topbar, the newsletter block and the footer. Used by build-episodes.mjs
// and build-extras.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SITE = 'https://www.medicsmusings.com';
export const SHOW = {
  spotify: 'https://open.spotify.com/show/7zknqhZkTKZ8WA8SuMlWlj',
  apple: 'https://podcasts.apple.com/us/podcast/medics-musings/id1780716650',
  youtube: 'https://www.youtube.com/@MedicsMusings',
  rss: 'https://anchor.fm/s/117844514/podcast/rss',
  overcast: 'https://overcast.fm/itunes1780716650',
  pocketcasts: 'https://pca.st/itunes/1780716650',
  amazon: 'https://music.amazon.com/search/Medics%20Musings',
};
export const INBOX = 'BialystockMDandBloomMD@Gmail.com';

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
export const jsonLd = (data) => JSON.stringify(data, null, 1).replace(/</g, '\\u003c');
export const read = (p) => readFileSync(join(ROOT, p), 'utf8');
export const readJson = (p, fallback) => (existsSync(join(ROOT, p)) ? JSON.parse(read(p)) : fallback);
export const dateLabel = (iso) => new Date(iso + 'T12:00:00Z')
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Trim to a search-snippet length on a word boundary.
export function snippet(text, max = 158) {
  const t = text.replace(/\s+/g, ' ').replace(/…$/, '').trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(' ', max - 1)).replace(/[\s,;:.—-]+$/, '') + '…';
}

// Spotify show notes sometimes arrive with paragraph breaks stripped
// ("medicine.From the"), so split where a sentence runs into the next capital.
export function paragraphs(text) {
  const blocks = text.includes('\n\n') ? text.split(/\n\n+/) : text.split(/(?<=[a-z)][.!?])(?=[A-Z])/);
  return blocks.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
export const flat = (text) => text.replace(/\s+/g, ' ').trim();

// 0:00 / 1:02:03 style timestamps.
export function clock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export const writePage = (rel, html) => {
  mkdirSync(join(ROOT, rel), { recursive: true });
  writeFileSync(join(ROOT, rel, 'index.html'), html);
};

// Per-episode share image made by scripts/make-share-images.py, else the show's.
export function shareImage(ep) {
  if (ep && existsSync(join(ROOT, 'og', `${ep.slug}.jpg`))) {
    return { url: `${SITE}/og/${ep.slug}.jpg`, alt: `${ep.title}: a Medics Musings episode` };
  }
  return { url: `${SITE}/og-image.jpg`, alt: 'Medics Musings podcast artwork featuring hosts Leo A. Gordon, MD and Dan Gardner, MD' };
}

export function pageHead({ title, description, url, ogTitle, image, type = 'website', extraMeta = '', ld, robots = 'index, follow, max-image-preview:large', feeds = [] }) {
  const feedLinks = feeds.map((f) => `\n<link rel="alternate" type="application/rss+xml" title="${esc(f.title)}" href="${f.href}">`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="canonical" href="${url}">
<meta name="robots" content="${robots}">
<meta name="author" content="Leo A. Gordon, MD and Dan Gardner, MD">
<meta name="theme-color" content="#0b0f14">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Medics Musings">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${image.url}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(image.alt)}">
<meta property="og:locale" content="en_US">${extraMeta}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle || title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${image.url}">
<link rel="alternate" type="application/rss+xml" title="Medics Musings podcast feed" href="${SHOW.rss}">${feedLinks}
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
    <nav class="topnav" aria-label="Site">
      <a href="/explained/">Explainers</a>
      <a href="/teach/">Teach</a>
      <a href="/eponyms/">Eponyms</a>
      <a href="/timeline/">Timeline</a>
      <a href="/submit/">Submit</a>
    </nav>
    <a class="btn btn-ghost" href="/#episodes">All episodes</a>
  </div>
</header>
`;
}

// Topic/series choices for the email signup. `picked` pre-ticks one (e.g. on its topic page).
export function prefChoices(data, picked = []) {
  const box = (value, label) => `<label class="pref"><input type="checkbox" name="topics" value="${value}"${picked.includes(value) ? ' checked' : ''}> ${esc(label)}</label>`;
  return [
    ...Object.entries(data.topics).map(([k, label]) => box(k, label)),
    ...Object.entries(data.series).map(([k, label]) => box(`series-${k}`, label)),
  ].join('\n            ');
}

export function signupSection(data, { location = 'episode_page', picked = [], heading = 'New episodes, straight to your inbox.' } = {}) {
  const open = picked.length ? ' open' : '';
  return `  <section class="newsletter" id="newsletter">
    <div class="wrap">
      <span class="eyebrow">Refill Reminder</span>
      <h2>${esc(heading)}</h2>
      <p class="newsletter-sub">One short email when a new episode drops. No spam, no upsell, no prior authorization. By subscribing you agree to get these emails; unsubscribe anytime.</p>
      <form class="signup" data-location="${location}">
        <label class="sr-only" for="signup-email">Email address</label>
        <input id="signup-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
        <button type="submit" class="btn btn-primary">Subscribe</button>
        <details class="signup-prefs"${open}>
          <summary>Only want some topics?</summary>
          <p class="prefs-note">Tick what you want. Leave everything blank to get every episode.</p>
          <div class="prefs">
            ${prefChoices(data, picked)}
          </div>
        </details>
        <p class="signup-status" role="status" aria-live="polite"></p>
      </form>
      <p class="newsletter-alt">Prefer a feed reader? <a href="/subscribe/">RSS feeds for every topic and series →</a></p>
    </div>
  </section>`;
}

export const footer = () => `<footer>
  <div class="wrap footer-nav">
    <a href="/#about">About</a>
    <a href="/#episodes">All episodes</a>
    <a href="/topics/">Topics</a>
    <a href="/explained/">Explainers</a>
    <a href="/teach/">Teaching guides</a>
    <a href="/eponyms/">Eponym index</a>
    <a href="/timeline/">History timeline</a>
    <a href="/submit/">Submit a story</a>
    <a href="/subscribe/">Subscribe</a>
    <a href="mailto:${INBOX}">Contact</a>
    <span>© 2026 Medics Musings Productions — no prior authorization required.</span>
  </div>
  <div class="wrap">
    <p class="disclaimer"><b>For entertainment only.</b> Medics Musings episodes are satirical, AI-generated conversations; characters, stories and “facts” may be fictional. Nothing on this site, including the AI chat assistant, is medical advice or creates a doctor–patient relationship. For medical concerns, see your own clinician. In an emergency, call 911.</p>
  </div>
</footer>`;
