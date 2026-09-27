// Pages beyond the episode catalogue, built by build-episodes.mjs:
//   explained/            plain-English explainers (data/explainers.json), with FAQPage markup
//   teach/                discussion guides for teaching (data/teaching.json)
//   submit/               listener story and guest submissions (sent through Formspree)
//   subscribe/            email-by-topic signup and the RSS feeds
//   feeds/*.xml           RSS for all episodes, each topic and each series
//   embed/<slug>/         a compact player other sites can put in an <iframe>
//   e/<n>/                short links (medicsmusings.com/e/12) used on clips and cards
//   episodes/<slug>/quotes/<n>/  share pages for quote cards (og/quotes/<slug>-<n>.jpg)
// Returns the sitemap entries for the indexable ones.
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, SITE, SHOW, INBOX, esc, jsonLd, readJson, dateLabel, snippet, clock,
  writePage, shareImage, pageHead, signupSection, footer, prefChoices,
} from './lib/page.mjs';

const EXPLAINED_URL = `${SITE}/explained/`;
const TEACH_URL = `${SITE}/teach/`;

const scripts = (...names) => names.map((n) => `<script src="/${n}" defer></script>`).join('\n');

function crumbs(items) {
  const parts = [`<a href="/">Home</a>`];
  items.forEach(([label, href]) => parts.push(href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`));
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join(' <span aria-hidden="true">/</span> ')}</nav>`;
}

function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [['Medics Musings', `${SITE}/`], ...items].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

const faqLd = (faq) => ({
  '@type': 'FAQPage',
  mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

export function faqSection(faq, heading = 'Frequently asked questions') {
  if (!faq?.length) return '';
  return `<section class="faq" aria-label="${esc(heading)}">
        <h2>${esc(heading)}</h2>
        ${faq.map(({ q, a }) => `<details class="faq-item">
          <summary>${esc(q)}</summary>
          <p>${esc(a)}</p>
        </details>`).join('\n        ')}
      </section>`;
}
export { faqLd };

const pageEnd = (data, { signup = true, js = ['signup.js', 'site.js'] } = {}) => `${signup ? signupSection(data) : ''}
</main>

${footer()}

${scripts(...js)}
</body>
</html>
`;

// ---- Explainers ------------------------------------------------------------------

function explainerPage(x, ctx) {
  const url = `${EXPLAINED_URL}${x.slug}/`;
  const eps = x.episodes.map((s) => ctx.bySlug.get(s)).filter(Boolean);
  const related = (x.related || []).map((s) => ctx.explainers.find((e) => e.slug === s)).filter(Boolean);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: x.title,
        description: x.summary,
        url,
        image: shareImage(null).url,
        inLanguage: 'en',
        about: { '@type': 'Thing', name: x.term },
        author: { '@type': 'Organization', name: 'Medics Musings', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'Medics Musings Productions', url: `${SITE}/` },
        isPartOf: { '@id': `${SITE}/#website` },
        mentions: eps.map((e) => ({ '@type': 'PodcastEpisode', name: e.title, url: e.url })),
      },
      faqLd(x.faq),
      breadcrumbLd([['Explainers', EXPLAINED_URL], [x.title, url]]),
    ],
  };
  const body = x.sections.map((s) => `<h2>${esc(s.h)}</h2>
        ${s.p.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}`).join('\n        ');
  return `${pageHead({ title: `${x.seoTitle} | Medics Musings`, description: x.summary, url, ogTitle: x.title, image: shareImage(null), type: 'article', ld })}
<main>
  <article class="explainer">
    <div class="wrap">
      ${crumbs([['Explainers', '/explained/'], [x.term]])}
      <span class="eyebrow">Explained · the real medicine behind the jokes</span>
      <h1>${esc(x.title)}</h1>
      <p class="dek">${esc(x.dek)}</p>
      <div class="prose">
        ${body}
      </div>
      ${faqSection(x.faq)}
      <section class="hear-it" aria-label="Episodes about this">
        <h2>Hear it on the show</h2>
        <ul class="coll-list">
          ${eps.map((e) => ctx.collectionCard(e)).join('\n          ')}
        </ul>
      </section>${related.length ? `
      <p class="related">Related: ${related.map((r) => `<a href="/explained/${r.slug}/">${esc(r.title)}</a>`).join(' · ')}</p>` : ''}
      <p class="satire-note"><b>Not medical advice.</b> This page is general information, written to explain terms our satire leans on; it isn't a substitute for advice from your own clinician. In an emergency, call 911.</p>
    </div>
  </article>

${pageEnd(ctx.data)}`;
}

function explainedHub(ctx) {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        url: EXPLAINED_URL,
        name: 'Medical terms, explained',
        description: ctx.explainedData.intro,
        isPartOf: { '@id': `${SITE}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: ctx.explainers.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: `${EXPLAINED_URL}${x.slug}/`, name: x.title })),
        },
      },
      breadcrumbLd([['Explainers', EXPLAINED_URL]]),
    ],
  };
  return `${pageHead({ title: 'Medical Terms Explained: Prior Authorization, AI Scribes, Hernias and More | Medics Musings', description: snippet(ctx.explainedData.intro), url: EXPLAINED_URL, ogTitle: 'Medical terms, explained', image: shareImage(null), ld })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Explainers']])}
      <span class="eyebrow">Explained</span>
      <h1>Medical terms, explained</h1>
      <p class="coll-intro">${esc(ctx.explainedData.intro)}</p>
      <ul class="coll-list">
        ${ctx.explainers.map((x) => `<li>
          <a class="coll-card" href="/explained/${x.slug}/">
            <span class="coll-part">${esc(x.term)}</span>
            <span class="coll-title">${esc(x.title)}</span>
            <span class="coll-desc">${esc(snippet(x.dek, 170))}</span>
          </a>
        </li>`).join('\n        ')}
      </ul>
    </div>
  </section>

${pageEnd(ctx.data)}`;
}

// ---- Teaching guides ---------------------------------------------------------------

function embedFrame(ep, lazy = true) {
  return `<iframe class="embed-frame" src="/embed/${ep.slug}/" title="${esc(ep.title)} — Medics Musings player" height="${embedHeight(ep)}"${lazy ? ' loading="lazy"' : ''}></iframe>`;
}

function teachPage(g, ctx) {
  const ep = ctx.bySlug.get(g.slug);
  const url = `${TEACH_URL}${g.slug}/`;
  const explainers = (g.explainers || []).map((s) => ctx.explainers.find((e) => e.slug === s)).filter(Boolean);
  const title = `Teaching guide: ${ep.title}`;
  const description = snippet(`Free discussion guide for ${g.theme.toLowerCase()}: learning objectives, discussion questions and an activity built around the Medics Musings episode “${ep.title}”.`);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LearningResource',
        '@id': `${url}#guide`,
        name: title,
        description,
        url,
        learningResourceType: 'Discussion guide',
        educationalUse: 'Group discussion',
        audience: { '@type': 'EducationalAudience', audienceType: g.audience },
        teaches: g.objectives,
        isAccessibleForFree: true,
        inLanguage: 'en',
        isBasedOn: { '@type': 'PodcastEpisode', name: ep.title, url: ep.url },
        publisher: { '@type': 'Organization', name: 'Medics Musings Productions', url: `${SITE}/` },
      },
      breadcrumbLd([['Teaching guides', TEACH_URL], [ep.title, url]]),
    ],
  };
  return `${pageHead({ title: `${title} | Medics Musings`, description, url, ogTitle: title, image: shareImage(ep), ld })}
<main>
  <article class="guide">
    <div class="wrap">
      ${crumbs([['Teaching guides', '/teach/'], [ep.title]])}
      <span class="eyebrow">Teaching guide · ${esc(g.theme)}</span>
      <h1>${esc(ep.title)}</h1>
      <dl class="guide-meta">
        <div><dt>For</dt><dd>${esc(g.audience)}</dd></div>
        <div><dt>Episode</dt><dd>${ep.minutes} min</dd></div>
        <div><dt>Session</dt><dd>${esc(g.time)}</dd></div>
      </dl>
      <div class="guide-player no-print">${embedFrame(ep, false)}</div>
      <p class="no-print guide-actions"><a class="btn btn-primary" href="${ep.path}">Episode page &amp; transcript</a> <button type="button" class="btn btn-ghost" data-print>Print this guide</button></p>
      <p class="print-only">Listen: ${ep.url}</p>
      <div class="prose">
        <h2>Learning objectives</h2>
        <p>After listening and discussing, participants should be able to:</p>
        <ol>
          ${g.objectives.map((o) => `<li>${esc(o)}</li>`).join('\n          ')}
        </ol>
        <h2>Discussion questions</h2>
        <ol class="questions">
          ${g.questions.map((q) => `<li>${esc(q)}</li>`).join('\n          ')}
        </ol>
        <h2>Quick activity</h2>
        <p>${esc(g.activity)}</p>
        <h2>How to run it</h2>
        <p>Play the episode together (${ep.minutes} minutes) or assign it beforehand. Start with the first question to let people react to the humor, then move to the harder ones. Remind the group that the episode is satire and some of its “facts” are invented; spotting which ones is a good exercise in itself.</p>${explainers.length ? `
        <h2>Background reading</h2>
        <ul>
          ${explainers.map((x) => `<li><a href="/explained/${x.slug}/">${esc(x.title)}</a></li>`).join('\n          ')}
        </ul>` : ''}
      </div>
      <p class="satire-note"><b>Free to use.</b> ${esc(ctx.teachData.note)} Tell us how it went: <a href="/submit/?type=teaching">send feedback</a>.</p>
    </div>
  </article>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

function teachHub(ctx) {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        url: TEACH_URL,
        name: 'Teach with Medics Musings',
        description: ctx.teachData.intro,
        isPartOf: { '@id': `${SITE}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: ctx.guides.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${TEACH_URL}${g.slug}/`, name: ctx.bySlug.get(g.slug).title })),
        },
      },
      breadcrumbLd([['Teaching guides', TEACH_URL]]),
    ],
  };
  return `${pageHead({ title: 'Teach With Medics Musings: Free Discussion Guides for Residency and Med School | Medics Musings', description: snippet(ctx.teachData.intro), url: TEACH_URL, ogTitle: 'Teach with Medics Musings', image: shareImage(null), ld })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Teaching guides']])}
      <span class="eyebrow">Grand rounds kit</span>
      <h1>Teach with Medics Musings</h1>
      <p class="coll-intro">${esc(ctx.teachData.intro)}</p>
      <ul class="coll-list">
        ${ctx.guides.map((g) => {
          const ep = ctx.bySlug.get(g.slug);
          return `<li>
          <a class="coll-card" href="/teach/${g.slug}/">
            <span class="coll-part">${esc(g.theme)}</span>
            <span class="coll-title">${esc(ep.title)}</span>
            <span class="ep-meta">${ep.minutes} min episode · ${esc(g.time)} session</span>
            <span class="coll-desc">For ${esc(g.audience.charAt(0).toLowerCase() + g.audience.slice(1))}</span>
          </a>
        </li>`;
        }).join('\n        ')}
      </ul>
      <p class="satire-note"><b>Note:</b> ${esc(ctx.teachData.note)} Want a guide for another episode? <a href="/submit/?type=teaching">Ask us</a>.</p>
    </div>
  </section>

${pageEnd(ctx.data)}`;
}

// ---- Submit ----------------------------------------------------------------------

function submitPage(ctx) {
  const url = `${SITE}/submit/`;
  const description = 'Send Medics Musings your worst prior authorization saga, hospital phone-tree nightmare or waiting-room story, or pitch yourself as a guest. If we use it, we’ll send you the episode.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'ContactPage', url, name: 'Submit a story to Medics Musings', description, isPartOf: { '@id': `${SITE}/#website` } },
      breadcrumbLd([['Submit a story', url]]),
    ],
  };
  return `${pageHead({ title: 'Submit Your Worst Healthcare Story or Pitch a Guest Spot | Medics Musings', description, url, ogTitle: 'Tell us your worst healthcare story', image: shareImage(null), ld })}
<main>
  <section class="collection submit">
    <div class="wrap">
      ${crumbs([['Submit a story']])}
      <span class="eyebrow">Patient intake · no prior authorization required</span>
      <h1>Tell us your worst healthcare story</h1>
      <p class="coll-intro">The prior authorization that took longer than the pregnancy. The hospital voicemail tree with no exit. The waiting room with a TV stuck on a cooking show. Clinicians, patients and caregivers: send us the absurd, and we may turn it into an episode or read it on air. If we use it, we’ll email you the link so you can tell everyone you’re famous.</p>

      <form class="story-form" id="story-form" novalidate>
        <label for="st-type">What are you sending?</label>
        <select id="st-type" name="type">
          <option value="prior-auth">A prior authorization saga</option>
          <option value="voicemail">A hospital phone or voicemail nightmare</option>
          <option value="waiting-room">A waiting-room, billing or paperwork story</option>
          <option value="ai">An AI-in-healthcare moment</option>
          <option value="clinician">A story from the clinician side</option>
          <option value="guest">I want to be a guest</option>
          <option value="teaching">Feedback on a teaching guide</option>
          <option value="other">Something else</option>
        </select>

        <label for="st-story">Your story</label>
        <textarea id="st-story" name="story" rows="8" required placeholder="What happened? The more specific the absurdity, the better."></textarea>
        <p class="field-note"><b>Please leave out anything that could identify a patient</b>: names, dates, record numbers, photos. Change details if you need to. We can’t accept protected health information.</p>

        <div class="guest-only" hidden>
          <label for="st-pitch">Guest pitch: who are you, and what would you talk about?</label>
          <textarea id="st-pitch" name="pitch" rows="4" placeholder="Your specialty or role, a topic you'd be funny about, and a link to your work or socials."></textarea>
        </div>

        <div class="row">
          <div>
            <label for="st-name">Name or credit line</label>
            <input id="st-name" name="name" autocomplete="name" placeholder="e.g. “Dr. K., hospitalist in Ohio”">
          </div>
          <div>
            <label for="st-role">You are a…</label>
            <select id="st-role" name="role">
              <option>Patient or family member</option>
              <option>Physician</option>
              <option>Nurse</option>
              <option>Resident or student</option>
              <option>Other healthcare worker</option>
              <option>Just a listener</option>
            </select>
          </div>
        </div>

        <label for="st-email">Email (so we can send you the episode)</label>
        <input id="st-email" name="email" type="email" autocomplete="email" placeholder="you@example.com">

        <fieldset>
          <legend>Credit</legend>
          <label class="check"><input type="radio" name="credit" value="name" checked> Credit me by the name above</label>
          <label class="check"><input type="radio" name="credit" value="anonymous"> Keep me anonymous</label>
        </fieldset>
        <label class="check"><input type="checkbox" name="permission" required> I give Medics Musings permission to adapt this story for the podcast, website and social media.</label>
        <label class="check"><input type="checkbox" name="no_phi" required> My story doesn’t include information that could identify a patient.</label>
        <input class="hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit" class="btn btn-primary">Send it in</button>
        <p class="signup-status" role="status" aria-live="polite"></p>
      </form>
      <p class="field-note">Prefer email? Write to <a href="mailto:${INBOX}">${INBOX}</a>. Episodes are satire; we may change details, combine stories and exaggerate wildly. That’s the job.</p>
    </div>
  </section>

${pageEnd(ctx.data, { signup: false, js: ['site.js', 'extras.js'] })}`;
}

// ---- Subscribe + feeds --------------------------------------------------------------

const feedHref = (kind, key) => (kind === 'all' ? `${SITE}/feeds/episodes.xml` : `${SITE}/feeds/${kind}/${key}.xml`);

export function feedsFor(data, { topic, series } = {}) {
  const feeds = [{ title: 'Medics Musings: all episodes (site feed)', href: feedHref('all') }];
  if (topic) feeds.push({ title: `Medics Musings: ${data.topics[topic]} episodes`, href: feedHref('topics', topic) });
  if (series) feeds.push({ title: `Medics Musings: ${data.series[series]}`, href: feedHref('series', series) });
  return feeds;
}

function rss({ title, description, link, self, items }) {
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const item = (e) => {
    const size = e.audio && existsSync(join(ROOT, e.audio)) ? statSync(join(ROOT, e.audio)).size : 0;
    return `    <item>
      <title>${x(e.title)}</title>
      <link>${e.url}</link>
      <guid isPermaLink="true">${e.url}</guid>
      <pubDate>${new Date(e.date + 'T12:00:00Z').toUTCString()}</pubDate>
      <description>${x(`${e.summary} (${e.minutes} min)`)}</description>${size ? `
      <enclosure url="${SITE}/${e.audio}" length="${size}" type="audio/mpeg"/>` : ''}
    </item>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${x(title)}</title>
    <link>${link}</link>
    <atom:link href="${self}" rel="self" type="application/rss+xml"/>
    <description>${x(description)}</description>
    <language>en-us</language>
    <image><url>${SITE}/icon-512.png</url><title>${x(title)}</title><link>${link}</link></image>
    <lastBuildDate>${items.length ? new Date(items[0].date + 'T12:00:00Z').toUTCString() : new Date().toUTCString()}</lastBuildDate>
${items.map(item).join('\n')}
  </channel>
</rss>
`;
}

function writeFeeds(ctx) {
  const { data, episodes } = ctx;
  const put = (rel, xml) => {
    mkdirSync(join(ROOT, rel, '..'), { recursive: true });
    writeFileSync(join(ROOT, rel), xml);
  };
  put('feeds/episodes.xml', rss({
    title: 'Medics Musings: all episodes', description: 'Every Medics Musings episode, newest first.',
    link: `${SITE}/`, self: feedHref('all'), items: episodes,
  }));
  for (const [k, label] of Object.entries(data.topics)) {
    put(`feeds/topics/${k}.xml`, rss({
      title: `Medics Musings: ${label}`, description: data.topicIntros?.[k] || `Medics Musings episodes about ${label}.`,
      link: `${SITE}/topics/${k}/`, self: feedHref('topics', k), items: episodes.filter((e) => (e.tags || []).includes(k)),
    }));
  }
  for (const [k, label] of Object.entries(data.series)) {
    put(`feeds/series/${k}.xml`, rss({
      title: `Medics Musings: ${label}`, description: data.seriesIntros?.[k] || `Every part of ${label}.`,
      link: `${SITE}/series/${k}/`, self: feedHref('series', k), items: episodes.filter((e) => e.series === k),
    }));
  }
}

function subscribePage(ctx) {
  const { data, episodes } = ctx;
  const url = `${SITE}/subscribe/`;
  const description = 'Get Medics Musings by email or RSS, for every episode or just the topics you care about: AI in medicine, surgery, aging, mental health, hospital life, or a single series.';
  const count = (fn) => episodes.filter(fn).length;
  const row = (label, href, n, page) => `<li><a class="feed-link" href="${href}">${esc(label)}</a> <span class="ep-meta">${n} episodes</span> <a class="ep-link" href="${page}">page</a> <button type="button" class="link-btn" data-copy="${href}">Copy feed URL</button></li>`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', url, name: 'Subscribe to Medics Musings', description, isPartOf: { '@id': `${SITE}/#website` } },
      breadcrumbLd([['Subscribe', url]]),
    ],
  };
  return `${pageHead({ title: 'Subscribe by Email or RSS, by Topic or Series | Medics Musings', description, url, ogTitle: 'Subscribe to Medics Musings', image: shareImage(null), ld, feeds: feedsFor(data) })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Subscribe']])}
      <span class="eyebrow">Refill reminder</span>
      <h1>Subscribe your way</h1>
      <p class="coll-intro">${esc(description)}</p>

      <h2>By email</h2>
      <p class="coll-intro">Pick topics or series and we’ll only email you when one of those drops. Pick nothing and you get everything.</p>
      <form class="signup signup-wide" data-location="subscribe_page">
        <label class="sr-only" for="sub-email">Email address</label>
        <input id="sub-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
        <button type="submit" class="btn btn-primary">Subscribe</button>
        <div class="prefs prefs-open">
          ${prefChoices(data)}
        </div>
        <p class="signup-status" role="status" aria-live="polite"></p>
      </form>

      <h2>By RSS</h2>
      <p class="coll-intro">Website feeds for Feedly, Inoreader, NetNewsWire or any feed reader. To listen in a podcast app, use the <a href="${SHOW.rss}">podcast feed</a> or <a href="${SHOW.apple}" target="_blank" rel="noopener">Apple Podcasts</a> / <a href="${SHOW.spotify}" target="_blank" rel="noopener">Spotify</a>.</p>
      <ul class="feed-list">
        ${row('All episodes', feedHref('all'), episodes.length, '/#episodes')}
        ${Object.entries(data.topics).map(([k, label]) => row(label, feedHref('topics', k), count((e) => (e.tags || []).includes(k)), `/topics/${k}/`)).join('\n        ')}
        ${Object.entries(data.series).map(([k, label]) => row(`${label} (series)`, feedHref('series', k), count((e) => e.series === k), `/series/${k}/`)).join('\n        ')}
      </ul>
    </div>
  </section>
</main>

${footer()}

${scripts('signup.js', 'site.js', 'extras.js')}
</body>
</html>
`;
}

// ---- Embeds -------------------------------------------------------------------------

export const embedHeight = (ep) => (ep.audio ? 190 : 250);

export function embedSnippet(ep) {
  return `<iframe src="${SITE}/embed/${ep.slug}/" title="${esc(ep.title)} — Medics Musings" width="100%" height="${embedHeight(ep)}" style="border:0;border-radius:12px;max-width:640px" loading="lazy" allow="autoplay; encrypted-media"></iframe>
<p><a href="${ep.url}">${esc(ep.title)}</a> on <a href="${SITE}/">Medics Musings</a>, the medical satire podcast.</p>`;
}

function embedPage(ep) {
  const link = `${ep.url}?utm_source=embed&utm_medium=iframe`;
  const player = ep.audio
    ? `<audio controls preload="none" src="${SITE}/${ep.audio}"></audio>`
    : ep.spotify
      ? `<iframe title="${esc(ep.title)}" src="https://open.spotify.com/embed/episode/${ep.spotify}?utm_source=generator&theme=0" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`
      : `<a class="go" href="${link}" target="_blank" rel="noopener">▶ Listen on medicsmusings.com</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ep.title)} — Medics Musings player</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${ep.url}">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HPV5BLPF1B"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-HPV5BLPF1B', { page_title: 'Embed: ${esc(ep.title).replace(/'/g, "\\'")}', embed_host: (document.referrer || '').split('/')[2] || 'direct' });
</script>
<style>
  :root { --bg:#0b0f14; --surface:#131a22; --text:#f4f1ea; --muted:#8892a0; --accent:#ff5a3c; --pulse:#35d399; --border:#24303b; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.4 "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; min-height: 100vh; }
  .top { display: flex; gap: 12px; align-items: center; }
  .top img { width: 48px; height: 48px; border-radius: 8px; flex: none; }
  .brand { font: 800 13px/1 "Arial Narrow", Arial, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--text); text-decoration: none; }
  .brand span { color: var(--accent); }
  h1 { margin: 4px 0 0; font-size: 16px; line-height: 1.25; }
  h1 a { color: inherit; text-decoration: none; }
  h1 a:hover { color: var(--accent); }
  audio { width: 100%; }
  iframe { width: 100%; border: 0; border-radius: 12px; display: block; }
  .meta { font: 12px ui-monospace, "SFMono-Regular", monospace; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .more { font: 12px ui-monospace, "SFMono-Regular", monospace; color: var(--pulse); text-decoration: none; }
  .more:hover, .go:hover { color: var(--accent); }
  .go { color: var(--text); background: var(--accent); padding: 10px 14px; border-radius: 4px; text-decoration: none; align-self: flex-start; font-weight: 600; }
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <img src="${SITE}/icon-192.png" alt="" width="48" height="48">
    <div>
      <a class="brand" href="${SITE}/?utm_source=embed&utm_medium=iframe" target="_blank" rel="noopener">Medics<span>Musings</span></a>
      <h1><a href="${link}" target="_blank" rel="noopener">${esc(ep.title)}</a></h1>
      <div class="meta">${dateLabel(ep.date)} · ${ep.minutes} min · medical satire</div>
    </div>
  </div>
  ${player}
  <a class="more" href="${link}" target="_blank" rel="noopener">Transcript, show notes &amp; more episodes at medicsmusings.com →</a>
</div>
<script>
  (function () {
    var a = document.querySelector('audio');
    if (a) a.addEventListener('play', function once() { a.removeEventListener('play', once); try { gtag('event', 'episode_play', { episode_title: ${JSON.stringify(ep.title)}, player: 'embed' }); } catch (e) {} });
  })();
</script>
</body>
</html>
`;
}

// ---- Short links ----------------------------------------------------------------------

function shortLinkPage(ep, n) {
  const to = `${ep.url}?utm_source=short_link&utm_campaign=e${n}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(ep.title)} — Medics Musings</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${ep.url}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)});</script>
</head>
<body><p><a href="${to}">${esc(ep.title)}</a></p></body>
</html>
`;
}

// ---- Quote share pages ----------------------------------------------------------------------

export const quoteCardPath = (slug, n) => `og/quotes/${slug}-${n}.jpg`;
export const quotePageUrl = (ep, n) => `${ep.url}quotes/${n}/`;

export function quoteShareLinks(ep, q, n) {
  const url = quotePageUrl(ep, n);
  const text = `“${q.text}” — ${ep.title}, Medics Musings`;
  return {
    url,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    bluesky: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`,
  };
}

// Share buttons for one quote; the copy/share clicks are handled by extras.js.
export function quoteShareRow(ep, q, n) {
  const l = quoteShareLinks(ep, q, n);
  const a = (href, label, net) => `<a class="ctl" href="${href}" target="_blank" rel="noopener" data-quote-share="${net}">${label}</a>`;
  return `<p class="quote-share" data-quote-url="${l.url}" data-quote-text="${esc(`“${q.text}” — ${ep.title}, Medics Musings`)}">
        ${a(l.linkedin, 'LinkedIn', 'linkedin')}
        ${a(l.x, 'X', 'x')}
        ${a(l.bluesky, 'Bluesky', 'bluesky')}
        ${a(l.facebook, 'Facebook', 'facebook')}
        <button type="button" class="ctl" data-quote-copy>Copy link</button>
        <a class="ctl" href="/${quoteCardPath(ep.slug, n)}" download="medics-musings-${ep.slug}-quote-${n}.jpg" data-quote-share="download">Download image</a>
      </p>`;
}

function quotePage(ep, q, n, ctx) {
  const links = quoteShareLinks(ep, q, n);
  const card = `${SITE}/${quoteCardPath(ep.slug, n)}`;
  const listen = q.t != null ? `${ep.path}?t=${Math.floor(q.t)}` : ep.path;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Quotation',
    text: q.text,
    url: links.url,
    isPartOf: { '@type': 'PodcastEpisode', name: ep.title, url: ep.url },
  };
  return `${pageHead({
    title: `“${snippet(q.text, 90)}” — ${ep.title} | Medics Musings`,
    description: snippet(`“${q.text}” From “${ep.title},” a Medics Musings episode.`),
    url: links.url,
    ogTitle: `“${snippet(q.text, 110)}”`,
    image: { url: card, alt: `Quote card: “${q.text}” — Medics Musings` },
    type: 'article',
    ld,
    robots: 'noindex, follow',
  })}
<main>
  <section class="collection quote-page">
    <div class="wrap">
      ${crumbs([['Episodes', '/#episodes'], [ep.title, ep.path], ['Quote']])}
      <img class="quote-card" src="/${quoteCardPath(ep.slug, n)}" width="1200" height="630" alt="Quote card: “${esc(q.text)}”">
      <blockquote class="quote-big"><p>“${esc(q.text)}”</p><footer>From <a href="${ep.path}">${esc(ep.title)}</a>${q.t != null ? ` at ${clock(q.t)}` : ''}</footer></blockquote>
      <p class="guide-actions"><a class="btn btn-primary" href="${listen}">▶ Hear it in context</a></p>
      ${quoteShareRow(ep, q, n)}
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

// ---- Build ----------------------------------------------------------------------------------

export function buildExtras(ctx) {
  const explainedData = readJson('data/explainers.json', { intro: '', explainers: [] });
  const teachData = readJson('data/teaching.json', { intro: '', note: '', guides: [] });
  const full = {
    ...ctx,
    explainedData,
    explainers: explainedData.explainers,
    teachData,
    guides: teachData.guides.filter((g) => ctx.bySlug.has(g.slug)),
  };

  writePage('explained', explainedHub(full));
  for (const x of full.explainers) writePage(`explained/${x.slug}`, explainerPage(x, full));
  writePage('teach', teachHub(full));
  for (const g of full.guides) writePage(`teach/${g.slug}`, teachPage(g, full));
  writePage('submit', submitPage(full));
  writePage('subscribe', subscribePage(full));
  writeFeeds(full);

  for (const ep of ctx.episodes) {
    writePage(`embed/${ep.slug}`, embedPage(ep));
    writePage(`e/${ctx.num.get(ep.slug)}`, shortLinkPage(ep, ctx.num.get(ep.slug)));
    (ctx.quotes[ep.slug] || []).forEach((q, i) => {
      if (existsSync(join(ROOT, quoteCardPath(ep.slug, i + 1)))) writePage(`episodes/${ep.slug}/quotes/${i + 1}`, quotePage(ep, q, i + 1, full));
    });
  }

  const newest = ctx.episodes[0].date;
  return {
    explainers: full.explainers,
    guides: full.guides,
    sitemap: [
      { loc: EXPLAINED_URL, lastmod: newest, changefreq: 'monthly', priority: '0.8' },
      ...full.explainers.map((x) => ({ loc: `${EXPLAINED_URL}${x.slug}/`, lastmod: newest, changefreq: 'monthly', priority: '0.8' })),
      { loc: TEACH_URL, lastmod: newest, changefreq: 'monthly', priority: '0.7' },
      ...full.guides.map((g) => ({ loc: `${TEACH_URL}${g.slug}/`, lastmod: newest, changefreq: 'monthly', priority: '0.7' })),
      { loc: `${SITE}/submit/`, lastmod: newest, changefreq: 'yearly', priority: '0.5' },
      { loc: `${SITE}/subscribe/`, lastmod: newest, changefreq: 'monthly', priority: '0.5' },
    ],
    pages: ['explained', ...full.explainers.map((x) => `explained/${x.slug}`), 'teach', ...full.guides.map((g) => `teach/${g.slug}`), 'submit', 'subscribe'],
  };
}
