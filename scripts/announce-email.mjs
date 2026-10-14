// Emails the Mailchimp audience a one-off announcement (not tied to a podcast
// episode). Content lives in data/announcements/<ANNOUNCE_ID>.json. Runs from
// .github/workflows/announce-email.yml.
//
//   MODE=dry-run  write the preview, change nothing (default when run by hand)
//   MODE=draft    create the campaign in Mailchimp but don't send it
//   MODE=test     send a test copy to TEST_EMAIL (default: the list's from address)
//   MODE=send     send to the whole audience
//
// Safety: the campaign title carries the announcement id, and a campaign that
// was already sent (or is sending) under that title is never sent twice.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST_ID = process.env.MAILCHIMP_LIST_ID || '8cbe14ef1a';
const API_KEY = (process.env.MAILCHIMP_API_KEY || '').trim().replace(/^["']+|["']+$/g, '');
const API_BASE = process.env.MAILCHIMP_API_BASE || `https://${API_KEY.split('-')[1] || 'us2'}.api.mailchimp.com/3.0`;
const MODE = process.env.MODE || 'dry-run';
const ID = process.env.ANNOUNCE_ID;
const PREVIEW_FILE = process.env.PREVIEW_FILE || join(ROOT, 'announcement-preview.html');

if (!['dry-run', 'draft', 'test', 'send'].includes(MODE)) throw new Error(`Unknown MODE "${MODE}"`);
if (!ID) throw new Error('Set ANNOUNCE_ID to the name of a file in data/announcements/.');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const a = JSON.parse(readFileSync(join(ROOT, 'data', 'announcements', `${ID}.json`), 'utf8'));

function render() {
  const paragraphs = a.body.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#3a424d;">${esc(p)}</p>`).join('\n  ');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(a.preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #ded8cb;">
<tr><td style="padding:22px 28px;background:#0b0f14;">
  <span style="font:800 20px 'Arial Narrow',Arial,sans-serif;letter-spacing:.5px;text-transform:uppercase;color:#f4f1ea;">Medics<span style="color:#ff5a3c;">Musings</span></span>
</td></tr>
<tr><td style="padding:0;"><a href="${esc(a.url)}"><img src="${esc(a.image)}" width="600" alt="${esc(a.imageAlt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>
<tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#14181d;">
  <div style="font:600 12px 'Courier New',monospace;letter-spacing:1.5px;text-transform:uppercase;color:#17825c;">${esc(a.eyebrow)}</div>
  <h1 style="margin:10px 0 14px;font:800 28px/1.1 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;color:#14181d;">${esc(a.headline)}</h1>
  ${paragraphs}
  <a href="${esc(a.url)}" style="display:inline-block;background:#d8431e;color:#ffffff;text-decoration:none;font:600 14px 'Courier New',monospace;letter-spacing:1px;text-transform:uppercase;padding:13px 22px;">${esc(a.cta)}</a>
</td></tr>
<tr><td style="padding:26px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#7a828e;">
  <hr style="border:none;border-top:1px solid #ded8cb;margin:0 0 16px;">
  Medics Musings is satire made for entertainment. Episodes are AI-generated conversations; characters and stories may be fictional, and nothing here is medical advice.<br><br>
  You're getting this because you signed up for emails at medicsmusings.com.<br>
  <a href="*|UNSUB|*" style="color:#7a828e;">Unsubscribe</a> · <a href="*|UPDATE_PROFILE|*" style="color:#7a828e;">Update preferences</a><br>
  *|LIST:ADDRESSLINE|*
</td></tr>
</table></td></tr></table>
</body></html>`;
}

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
  if (!res.ok) throw new Error(`Mailchimp ${method} ${path} -> ${res.status}: ${json.detail || json.title || text.slice(0, 200)}`);
  return json;
}

async function main() {
  const html = render();
  writeFileSync(PREVIEW_FILE, html);
  console.log(`Announcement: ${a.subject}\nButton: ${a.url}\nPreview written to ${PREVIEW_FILE}`);
  if (MODE === 'dry-run') { console.log('Dry run: nothing sent.'); return; }
  if (!API_KEY) throw new Error('MAILCHIMP_API_KEY is not set.');

  // The email's image and button must be live before anyone is emailed.
  for (const u of [a.image, a.url.split('#')[0]]) {
    const r = await fetch(`${u}?check=${Date.now()}`);
    if (!r.ok) throw new Error(`${u} is not live yet (HTTP ${r.status}); not emailing.`);
  }

  const list = await mc(`/lists/${LIST_ID}?fields=name,campaign_defaults,stats.member_count`);
  const d = list.campaign_defaults || {};
  if (!d.from_email || !d.from_name) throw new Error('The audience has no default from name/email.');
  console.log(`Audience "${list.name}": ${list.stats.member_count} subscribers`);

  const title = `${a.subject} [announce:${ID}]`;
  const found = (await mc(`/campaigns?list_id=${LIST_ID}&count=200&sort_field=create_time&sort_dir=DESC&fields=campaigns.id,campaigns.status,campaigns.settings.title`))
    .campaigns.filter((c) => (c.settings.title || '') === title);
  if (found.some((c) => ['sent', 'sending', 'schedule'].includes(c.status))) {
    console.log('Already emailed (found a sent campaign in Mailchimp); skipping.');
    return;
  }

  const settings = { subject_line: a.subject, preview_text: a.preview, title, from_name: d.from_name, reply_to: d.from_email };
  let id = found.find((c) => c.status === 'save')?.id;
  if (id) await mc(`/campaigns/${id}`, 'PATCH', { settings, recipients: { list_id: LIST_ID } });
  else id = (await mc('/campaigns', 'POST', { type: 'regular', recipients: { list_id: LIST_ID }, settings })).id;
  await mc(`/campaigns/${id}/content`, 'PUT', { html });
  console.log(`Campaign ${id} ready.`);

  if (MODE === 'draft') { console.log(`Draft saved in Mailchimp as "${title}". Not sent.`); return; }
  if (MODE === 'test') {
    const to = process.env.TEST_EMAIL || d.from_email;
    await mc(`/campaigns/${id}/actions/test`, 'POST', { test_emails: [to], send_type: 'html' });
    console.log(`Test email sent to ${to}. Not sent to the audience.`);
    return;
  }

  const check = await mc(`/campaigns/${id}/send-checklist`);
  if (!check.is_ready) {
    throw new Error('Mailchimp says the campaign is not ready: ' + (check.items || []).filter((i) => i.type === 'error').map((i) => i.details).join(' | '));
  }
  if (list.stats.member_count === 0) { console.log('The audience has no subscribers; nothing to send.'); return; }
  await mc(`/campaigns/${id}/actions/send`, 'POST');
  console.log(`Sent campaign ${id} to ${list.stats.member_count} subscribers.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
