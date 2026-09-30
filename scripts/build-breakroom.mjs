// The Break Room (/break-room/): six small things for tired clinicians. Built by
// build-extras.mjs. Content lives in data/break-room.json; the behavior in breakroom.js.
// Everything runs in the reader's browser: nothing typed on these pages is sent or stored.
import { SITE, esc, jsonLd, readJson, snippet, pageHead, shareImage } from './lib/page.mjs';

export const BREAK_URL = `${SITE}/break-room/`;

const PAGES = [
  { slug: 'pizza-party', title: 'Pizza Party Appreciation Certificate', tag: 'Print it', desc: 'A printable, official-looking certificate that awards one slice of pizza, cheese, subject to availability. Pick the occasion, add a name, text it to the unit.' },
  { slug: 'memo-translator', title: 'Admin Memo Translator', tag: 'Paste it', desc: 'Paste a line from a leadership email and get the plain-English meaning. “Rightsizing” is “fewer of you, same patients.” Runs in your browser; nothing you paste leaves it.' },
  { slug: 'burnout-bingo', title: 'Burnout Bingo', tag: 'Daily', desc: 'A new 5×5 card every day of shift events. Tap squares as they happen, then share your card. Same card for everyone, all day.' },
  { slug: 'time-to-listen', title: 'How much time do you have?', tag: 'Listen', desc: 'Five minutes in the car before you go back in? Pick 3, 5, 10 or 20 and get episodes that fit.' },
  { slug: 'out-of-office', title: 'Out-of-Office Generator', tag: 'Copy it', desc: 'Satirical auto-replies for every kind of unavailable: charting, on call, post-call, vacation and just tired. Tap to copy.' },
  { slug: 'take-five', title: 'Take Five', tag: 'The sincere one', desc: 'A one-minute guided breathing pause, plus real, free support lines for clinicians. This page is not satire.', sincere: true },
];

// First sentence of the summary, without the "(Created with the help of …)" credits.
const blurb = (t) => {
  const clean = t.replace(/\s*\(Created with[^)]*\)?/i, '').trim();
  const first = clean.split(/(?<=[.!?])\s/)[0];
  return first.length <= 170 ? first : snippet(clean, 150);
};
const url = (slug) => `${BREAK_URL}${slug}/`;
const JS = ['signup.js', 'site.js', 'breakroom.js'];

export function breakRoomPages(ctx, { crumbs, breadcrumbLd, pageEnd }) {
  const data = readJson('data/break-room.json', null);
  if (!data) return { pages: [], sitemap: [] };
  const out = [];
  const back = `<p class="related">More from the Break Room: ${PAGES.map((p) => `<a href="/break-room/${p.slug}/">${esc(p.title)}</a>`).join(' · ')}</p>`;

  const shell = (page, { intro, body, data: dataJson, sincere = false }) => {
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', url: url(page.slug), name: page.title, description: page.desc, isPartOf: { '@id': `${SITE}/#website` } },
        breadcrumbLd([['The Break Room', BREAK_URL], [page.title, url(page.slug)]]),
      ],
    };
    return `${pageHead({ title: `${page.title} | The Break Room | Medics Musings`, description: snippet(page.desc), url: url(page.slug), ogTitle: page.title, image: shareImage(null), ld })}
<main>
  <section class="collection break-page break-${page.slug}">
    <div class="wrap">
      ${crumbs([['The Break Room', '/break-room/'], [page.title]])}
      <span class="eyebrow">${sincere ? 'Not satire' : 'The Break Room'}</span>
      <h1>${esc(page.title)}</h1>
      <p class="coll-intro">${esc(intro)}</p>
${body}
      <noscript><p class="br-note">This page needs JavaScript, because it runs entirely in your browser.</p></noscript>
      ${back}
    </div>
  </section>
${dataJson ? `  <script type="application/json" id="br-data">${jsonLd(dataJson)}</script>\n` : ''}
${pageEnd(ctx.data, { js: JS })}`;
  };

  // ---- Hub ----------------------------------------------------------------
  {
    const intro = 'Six small things for the people holding the hospital together. Each takes under a minute, works on a phone in a stairwell, and sends nothing anywhere: whatever you type stays on your device.';
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'CollectionPage', url: BREAK_URL, name: 'The Break Room', description: intro, isPartOf: { '@id': `${SITE}/#website` } },
        breadcrumbLd([['The Break Room', BREAK_URL]]),
      ],
    };
    out.push({
      path: 'break-room',
      html: `${pageHead({ title: 'The Break Room: Satire and a Breather for Burned-Out Clinicians | Medics Musings', description: snippet(intro), url: BREAK_URL, ogTitle: 'The Break Room', image: shareImage(null), ld })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['The Break Room']])}
      <span class="eyebrow">For the people on shift</span>
      <h1>The Break Room</h1>
      <p class="coll-intro">${esc(intro)}</p>
      <ul class="coll-list">
        ${PAGES.map((p) => `<li>
          <a class="coll-card${p.sincere ? ' coll-card--sincere' : ''}" href="/break-room/${p.slug}/">
            <span class="coll-part">${esc(p.tag)}</span>
            <span class="coll-title">${esc(p.title)}</span>
            <span class="coll-desc">${esc(p.desc)}</span>
          </a>
        </li>`).join('\n        ')}
      </ul>
      <p class="related">Also for the shift: <a href="/games/">Daily games</a> · <a href="/icd10/">ICD-10 code of the day</a> · <a href="/news/">News of the day</a> · <a href="/submit/">Send us your story</a></p>
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js'] })}`,
    });
  }

  // ---- Pizza party certificate ---------------------------------------------
  {
    const p = PAGES[0];
    const occ = data.pizza.occasions;
    const body = `      <form class="br-form" data-pizza-form autocomplete="off">
        <label>Name (yours, or the unit's)
          <input type="text" name="name" maxlength="40" placeholder="Dr. Someone, RN, or 5 West" value="">
        </label>
        <label>Occasion
          <select name="occasion">
            ${occ.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('\n            ')}
          </select>
        </label>
        <label data-pizza-custom hidden>What are we recognizing?
          <input type="text" name="custom" maxlength="90" placeholder="e.g. covering three call rooms at once">
        </label>
        <label>Signed by
          <select name="signer">
            ${data.pizza.signers.map((s) => `<option>${esc(s)}</option>`).join('\n            ')}
          </select>
        </label>
      </form>
      <figure class="br-cert">
        <canvas data-pizza-canvas width="1600" height="1130" role="img" aria-label="Certificate of appreciation awarding one slice of pizza"></canvas>
      </figure>
      <p class="br-actions">
        <button type="button" class="btn btn-primary" data-pizza-share>Share</button>
        <button type="button" class="btn btn-ghost" data-pizza-download>Download image</button>
        <button type="button" class="btn btn-ghost" data-pizza-print>Print</button>
      </p>
      <p class="br-note">Made in your browser. The name you type is not sent or stored anywhere. Satire: not redeemable for pizza.</p>`;
    out.push({ path: `break-room/${p.slug}`, html: shell(p, { intro: 'An official-looking certificate for the recognition you were actually offered. Type a name, pick the occasion, print it or text it to your unit.', body, data: { occasions: occ } }) });
  }

  // ---- Memo translator -----------------------------------------------------
  {
    const p = PAGES[1];
    const body = `      <div class="br-memo">
        <label for="br-memo-in">Paste a line from the email</label>
        <textarea id="br-memo-in" rows="5" maxlength="4000" placeholder="We're rightsizing to better align resources with our mission…" data-memo-in></textarea>
        <p class="br-actions">
          <button type="button" class="btn btn-primary" data-memo-translate>Translate</button>
          <button type="button" class="btn btn-ghost" data-memo-example>Try an example</button>
          <button type="button" class="btn btn-ghost" data-memo-clear>Clear</button>
          <button type="button" class="btn btn-ghost" data-memo-copy hidden>Copy translation</button>
        </p>
        <div class="br-memo-out" data-memo-out aria-live="polite" hidden>
          <h2>Plain English</h2>
          <p class="br-memo-plain" data-memo-plain></p>
          <h2>What they said, and what they meant</h2>
          <ul class="br-memo-list" data-memo-list></ul>
        </div>
        <p class="br-memo-none" data-memo-none hidden>No jargon found. It may already be plain English, which would be a first. Or the euphemism is one we have not met yet.</p>
      </div>
      <p class="br-note">Privacy: the translation runs entirely in your browser from a fixed list of ${data.memo.phrases.length} phrases. There is no AI and no server involved, so nothing you paste is sent anywhere. The translations are satire, aimed at the memo and never at the person who forwarded it.</p>`;
    out.push({ path: `break-room/${p.slug}`, html: shell(p, { intro: 'Leadership email in, plain English out. Nothing you paste ever leaves this page.', body, data: { phrases: data.memo.phrases, examples: data.memo.examples } }) });
  }

  // ---- Burnout Bingo -------------------------------------------------------
  {
    const p = PAGES[2];
    const body = `      <div class="br-bingo" id="burnout-bingo" data-launch="2026-09-29">
        <p class="br-bingo-status"><b data-bingo-num></b> <span data-bingo-count></span></p>
        <div class="br-bingo-grid" data-bingo-grid role="group" aria-label="Bingo card"></div>
        <p class="br-bingo-win" data-bingo-win hidden role="status">Bingo. Somehow. Please take a real break.</p>
        <p class="br-actions">
          <button type="button" class="btn btn-primary" data-bingo-share>Share my card</button>
          <button type="button" class="btn btn-ghost" data-bingo-clear>Clear card</button>
        </p>
        <p class="br-bingo-next" data-bingo-next aria-live="polite"></p>
      </div>
      <p class="br-note">Everyone gets the same card each day. Your marks stay on this device. Sharing sends only the pattern of squares and a link, never the contents of your day.</p>`;
    out.push({ path: `break-room/${p.slug}`, html: shell(p, { intro: 'A new card each day of things that happen on shift. Tap a square when it happens to you. Get five in a row and go home. (You cannot go home.)', body, data: { squares: data.bingo.squares, free: data.bingo.free } }) });
  }

  // ---- Episodes by time ----------------------------------------------------
  {
    const p = PAGES[3];
    const eps = ctx.episodes.filter((e) => e.minutes).map((e) => ({ s: e.slug, t: e.title, m: e.minutes, d: blurb(e.summary || ''), a: e.audio || '' }));
    const body = `      <div class="br-time" data-time>
        <div class="br-time-picks" role="group" aria-label="How much time do you have?">
          ${[3, 5, 10, 20].map((n) => `<button type="button" class="br-time-btn" data-mins="${n}"><b>${n}</b><span>min</span></button>`).join('\n          ')}
        </div>
        <p class="br-time-head" data-time-head aria-live="polite">Pick a length.</p>
        <ol class="br-time-list" data-time-list></ol>
        <p class="br-actions">
          <button type="button" class="btn btn-ghost" data-time-more hidden>Show all that fit</button>
          <button type="button" class="btn btn-ghost" data-time-random hidden>Surprise me</button>
        </p>
      </div>
      <noscript><p class="br-note"><a href="/#episodes">Browse every episode</a>: each one lists its length.</p></noscript>
      <p class="br-note">Lengths are as published on Spotify. Every episode has a player on its own page, with transcripts.</p>`;
    out.push({ path: `break-room/${p.slug}`, html: shell(p, { intro: 'Five minutes in the car before you go back in? Choose how long you have and we will find something that fits.', body, data: { episodes: eps } }) });
  }

  // ---- Out-of-office -------------------------------------------------------
  {
    const p = PAGES[4];
    const body = `      <div class="br-ooo" data-ooo>
        <div class="br-ooo-kinds" role="group" aria-label="Kind of unavailable">
          <button type="button" class="chip is-current" data-kind="all">Any</button>
          ${data.ooo.kinds.map((k) => `<button type="button" class="chip" data-kind="${esc(k.id)}">${esc(k.label)}</button>`).join('\n          ')}
        </div>
        <blockquote class="br-ooo-text" data-ooo-text aria-live="polite"></blockquote>
        <p class="br-actions">
          <button type="button" class="btn btn-primary" data-ooo-copy>Copy</button>
          <button type="button" class="btn btn-ghost" data-ooo-next>Another one</button>
        </p>
      </div>
      <p class="br-note">${data.ooo.lines.length} auto-replies. Paste one into your mail settings at your own risk; your chief may not share our sense of humor.</p>`;
    out.push({ path: `break-room/${p.slug}`, html: shell(p, { intro: 'Auto-replies for every kind of unavailable. Tap to copy. Send at your own risk.', body, data: { kinds: data.ooo.kinds, lines: data.ooo.lines } }) });
  }

  // ---- Take Five -----------------------------------------------------------
  {
    const p = PAGES[5];
    const help = data.takeFive.lines.map((l) => {
      const action = l.sms ? `sms:${l.sms}?&body=HOME` : `tel:${l.tel}`;
      return `<li class="br-help-item">
          <h3><a href="${esc(l.url)}" rel="noopener">${esc(l.name)}</a></h3>
          <p>${esc(l.who)}</p>
          <p class="br-help-how"><a class="btn btn-primary" href="${esc(action)}">${esc(l.how)}</a></p>
          <p class="br-help-hours">${esc(l.hours)}</p>
        </li>`;
    }).join('\n        ');
    const body = `      <section class="br-five" data-five>
        <div class="br-breath" aria-live="off">
          <div class="br-circle" data-five-circle></div>
        </div>
        <p class="br-cue" data-five-cue aria-live="polite">Ready when you are.</p>
        <p class="br-five-time" data-five-time></p>
        <p class="br-actions">
          <button type="button" class="btn btn-primary" data-five-voice>Begin, with voice</button>
          <button type="button" class="btn btn-ghost" data-five-silent>Begin silently</button>
          <button type="button" class="btn btn-ghost" data-five-stop hidden>Stop</button>
        </p>
        <audio data-five-audio src="/audio/take-five.mp3" preload="none"></audio>
        <p class="br-note">About a minute: five slow breaths, in for four and out for six. Nobody is scoring it. Nothing is recorded.</p>
      </section>

      <section class="br-help">
        <h2>If it is more than a bad day</h2>
        <p>Burnout is real, it is common in this work, and it is not a personal failing. If you are struggling, or you are worried about a colleague, these are free and confidential, and the people who answer have heard it before.</p>
        <ul class="br-help-list">
        ${help}
        </ul>
        <p class="br-help-emergency"><b>In immediate danger, or in a medical emergency, call 911.</b></p>
        <p class="br-note">The Physician Support Line is for physicians and medical students. Nurses, techs, therapists and everyone else on the team: 988 and the Crisis Text Line are for you too. Details checked against each service's own website on September 29, 2026; hours and numbers can change, so please confirm on their sites. This page is a courtesy, not medical advice, and not a substitute for care.</p>
      </section>`;
    out.push({ path: `break-room/${p.slug}`, html: shell(p, { intro: 'The one page on this site that is not a joke. A minute to breathe, and a list of people who will answer if you need more.', body, sincere: true }) });
  }

  const newest = ctx.episodes[0].date;
  const sitemap = [
    { loc: BREAK_URL, lastmod: newest, changefreq: 'monthly', priority: '0.7' },
    ...PAGES.map((p) => ({ loc: url(p.slug), lastmod: newest, changefreq: p.slug === 'burnout-bingo' ? 'daily' : 'monthly', priority: '0.6' })),
  ];
  return { pages: out, sitemap };
}
