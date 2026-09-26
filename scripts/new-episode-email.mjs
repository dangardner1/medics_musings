// Emails the Mailchimp audience when a new episode appears in the podcast RSS
// feed. Runs on a schedule from .github/workflows/new-episode-email.yml.
//
//   MODE=dry-run  print the email, change nothing (default when run by hand)
//   MODE=draft    create the campaign in Mailchimp but don't send it
//   MODE=test     send a test copy to TEST_EMAIL (default: the list's from address)
//   MODE=send     send to the whole audience (what the schedule uses)
//
// FORCE_LATEST=true handles the newest episode even if it was already seen
// (use it with dry-run/draft/test to preview the email).
//
// Safety: the first run only records what's already in the feed, so back
// catalogue episodes are never emailed; episodes older than MAX_AGE_DAYS are
// skipped; and a Mailchimp campaign tagged with the episode id is checked for
// before creating one, so a failed state commit can't cause a double send.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.medicsmusings.com';
const FEED = process.env.FEED_URL || 'https://anchor.fm/s/117844514/podcast/rss';
const LIST_ID = process.env.MAILCHIMP_LIST_ID || '8cbe14ef1a';
// Secrets pasted into GitHub often carry a trailing newline or quotes.
const API_KEY = (process.env.MAILCHIMP_API_KEY || '').trim().replace(/^["']+|["']+$/g, '');
const API_BASE = process.env.MAILCHIMP_API_BASE || `https://${API_KEY.split('-')[1] || 'us2'}.api.mailchimp.com/3.0`;
const MODE = process.env.MODE || 'dry-run';
const FORCE = process.env.FORCE_LATEST === 'true';
const MAX_AGE_DAYS = Number(process.env.MAX_AGE_DAYS || 7);
const STATE_FILE = process.env.STATE_FILE || join(ROOT, '.github', 'newsletter-state.json');
const PREVIEW_FILE = process.env.PREVIEW_FILE || join(ROOT, 'newsletter-preview.html');
const SHOW = {
  spotify: 'https://open.spotify.com/show/7zknqhZkTKZ8WA8SuMlWlj',
  apple: 'https://podcasts.apple.com/us/podcast/medics-musings/id1780716650',
  youtube: 'https://www.youtube.com/@MedicsMusings',
};

if (!['dry-run', 'draft', 'test', 'send'].includes(MODE)) throw new Error(`Unknown MODE "${MODE}"`);

// ---- Feed ----------------------------------------------------------------------

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const plain = (html) => decode(html).replace(/<\/(p|li|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function field(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : '';
}

function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => {
    const guid = decode(field(b, 'guid')) || decode(field(b, 'link'));
    const secs = field(b, 'itunes:duration');
    let seconds = 0;
    if (/^\d+$/.test(secs)) seconds = Number(secs);
    else if (secs) seconds = secs.split(':').reduce((t, p) => t * 60 + Number(p), 0);
    return {
      guid,
      title: plain(field(b, 'title')),
      date: new Date(decode(field(b, 'pubDate'))),
      link: decode(field(b, 'link')),
      description: plain(field(b, 'description') || field(b, 'content:encoded')),
      minutes: seconds ? Math.max(1, Math.round(seconds / 60)) : 0,
    };
  }).filter((i) => i.guid && i.title && !Number.isNaN(i.date.getTime()))
    .sort((a, b) => a.date - b.date);
}

// ---- Email -----------------------------------------------------------------------

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Link to the episode's page on the site when data/episodes.json has it.
function siteUrl(item) {
  try {
    const { episodes } = JSON.parse(readFileSync(join(ROOT, 'data', 'episodes.json'), 'utf8'));
    const t = norm(item.title);
    const hit = episodes.find((e) => norm(e.title) === t) ||
      episodes.find((e) => t.startsWith(norm(e.title) + ' ') && norm(e.title).length > 8);
    if (hit) return `${SITE}/episodes/${hit.slug}/`;
  } catch (e) { /* fall through */ }
  return item.link || `${SITE}/#episodes`;
}

function snippet(text, max = 420) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(' ', max)).replace(/[\s,;:.—-]+$/, '') + '…';
}

function renderEmail(item) {
  const url = siteUrl(item);
  const when = item.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const meta = [when, item.minutes ? `${item.minutes} min` : ''].filter(Boolean).join(' · ');
  const blurb = snippet(item.description);
  const preview = snippet(item.description, 110);
  const subject = `New episode: ${item.title}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #ded8cb;">
<tr><td style="padding:22px 28px;background:#0b0f14;">
  <span style="font:800 20px 'Arial Narrow',Arial,sans-serif;letter-spacing:.5px;text-transform:uppercase;color:#f4f1ea;">Medics<span style="color:#ff5a3c;">Musings</span></span>
</td></tr>
<tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#14181d;">
  <div style="font:600 12px 'Courier New',monospace;letter-spacing:1.5px;text-transform:uppercase;color:#17825c;">New episode</div>
  <h1 style="margin:10px 0 6px;font:800 28px/1.1 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;color:#14181d;">${esc(item.title)}</h1>
  <div style="font:12px 'Courier New',monospace;letter-spacing:.5px;text-transform:uppercase;color:#5b6472;">${esc(meta)}</div>
  <p style="margin:18px 0 22px;font-size:16px;line-height:1.55;color:#3a424d;">${esc(blurb)}</p>
  <a href="${esc(url)}" style="display:inline-block;background:#d8431e;color:#ffffff;text-decoration:none;font:600 14px 'Courier New',monospace;letter-spacing:1px;text-transform:uppercase;padding:13px 22px;">Listen now</a>
  <p style="margin:22px 0 0;font-size:13px;color:#5b6472;">Also on
    <a href="${SHOW.spotify}" style="color:#17825c;">Spotify</a> ·
    <a href="${SHOW.apple}" style="color:#17825c;">Apple Podcasts</a> ·
    <a href="${SHOW.youtube}" style="color:#17825c;">YouTube</a></p>
</td></tr>
<tr><td style="padding:26px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#7a828e;">
  <hr style="border:none;border-top:1px solid #ded8cb;margin:0 0 16px;">
  Medics Musings is satire made for entertainment. Episodes are AI-generated conversations; characters and stories may be fictional, and nothing here is medical advice.<br><br>
  You're getting this because you signed up for new-episode emails at medicsmusings.com.<br>
  <a href="*|UNSUB|*" style="color:#7a828e;">Unsubscribe</a> · <a href="*|UPDATE_PROFILE|*" style="color:#7a828e;">Update preferences</a><br>
  *|LIST:ADDRESSLINE|*
</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, preview, html, url };
}

// ---- Mailchimp ------------------------------------------------------------------------

async function mc(path, method = 'GET', body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from('medicsmusings:' + API_KEY).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { /* non-JSON error page */ }
  if (res.status === 401) {
    // Describe the key's shape (never its value) to make a bad paste easy to spot.
    const [id, dc] = API_KEY.split('-');
    console.error(`Key check: ${API_KEY.length} characters (expected 36), ${/^[0-9a-f]{32}$/.test(id || '') ? 'starts with 32 hex characters (good)' : 'does NOT start with 32 hex characters'}, datacenter suffix "${dc || 'missing'}" (expected "us2").`);
  }
  if (!res.ok) throw new Error(`Mailchimp ${method} ${path} -> ${res.status}: ${json.detail || json.title || text.slice(0, 200)}`);
  return json;
}

const tagFor = (item) => createHash('sha1').update(item.guid).digest('hex').slice(0, 8);

// Returns true when the episode has been emailed (or should not be), false otherwise.
async function deliver(item, email) {
  const tag = tagFor(item);
  const title = `${item.title} [${tag}]`;

  const list = await mc(`/lists/${LIST_ID}?fields=name,campaign_defaults,stats.member_count`);
  const defaults = list.campaign_defaults || {};
  if (!defaults.from_email || !defaults.from_name) {
    throw new Error('The audience has no default from name/email. Set them in Mailchimp: Audience > Settings > Audience name and defaults.');
  }
  console.log(`Audience "${list.name}": ${list.stats.member_count} subscribers`);

  const found = (await mc(`/campaigns?list_id=${LIST_ID}&count=200&sort_field=create_time&sort_dir=DESC&fields=campaigns.id,campaigns.status,campaigns.settings.title`))
    .campaigns.filter((c) => (c.settings.title || '').includes(`[${tag}]`));
  if (found.some((c) => ['sent', 'sending', 'schedule'].includes(c.status))) {
    console.log('Already emailed (found a sent campaign in Mailchimp); skipping.');
    return true;
  }
  if (MODE === 'send' && list.stats.member_count === 0) {
    console.log('The audience has no subscribers yet; nothing to send.');
    return true;
  }

  let id = found.find((c) => c.status === 'save')?.id;
  const settings = {
    subject_line: email.subject,
    preview_text: email.preview,
    title,
    from_name: defaults.from_name,
    reply_to: defaults.from_email,
  };
  if (id) {
    await mc(`/campaigns/${id}`, 'PATCH', { settings });
    console.log(`Reusing draft campaign ${id}`);
  } else {
    id = (await mc('/campaigns', 'POST', { type: 'regular', recipients: { list_id: LIST_ID }, settings })).id;
    console.log(`Created campaign ${id}`);
  }
  await mc(`/campaigns/${id}/content`, 'PUT', { html: email.html });

  if (MODE === 'draft') {
    console.log(`Draft ready in Mailchimp (Campaigns > "${title}"). Not sent.`);
    return false;
  }
  if (MODE === 'test') {
    const to = process.env.TEST_EMAIL || defaults.from_email;
    await mc(`/campaigns/${id}/actions/test`, 'POST', { test_emails: [to], send_type: 'html' });
    console.log(`Test email sent to ${to}. Not sent to the audience.`);
    return false;
  }

  const check = await mc(`/campaigns/${id}/send-checklist`);
  if (!check.is_ready) {
    const problems = (check.items || []).filter((i) => i.type === 'error').map((i) => i.details);
    throw new Error('Mailchimp says the campaign is not ready: ' + problems.join(' | '));
  }
  await mc(`/campaigns/${id}/actions/send`, 'POST');
  console.log(`Sent campaign ${id} to ${list.stats.member_count} subscribers.`);
  return true;
}

// ---- Main -------------------------------------------------------------------------------

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return new Set(JSON.parse(readFileSync(STATE_FILE, 'utf8')).known || []);
}

function saveState(known) {
  if (MODE !== 'send') return;
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ known: [...known].slice(-300), updated: new Date().toISOString() }, null, 2) + '\n');
}

async function main() {
  const res = await fetch(FEED, { headers: { 'User-Agent': 'medicsmusings-newsletter/1.0' } });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const items = parseFeed(await res.text());
  if (!items.length) throw new Error('No episodes found in the feed; refusing to continue.');
  console.log(`Feed has ${items.length} episode(s); newest: "${items.at(-1).title}" (${items.at(-1).date.toISOString()})`);

  let known = loadState();
  if (!known) {
    known = new Set(items.map((i) => i.guid));
    console.log(`First run: recorded ${known.size} existing episode(s) as already seen. Nothing emailed.`);
    saveState(known);
    if (!FORCE) return;
  }

  const targets = FORCE ? [items.at(-1)] : items.filter((i) => !known.has(i.guid));
  if (!targets.length) { console.log('No new episodes.'); return; }

  for (const item of targets) {
    const ageDays = (Date.now() - item.date.getTime()) / 86400000;
    if (!FORCE && ageDays > MAX_AGE_DAYS) {
      console.log(`Skipping "${item.title}": published ${Math.round(ageDays)} days ago (limit ${MAX_AGE_DAYS}).`);
      known.add(item.guid);
      continue;
    }
    const email = renderEmail(item);
    console.log(`\nEpisode: ${item.title}\nSubject: ${email.subject}\nButton:  ${email.url}`);
    writeFileSync(PREVIEW_FILE, email.html);

    if (MODE === 'dry-run') { console.log(`Dry run: preview written to ${PREVIEW_FILE}; nothing sent.`); continue; }
    if (!API_KEY) {
      console.log('MAILCHIMP_API_KEY is not set, so nothing was sent. Add it as a repository secret to enable emails.');
      continue;
    }
    if (await deliver(item, email)) known.add(item.guid);
  }
  saveState(known);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
