// The Weekly Dose: two satirical health care jokes and a cartoon, every week.
//
// Each issue is data/weekly-dose/<YYYY-MM-DD>.json, with its cartoon at
// weekly-dose/<YYYY-MM-DD>/cartoon.jpg. Hark writes both each week. Pushing an
// issue to main runs .github/workflows/weekly-dose.yml, which:
//   1. builds the pages:  /weekly-dose/ (archive + signup) and /weekly-dose/<date>/
//   2. after the pages are live, emails the issue to the Mailchimp audience.
//
// An issue's "status" decides what the email step does:
//   "draft"  build the page only
//   "test"   email one copy to "test_email" (not the audience)
//   "send"   email the audience, then mark the issue "sent"
//   "sent"   already emailed; never sent again
//
// MODE=build only builds pages. MODE=email does the email step.
// Safety: a Mailchimp campaign tagged with the issue date is looked for before
// one is created, so an issue can't go out twice.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SITE, SHOW, esc, jsonLd, pageHead, footer, writePage } from './lib/page.mjs';

const DIR = join(ROOT, 'data', 'weekly-dose');
const NAME = 'The Weekly Dose';
const MODE = process.env.MODE || 'build';
const LIST_ID = process.env.MAILCHIMP_LIST_ID || '8cbe14ef1a';
const API_KEY = (process.env.MAILCHIMP_API_KEY || '').trim().replace(/^["']+|["']+$/g, '');
const API_BASE = `https://${API_KEY.split('-')[1] || 'us2'}.api.mailchimp.com/3.0`;

const issues = (existsSync(DIR) ? readdirSync(DIR) : [])
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .map((f) => ({ file: join(DIR, f), ...JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));

const longDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const issueUrl = (i) => `${SITE}/weekly-dose/${i.date}/`;
const imageUrl = (i) => `${SITE}/weekly-dose/${i.date}/${i.cartoon.file || 'cartoon.jpg'}`;
const published = issues.filter((i) => i.status !== 'draft');

// ---- Pages ---------------------------------------------------------------------

const signupBlock = (location) => `<section class="newsletter" id="newsletter">
    <div class="wrap">
      <span class="eyebrow">Take as directed</span>
      <h2>Get ${NAME} every Friday.</h2>
      <p class="newsletter-sub">Two satirical health care jokes and an original cartoon, once a week, plus a note when a new episode drops. No spam, no prior authorization. By subscribing you agree to get these emails; unsubscribe anytime.</p>
      <form class="signup" data-location="${location}">
        <label class="sr-only" for="signup-name">Your name</label>
        <input id="signup-name" type="text" name="fname" required autocomplete="name" placeholder="Your name">
        <label class="sr-only" for="signup-email">Email address</label>
        <input id="signup-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
        <button type="submit" class="btn btn-primary">Subscribe</button>
        <p class="signup-status" role="status" aria-live="polite"></p>
      </form>
    </div>
  </section>`;

const css = `<style>
  .dose { max-width: 760px; }
  .dose-joke { margin: 22px 0; padding: 18px 20px; border-left: 4px solid var(--accent, #ff5a3c); background: rgba(255,255,255,.04); font-size: 1.12rem; line-height: 1.55; }
  .dose-joke b { display: block; margin-top: 8px; }
  .dose-cartoon { margin: 30px 0; }
  .dose-cartoon img { width: 100%; height: auto; border-radius: 6px; background: #fff; }
  .dose-cartoon figcaption { margin-top: 10px; font-style: italic; text-align: center; font-size: 1.08rem; }
  .dose-list { list-style: none; padding: 0; }
  .dose-list li { margin: 10px 0; }
  .dose-list .ep-meta { margin-left: 8px; }
</style>`;

const scripts = `<script src="/signup.js" defer></script>
<script src="/site.js" defer></script>`;

function jokeHtml(j) {
  return `<div class="dose-joke">${esc(j.setup)}${j.punchline ? `<b>${esc(j.punchline)}</b>` : ''}</div>`;
}

function issuePage(i) {
  const url = issueUrl(i);
  const title = `${NAME} #${i.issue}: ${i.title}`;
  const description = `Issue #${i.issue} of ${NAME} from Medics Musings: two satirical health care jokes and a cartoon. ${longDate(i.date)}.`;
  const idx = published.indexOf(i);
  const prev = published[idx - 1];
  const next = published[idx + 1];
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: title, datePublished: i.date, url, image: imageUrl(i), author: [{ '@type': 'Person', name: 'Dan Gardner, MD' }, { '@type': 'Person', name: 'Leo A. Gordon, MD' }], isPartOf: { '@id': `${SITE}/#website` } };
  return `${pageHead({ title: `${title} | Medics Musings`, description, url, ogTitle: title, image: { url: imageUrl(i), alt: i.cartoon.alt }, type: 'article', ld })}${css}
<main>
  <section class="collection">
    <div class="wrap dose">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/weekly-dose/">${NAME}</a> <span aria-hidden="true">/</span> <span>#${i.issue}</span></nav>
      <span class="eyebrow">${NAME} · Issue #${i.issue} · ${esc(longDate(i.date))}</span>
      <h1>${esc(i.title)}</h1>
      ${i.jokes.map(jokeHtml).join('\n      ')}
      <figure class="dose-cartoon">
        <img src="/weekly-dose/${i.date}/${i.cartoon.file || 'cartoon.jpg'}" alt="${esc(i.cartoon.alt)}" loading="lazy">
        <figcaption>${esc(i.cartoon.caption)}</figcaption>
      </figure>
      <p class="coll-intro">${prev ? `<a href="/weekly-dose/${prev.date}/">← Issue #${prev.issue}</a>` : ''}${prev && next ? ' · ' : ''}${next ? `<a href="/weekly-dose/${next.date}/">Issue #${next.issue} →</a>` : ''}${prev || next ? ' · ' : ''}<a href="/weekly-dose/">All issues</a> · <a href="/#episodes">Listen to the podcast</a></p>
    </div>
  </section>
  ${signupBlock('weekly_dose_issue')}
</main>

${footer()}

${scripts}
</body>
</html>
`;
}

function archivePage() {
  const url = `${SITE}/weekly-dose/`;
  const description = `${NAME}: two satirical health care jokes and an original cartoon from Medics Musings, every Friday. Sign up free.`;
  const latest = published.at(-1);
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: NAME, description, url, isPartOf: { '@id': `${SITE}/#website` } };
  const rows = [...published].reverse().map((i) => `<li><a href="/weekly-dose/${i.date}/">#${i.issue}: ${esc(i.title)}</a><span class="ep-meta">${esc(longDate(i.date))}</span></li>`);
  return `${pageHead({ title: `${NAME}: Weekly Health Care Satire by Email | Medics Musings`, description, url, ogTitle: NAME, image: latest ? { url: imageUrl(latest), alt: latest.cartoon.alt } : { url: `${SITE}/og-image.jpg`, alt: 'Medics Musings' }, ld })}${css}
<main>
  ${signupBlock('weekly_dose')}
  <section class="collection">
    <div class="wrap dose">
      <span class="eyebrow">The archive</span>
      <h1>${NAME}</h1>
      <p class="coll-intro">Two satirical health care jokes and an original cartoon, every week. For entertainment only; nothing here is medical advice.</p>
      ${rows.length ? `<ul class="dose-list">\n        ${rows.join('\n        ')}\n      </ul>` : '<p class="coll-intro">The first issue arrives Friday.</p>'}
    </div>
  </section>
</main>

${footer()}

${scripts}
</body>
</html>
`;
}

// The homepage's signup section: say what subscribers get, collect a name, and
// link the archive. Idempotent; the rest of index.html is left alone.
function patchHomepage() {
  const p = join(ROOT, 'index.html');
  if (!existsSync(p)) return;
  let html = readFileSync(p, 'utf8');
  const before = html;
  html = html.replace(
    /<h2>New episodes, straight to your inbox\.<\/h2>\s*<p class="newsletter-sub">[^<]*<\/p>/,
    `<h2>New episodes and ${NAME}, straight to your inbox.</h2>
      <p class="newsletter-sub">A short email when a new episode drops, plus ${NAME} every Friday: two satirical health care jokes and an original cartoon. No spam, no prior authorization. By subscribing you agree to get these emails; unsubscribe anytime.</p>`,
  );
  if (!html.includes('id="signup-name"')) {
    html = html.replace(
      '<form class="signup" data-location="home">\n        <label class="sr-only" for="signup-email">',
      '<form class="signup" data-location="home">\n        <label class="sr-only" for="signup-name">Your name</label>\n        <input id="signup-name" type="text" name="fname" required autocomplete="name" placeholder="Your name">\n        <label class="sr-only" for="signup-email">',
    );
  }
  if (!html.includes('href="weekly-dose/"')) {
    html = html.replace(
      '<p class="newsletter-alt">Prefer a feed reader?',
      `<p class="newsletter-alt"><a href="weekly-dose/">Read past issues of ${NAME} →</a></p>\n      <p class="newsletter-alt">Prefer a feed reader?`,
    );
  }
  if (html !== before) { writeFileSync(p, html); console.log('Updated the homepage signup section.'); }
}

function build() {
  patchHomepage();
  writePage('weekly-dose', archivePage());
  for (const i of published) writePage(`weekly-dose/${i.date}`, issuePage(i));
  // Keep the archive in the sitemap.
  const smPath = join(ROOT, 'sitemap.xml');
  if (existsSync(smPath)) {
    let sm = readFileSync(smPath, 'utf8');
    const want = [`${SITE}/weekly-dose/`, ...published.map(issueUrl)];
    const add = want.filter((u) => !sm.includes(`<loc>${u}</loc>`));
    if (add.length) {
      sm = sm.replace('</urlset>', add.map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>\n`).join('') + '</urlset>');
      writeFileSync(smPath, sm);
    }
  }
  console.log(`Built ${NAME}: archive + ${published.length} issue page(s).`);
}

// ---- Email ---------------------------------------------------------------------

function renderEmail(i) {
  const url = `${issueUrl(i)}?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-dose-${i.issue}`;
  const subject = `${NAME} #${i.issue}: ${i.title}`;
  const preview = i.preview || `${i.jokes[0].setup}`.slice(0, 110);
  const joke = (j) => `<tr><td style="padding:0 28px 18px;"><div style="border-left:4px solid #ff5a3c;background:#f8f5ef;padding:16px 18px;font:16px/1.55 Arial,Helvetica,sans-serif;color:#14181d;">${esc(j.setup)}${j.punchline ? `<br><br><b>${esc(j.punchline)}</b>` : ''}</div></td></tr>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #ded8cb;">
<tr><td style="padding:22px 28px;background:#0b0f14;">
  <span style="font:800 20px 'Arial Narrow',Arial,sans-serif;letter-spacing:.5px;text-transform:uppercase;color:#f4f1ea;">Medics<span style="color:#ff5a3c;">Musings</span></span>
  <span style="float:right;font:600 12px 'Courier New',monospace;letter-spacing:1.5px;text-transform:uppercase;color:#9aa3ae;line-height:26px;">${NAME} #${i.issue}</span>
</td></tr>
<tr><td style="padding:26px 28px 6px;font-family:Arial,Helvetica,sans-serif;color:#14181d;">
  <div style="font:600 12px 'Courier New',monospace;letter-spacing:1.5px;text-transform:uppercase;color:#17825c;">${esc(longDate(i.date))}</div>
  <h1 style="margin:10px 0 8px;font:800 28px/1.1 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;color:#14181d;">${esc(i.title)}</h1>
  <p style="margin:0 0 18px;font-size:15px;color:#3a424d;">Hi *|IF:FNAME|**|FNAME|**|ELSE:|*there*|END:IF|*, here's this week's dose. Take two jokes and call us in the morning.</p>
</td></tr>
${i.jokes.map(joke).join('\n')}
<tr><td style="padding:8px 28px 4px;" align="center">
  <a href="${esc(url)}"><img src="${imageUrl(i)}" width="544" alt="${esc(i.cartoon.alt)}" style="display:block;width:100%;max-width:544px;height:auto;border:1px solid #ded8cb;"></a>
  <p style="margin:10px 0 0;font:italic 16px/1.4 Georgia,serif;color:#14181d;">${esc(i.cartoon.caption)}</p>
</td></tr>
<tr><td style="padding:22px 28px 6px;font-family:Arial,Helvetica,sans-serif;">
  <a href="${esc(url)}" style="display:inline-block;background:#d8431e;color:#ffffff;text-decoration:none;font:600 14px 'Courier New',monospace;letter-spacing:1px;text-transform:uppercase;padding:12px 20px;">Share this issue</a>
  <p style="margin:18px 0 0;font-size:13px;color:#5b6472;">Need a longer dose? Listen to Medics Musings on
    <a href="${SHOW.spotify}" style="color:#17825c;">Spotify</a> ·
    <a href="${SHOW.apple}" style="color:#17825c;">Apple Podcasts</a> ·
    <a href="${SHOW.youtube}" style="color:#17825c;">YouTube</a></p>
</td></tr>
<tr><td style="padding:22px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#7a828e;">
  <hr style="border:none;border-top:1px solid #ded8cb;margin:0 0 16px;">
  ${NAME} is satire from Medics Musings, made for entertainment. Jokes and cartoons are AI-assisted and fictional, and nothing here is medical advice.<br><br>
  You're getting this because you signed up at medicsmusings.com.<br>
  <a href="*|UNSUB|*" style="color:#7a828e;">Unsubscribe</a> · <a href="*|UPDATE_PROFILE|*" style="color:#7a828e;">Update preferences</a><br>
  *|LIST:ADDRESSLINE|*
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, preview, html };
}

async function mc(path, method = 'GET', body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { Authorization: 'Basic ' + Buffer.from('medicsmusings:' + API_KEY).toString('base64'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { /* not JSON */ }
  if (!res.ok) throw new Error(`Mailchimp ${method} ${path} -> ${res.status}: ${json.detail || json.title || text.slice(0, 200)}`);
  return json;
}

async function waitLive(url, seconds = 600) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    try { const r = await fetch(`${url}?check=${Date.now()}`); if (r.ok) return true; } catch (e) { /* retry */ }
    if (Date.now() > deadline) return false;
    console.log(`Waiting for ${url} to go live...`);
    await new Promise((r) => setTimeout(r, 15000));
  }
}

async function email() {
  const todo = issues.filter((i) => i.status === 'test' || i.status === 'send');
  if (!todo.length) { console.log('No issue waiting to be emailed.'); return; }
  if (!API_KEY) throw new Error('MAILCHIMP_API_KEY is not set, so nothing was emailed.');
  const list = await mc(`/lists/${LIST_ID}?fields=name,campaign_defaults,stats.member_count`);
  const defaults = list.campaign_defaults || {};
  console.log(`Audience "${list.name}": ${list.stats.member_count} subscribers`);

  for (const i of todo) {
    if (!(await waitLive(issueUrl(i))) || !(await waitLive(imageUrl(i)))) throw new Error(`Issue #${i.issue} isn't live on the site yet; not emailing. Re-run the workflow later.`);
    const e = renderEmail(i);
    writeFileSync(join(ROOT, 'weekly-dose-preview.html'), e.html);
    const tag = `[dose-${i.date}]`;
    const found = (await mc(`/campaigns?list_id=${LIST_ID}&count=200&sort_field=create_time&sort_dir=DESC&fields=campaigns.id,campaigns.status,campaigns.settings.title`))
      .campaigns.filter((c) => (c.settings.title || '').includes(tag));
    if (found.some((c) => ['sent', 'sending', 'schedule'].includes(c.status))) {
      console.log(`Issue #${i.issue} was already sent; marking it sent.`);
      i.status = 'sent';
    } else {
      let id = found.find((c) => c.status === 'save')?.id;
      const settings = { subject_line: e.subject, preview_text: e.preview, title: `${NAME} #${i.issue} ${tag}`, from_name: defaults.from_name, reply_to: defaults.from_email };
      if (id) await mc(`/campaigns/${id}`, 'PATCH', { settings, recipients: { list_id: LIST_ID } });
      else id = (await mc('/campaigns', 'POST', { type: 'regular', recipients: { list_id: LIST_ID }, settings })).id;
      await mc(`/campaigns/${id}/content`, 'PUT', { html: e.html });
      if (i.status === 'test') {
        const to = i.test_email || defaults.from_email;
        await mc(`/campaigns/${id}/actions/test`, 'POST', { test_emails: [to], send_type: 'html' });
        console.log(`Test of issue #${i.issue} sent to ${to}.`);
        i.status = 'draft-tested';
      } else {
        if (list.stats.member_count === 0) { console.log('No subscribers yet; nothing to send.'); i.status = 'sent'; }
        else {
          const check = await mc(`/campaigns/${id}/send-checklist`);
          if (!check.is_ready) throw new Error('Mailchimp says the campaign is not ready: ' + (check.items || []).filter((x) => x.type === 'error').map((x) => x.details).join(' | '));
          await mc(`/campaigns/${id}/actions/send`, 'POST');
          console.log(`Issue #${i.issue} sent to ${list.stats.member_count} subscribers.`);
          i.status = 'sent';
          i.sent_at = new Date().toISOString();
        }
      }
      i.campaign_id = id;
    }
    const { file, ...data } = i;
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
}

if (MODE === 'build') build();
else if (MODE === 'email') await email();
else throw new Error(`Unknown MODE "${MODE}"`);
