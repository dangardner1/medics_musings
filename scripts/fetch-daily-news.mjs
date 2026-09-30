// Writes the day's "Health Care News of the Day": one real health care story
// with a satirical headline and take, to data/news/<YYYY-MM-DD>.json.
//
// Auto-publish: with ANTHROPIC_API_KEY set, Claude picks the story and writes
// the headline and take, a second Claude pass checks them against the rules
// below, and a word check screens for patient-directed jokes. If everything
// passes, the day is saved as "published" and the workflow rebuilds the site.
// If any check fails, it's saved as "review" and an issue asks a person to
// look. Without an API key it saves "draft" (candidates only).
// Set NEWS_AUTO_PUBLISH=0 to always stop at "review".
//
//   node scripts/fetch-daily-news.mjs            # today (UTC date)
//   node scripts/fetch-daily-news.mjs 2026-09-28 # a given date's file
//
// Only headline, outlet, link and date are stored for publishing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ymd, feed } from './lib/feeds.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Last 36 hours; after quiet days (weekends) widen to 4 days.
const WINDOWS = [36, 96];
const MIN_CANDIDATES = 6;
const CANDIDATES = 15;

const SOURCES = [
  ['STAT', 'https://www.statnews.com/feed/', 3],
  ['STAT', 'https://www.statnews.com/category/health-tech/feed/', 2],
  ['KFF Health News', 'https://kffhealthnews.org/feed/', 3],
  ['Fierce Healthcare', 'https://www.fiercehealthcare.com/rss/xml', 2],
  ['Healthcare Dive', 'https://www.healthcaredive.com/feeds/news/', 2],
  ['MedPage Today', 'https://www.medpagetoday.com/rss/headlines.xml', 2],
  ['FDA', 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml', 1],
];

// Stories about the system: good satire targets.
const SYSTEM_RE = /\b(insurer|insurance|prior auth|Medicare|Medicaid|hospital|health system|price|pricing|billing|bill|cost|copay|premium|FDA|pharma|drugmaker|PBM|private equity|staffing|burnout|AI|algorithm|EHR|Epic|merger|layoff|CEO|lobby|CMS|HHS|coverage|claims?|denials?|telehealth|wellness|startup)\b/i;
// Never satirize these, whatever the angle.
const SENSITIVE_RE = /\b(dies|died|death|deaths|dead|kill|killed|killing|shooting|shot|suicide|overdose|abuse|abused|assault|rape|murder|child|children|kid|kids|infant|baby|babies|newborn|stillbirth|miscarriage|funeral|victim|war|genocide|famine|cancer patient|terminal|hospice|grief)\b/i;

const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const pickOf = ({ title, source, url, date }) => ({ title, source, url, date });

async function gather(now) {
  const items = [];
  const warnings = [];
  for (const [source, url, weight] of SOURCES) {
    try {
      for (const i of await feed(source, url)) items.push({ ...i, weight });
    } catch (e) { warnings.push(e.message); }
  }
  let list = [];
  for (const hours of WINDOWS) {
    list = rank(items, now.getTime() - hours * 3600000, hours);
    if (list.length >= MIN_CANDIDATES) break;
  }
  return { list, warnings };
}

function rank(items, since, hours) {
  const seen = new Set();
  return items
    .filter((i) => i.time && i.time >= since && !SENSITIVE_RE.test(i.title))
    .map((i) => ({ ...i, score: i.weight + (SYSTEM_RE.test(i.title) ? 3 : SYSTEM_RE.test(i.about) ? 1 : 0) + (i.time - since) / (hours * 3600000) }))
    .sort((a, b) => b.score - a.score)
    .filter((i) => {
      const k = normTitle(i.title);
      const u = i.url.split('?')[0];
      if (seen.has(k) || seen.has(u)) return false;
      seen.add(k); seen.add(u);
      return true;
    })
    .slice(0, CANDIDATES);
}

const STYLE = `You write for Medics Musings, a satirical medical podcast by two physicians.
Rules:
- The target is always the system: insurers, pharma, hospital and health-system executives, regulators, lobbyists, billing, bureaucracy, tech hype and press releases.
- Never make fun of patients: not their illnesses, bodies, ages, weight, money, intelligence, choices or suffering. Patients are the people the system is failing; the joke is on the system, on their side.
- Never mock the authors or reporters, and never target a private individual.
- Don't misstate what the story is about; the real headline is shown and linked right below yours. Don't invent numbers, quotes or results.
- No quotes from the article. You only see the headline and a short summary.
- Dry, deadpan, clinically literate. No emojis, no hashtags.
- Skip any story involving death, illness of a named person, children or violence.`;

async function claude(prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.NEWS_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = (await res.json()).content?.map((b) => b.text || '').join('') || '';
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

// Second opinion before anything auto-publishes.
async function reviewWithClaude(pick) {
  const verdict = await claude(`You are the standards editor for Medics Musings, a satirical medical podcast. Check this item against the rules.

${STYLE}

Real story headline: ${pick.title} (${pick.source})
Our satirical headline: ${pick.headline}
Our take: ${pick.take}

Fail it if it makes fun of patients in any way, targets a private individual, mocks the reporter or authors, states an invented fact or number as real, quotes the article, or covers death, children, violence or suicide. Also fail it if it isn't actually satirical.
Reply with only JSON: {"ok": true or false, "reason": "..."}`, 300);
  return { ok: verdict.ok === true, reason: String(verdict.reason || '') };
}

// Belt and braces: words that suggest the joke has turned on patients.
const PATIENT_JOKE_RE = /\b(fat|obese|lazy|stupid|dumb|idiot|moron|hypochondriac|whin(e|y|ing)|crazy|psycho|junkie|addict|senile|geezer|old (fool|coot)|drain on)\b/i;

async function draftWithClaude(candidates) {
  if (!process.env.ANTHROPIC_API_KEY || !candidates.length) return null;
  const prompt = `${STYLE}

Pick the ONE story below that makes the best satire of how health care works, then write:
- "headline": a satirical headline in the style of a newspaper, 12 words or fewer
- "take": our commentary, one to three sentences, 60 words or fewer

Reply with only JSON: {"id": <candidate number>, "headline": "...", "take": "..."}

Candidates:
${candidates.map((c, n) => `${n}. [${c.source}, ${c.date}] ${c.title}${c.about ? ` — ${c.about.slice(0, 240)}` : ''}`).join('\n')}`;
  const json = await claude(prompt, 800);
  const c = candidates[json.id];
  if (!c || !json.headline || !json.take) return null;
  return { ...pickOf(c), headline: String(json.headline).trim(), take: String(json.take).trim() };
}

const now = new Date();
const date = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] : ymd(now);
const dir = join(ROOT, 'data', 'news');
const file = join(dir, `${date}.json`);
if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).status !== 'draft') {
  console.log(`news ${date}: already in review or published; left alone.`);
} else {
  const { list, warnings } = await gather(now);
  for (const w of warnings) console.log(`::warning::news: ${w}`);
  if (!list.length) {
    console.log('::warning::news: no candidates today; nothing written.');
  } else {
    let pick = null;
    let status = 'draft';
    let check = null;
    try {
      pick = await draftWithClaude(list);
      if (pick) {
        status = 'review';
        const words = [pick.headline, pick.take].join(' ');
        check = PATIENT_JOKE_RE.test(words) || SENSITIVE_RE.test(words)
          ? { ok: false, reason: 'word check flagged the headline or take' }
          : await reviewWithClaude(pick);
        if (check.ok && process.env.NEWS_AUTO_PUBLISH !== '0') status = 'published';
        if (!check.ok) console.log(`::warning::news: held for review: ${check.reason}`);
      }
    } catch (e) { console.log(`::warning::news: ${e.message}`); }
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({
      date,
      status,
      generated: now.toISOString(),
      ...(check ? { check } : {}),
      pick,
      candidates: list.map((c, n) => ({ id: n, ...pickOf(c) })),
    }, null, 1) + '\n');
    console.log(`news ${date}: ${list.length} candidates; ${status}.`);
  }
}
