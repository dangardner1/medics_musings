// Gathers this week's candidates for the two weekly Top 10 lists and writes a
// draft for each to data/top10/<list>/<YYYY-Www>.json:
//
//   ai-health   Top 10 AI in Health Care: papers (PubMed) and health news
//   ai-updates  Top 10 AI Updates: model releases and AI news
//
// Nothing here publishes. A draft has "status": "draft" (candidates only) or
// "review" (10 picks with satirical takes drafted by Claude when ANTHROPIC_API_KEY
// is set). build-extras.mjs only builds weeks marked "published", which a person
// sets after checking the picks and takes (.github/workflows/top10.yml opens a
// pull request for that).
//
//   node scripts/fetch-top10.mjs              # both lists, this week
//   node scripts/fetch-top10.mjs ai-updates   # just one
//
// Only headline, outlet, link and date are stored for publishing. Feed
// summaries are used to judge relevance and are never written to the site.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UA, ymd, decode, feed } from './lib/feeds.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const CANDIDATES = 30;

// ---- Week ---------------------------------------------------------------------------

// ISO week of the day before the run, so a Monday run covers the week just ended.
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
const now = new Date();
const WEEK = isoWeek(new Date(now - DAY));
const since = new Date(now - 7 * DAY);

// ---- PubMed -------------------------------------------------------------------------

const JOURNALS = ['N Engl J Med', 'NEJM AI', 'JAMA', 'JAMA Netw Open', 'JAMA Intern Med', 'Lancet', 'Lancet Digit Health', 'BMJ', 'Nat Med', 'NPJ Digit Med', 'Nature', 'Science', 'Ann Intern Med', 'Radiology', 'Radiol Artif Intell', 'J Am Med Inform Assoc', 'JAMA Oncol', 'Lancet Oncol', 'JAMA Health Forum', 'Health Aff (Millwood)'];
const AI_TERMS = '("artificial intelligence"[tiab] OR "large language model*"[tiab] OR ChatGPT[tiab] OR "machine learning"[tiab] OR "generative AI"[tiab] OR "deep learning"[tiab])';

async function pubmed() {
  const eu = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  const term = `${AI_TERMS} AND (${JOURNALS.map((j) => `"${j}"[ta]`).join(' OR ')})`;
  const search = await fetch(`${eu}/esearch.fcgi?db=pubmed&retmode=json&retmax=40&sort=relevance&datetype=edat&reldate=10&term=${encodeURIComponent(term)}`, { headers: UA }).then((r) => r.json());
  const ids = search.esearchresult?.idlist || [];
  if (!ids.length) return [];
  const sum = await fetch(`${eu}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`, { headers: UA }).then((r) => r.json());
  return ids.map((id) => sum.result?.[id]).filter(Boolean)
    // Skip errata, corrections and retraction notices.
    .filter((a) => !(a.pubtype || []).some((t) => /erratum|correction|retraction/i.test(t)))
    .map((a) => ({
      title: decode(a.title).replace(/\.$/, ''),
      url: `https://pubmed.ncbi.nlm.nih.gov/${a.uid}/`,
      source: a.source,
      date: a.sortpubdate ? a.sortpubdate.slice(0, 10).replace(/\//g, '-') : ymd(now),
      time: now.getTime(),
      about: (a.pubtype || []).join(', '),
      paper: true,
    }));
}

// ---- Lists --------------------------------------------------------------------------

const AI_RE = /\b(A\.?I\.?|artificial intelligence|machine learning|LLMs?|large language|chatbots?|ChatGPT|GPT-?\d*|generative|algorithms?|ambient|scribes?|OpenAI|Anthropic|Claude|Gemini|Copilot|agentic|AI agents?|deep learning|neural)\b/;
const HEALTH_RE = /\b(health|medic|clinic|patient|hospital|disease|cancer|tumou?r|diagnos|drug|doctor|physician|nurs|radiolog|surg|FDA|therap|mental|psychiatr|cardi|screening|biomedic|genom|protein|virus|vaccine|care\b|insurer|Medicare|Medicaid)/i;
// Vendor case studies ("X cuts costs 60% with GPT"): real, but not news.
const CASE_STUDY_RE = /\b(with (GPT|Codex|OpenAI|Gemini|Claude)|boosts|saves|cut[s]? .* (time|cost)|ships .* in a day|improves .* \d+x)/i;
// General AI outlets, used by the health list only for health stories.
const AI_SOURCES = [
  ['OpenAI', 'https://openai.com/news/rss.xml', 4],
  ['Google', 'https://blog.google/technology/ai/rss/', 3],
  ['Google DeepMind', 'https://deepmind.google/blog/rss.xml', 3],
  ['Hugging Face', 'https://huggingface.co/blog/feed.xml', 1],
  ['The Verge', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 2],
  ['TechCrunch', 'https://techcrunch.com/category/artificial-intelligence/feed/', 2],
  ['MIT Technology Review', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 2],
  ['Ars Technica', 'https://arstechnica.com/ai/feed/', 2],
  ['Wired', 'https://www.wired.com/feed/tag/ai/latest/rss', 2],
];
const RELEASE_RE = /\b(launch|launches|released?|releases|introduc|announc|unveil|rolls? out|now available|new model|update[sd]?|open[- ]source|preview|beta|GPT-?\d|Gemini|Claude|Llama|Grok|Mistral|DeepSeek|Qwen)/i;

const LISTS = {
  'ai-health': {
    name: 'Top 10 AI in Health Care',
    brief: 'AI in health care: new papers and news stories about AI in medicine, hospitals, insurers, regulators and patients',
    sources: [
      ['STAT', 'https://www.statnews.com/category/health-tech/feed/', 3],
      ['STAT', 'https://www.statnews.com/feed/', 2],
      ['Fierce Healthcare', 'https://www.fiercehealthcare.com/rss/xml', 2],
      ['KFF Health News', 'https://kffhealthnews.org/feed/', 2],
      ['Healthcare Dive', 'https://www.healthcaredive.com/feeds/news/', 2],
      ['MedPage Today', 'https://www.medpagetoday.com/rss/headlines.xml', 2],
      ['FDA', 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml', 2],
      ...AI_SOURCES.map(([s, u]) => [s, u, 1, { healthOnly: true }]),
    ],
    papers: true,
    // Papers need AI in the title and, from general-science journals, a health angle.
    // Stories from AI outlets need a health angle in the headline.
    keep: (i) => (i.paper
      ? AI_RE.test(i.title) && !/\. Reply$|^More on /.test(i.title) && (!/^(Nature|Science)$/.test(i.source) || HEALTH_RE.test(i.title))
      : i.healthOnly ? HEALTH_RE.test(i.title) : AI_RE.test(`${i.title} ${i.about}`)),
    score: (i, w) => w + (i.paper ? 3 : 0) + (AI_RE.test(i.title) ? 3 : 0),
  },
  'ai-updates': {
    name: 'Top 10 AI Updates',
    brief: 'AI updates: new model releases, product launches, policy moves and research from the AI industry',
    sources: AI_SOURCES,
    keep: () => true,
    score: (i, w) => w + (RELEASE_RE.test(i.title) ? 3 : 0) + (AI_RE.test(i.title) ? 1 : 0) - (CASE_STUDY_RE.test(i.title) ? 4 : 0),
  },
};

const PER_SOURCE = 8;
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function gather(key) {
  const list = LISTS[key];
  const warnings = [];
  const items = [];
  const weightOf = new Map();
  for (const [source, url, weight, opts] of list.sources) {
    try {
      for (const i of await feed(source, url)) { items.push({ ...i, ...opts }); weightOf.set(items.at(-1), weight); }
    } catch (e) { warnings.push(e.message); }
  }
  if (list.papers) {
    try {
      for (const i of await pubmed()) { items.push(i); weightOf.set(i, 2); }
    } catch (e) { warnings.push(`PubMed: ${e.message}`); }
  }
  const seen = new Set();
  const perSource = {};
  const fresh = items
    .filter((i) => i.paper || (i.time && i.time >= since.getTime()))
    .filter(list.keep)
    .map((i) => ({ ...i, score: list.score(i, weightOf.get(i)) + (i.time ? (i.time - since.getTime()) / (7 * DAY) : 0) }))
    .sort((a, b) => b.score - a.score)
    .filter((i) => {
      const k = normTitle(i.title);
      const u = i.url.split('?')[0];
      if (seen.has(k) || seen.has(u)) return false;
      if ((perSource[i.source] = (perSource[i.source] || 0) + 1) > PER_SOURCE) return false;
      seen.add(k); seen.add(u);
      return true;
    })
    .slice(0, CANDIDATES);
  return { items: fresh, warnings };
}

// ---- Optional: Claude drafts the picks and takes ---------------------------------------

const STYLE = `You write for Medics Musings, a satirical medical podcast by two physicians. For each pick, write a one- or two-sentence satirical take (max 45 words).
Rules:
- Mock the hype, the press release, the system and the incentives. Never mock patients, and never mock the authors or reporters.
- Don't misstate what the story or paper is about; the headline links to the real thing. Don't invent numbers or results.
- No quotes from the article. You only see the headline and a short summary.
- Dry, deadpan, clinically literate. No emojis, no hashtags.`;

async function draftWithClaude(key, candidates) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || candidates.length < 10) return null;
  const list = LISTS[key];
  const prompt = `${STYLE}

This week's list is "${list.name}" (${list.brief}). From the candidates below, pick the 10 most interesting and important for doctors and curious listeners, ranked 1 (best) to 10. Prefer variety of sources and topics; skip near-duplicates and minor items.

Reply with only JSON: {"picks":[{"id":<candidate number>,"take":"..."}]}

Candidates:
${candidates.map((c, n) => `${n}. [${c.source}, ${c.date}] ${c.title}${c.about ? ` — ${c.about.slice(0, 240)}` : ''}`).join('\n')}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.TOP10_MODEL || 'claude-sonnet-5', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = (await res.json()).content?.map((b) => b.text || '').join('') || '';
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const picks = (json.picks || [])
    .filter((p) => candidates[p.id] && typeof p.take === 'string' && p.take.trim())
    .slice(0, 10)
    .map((p, n) => ({ rank: n + 1, ...pickOf(candidates[p.id]), take: p.take.trim() }));
  return picks.length === 10 ? picks : null;
}

const pickOf = ({ title, source, url, date }) => ({ title, source, url, date });

// ---- Run ----------------------------------------------------------------------------

const only = process.argv.slice(2);
for (const key of Object.keys(LISTS)) {
  if (only.length && !only.includes(key)) continue;
  const dir = join(ROOT, 'data', 'top10', key);
  const file = join(dir, `${WEEK}.json`);
  if (existsSync(file)) {
    const old = JSON.parse(readFileSync(file, 'utf8'));
    if (old.status !== 'draft') { console.log(`${key} ${WEEK}: already ${old.status}; left alone.`); continue; }
  }
  const { items, warnings } = await gather(key);
  for (const w of warnings) console.log(`::warning::${key}: ${w}`);
  if (!items.length) { console.log(`::warning::${key}: no candidates this week; nothing written.`); continue; }
  let picks = null;
  try { picks = await draftWithClaude(key, items); } catch (e) { console.log(`::warning::${key}: ${e.message}`); }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({
    list: key,
    week: WEEK,
    start: ymd(since),
    end: ymd(new Date(now - DAY)),
    status: picks ? 'review' : 'draft',
    generated: now.toISOString(),
    picks: picks || [],
    candidates: items.map((i, n) => ({ id: n, ...pickOf(i) })),
  }, null, 1) + '\n');
  console.log(`${key} ${WEEK}: ${items.length} candidates${picks ? ', 10 picks drafted for review' : ''}.`);
}
