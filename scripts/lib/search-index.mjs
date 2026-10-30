// Builds /search-index.json: one flat list of everything the site-wide search
// (search.js) can find. Run by build-episodes.mjs on every build.
//   t = title, u = url, k = kind label, d = short description, x = extra search text
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n)).replace(/[\s,;:.—-]+$/, '') + '…';
};

// Pages that are a destination in themselves rather than a data record.
const PAGES = [
  ['All episodes', '/#episodes', 'Every Medics Musings episode, with search and topic filters.'],
  ['Topics and series', '/topics/', 'Browse episodes by topic or series.'],
  ['Explainers', '/explained/', 'Plain-English explainers for the medical terms the show jokes about.'],
  ['Teaching guides', '/teach/', 'Free discussion guides for residency, nursing and medical school.'],
  ['Eponym index', '/eponyms/', 'Who each surgical and medical eponym really belongs to.'],
  ['Psychiatry eponyms', '/eponyms/psychiatry/', 'Psychiatric and psychoanalytic eponyms.'],
  ['Surgery history timeline', '/timeline/', 'The real history behind the show\'s satire.'],
  ['Psychiatry timeline', '/timeline/psychiatry/', 'From black bile to the 988 hotline.'],
  ['Weekly Top 10', '/top-10/', 'The week\'s ten biggest AI-in-health-care and AI stories.'],
  ['Top 10 AI in Health Care', '/top-10/ai-in-health-care/', 'Weekly list of AI in medicine papers and stories.'],
  ['Top 10 AI Updates', '/top-10/ai-updates/', 'Weekly list of AI product and model updates.'],
  ['News of the day', '/news/', 'A satirical take on one real health care story each day.'],
  ['Health stats', '/stats/', 'FDA recalls, with a weekly trend chart.'],
  ['Games', '/games/', 'Name that eponym, Word Rounds and more.'],
  ['Name that eponym', '/games/eponym/', 'Daily guessing game.'],
  ['Word Rounds word search', '/games/word-rounds/', 'The daily medical word search.'],
  ['The Break Room', '/break-room/', 'Memo translator, pizza party certificates, burnout bingo and more.'],
  ['Admin memo translator', '/break-room/memo-translator/', 'Turns administrative memos into plain English.'],
  ['Pizza party certificate', '/break-room/pizza-party/', 'A certificate of appreciation, in lieu of a raise.'],
  ['Burnout bingo', '/break-room/burnout-bingo/', 'A daily bingo card for the hospital grind.'],
  ['Out-of-office generator', '/break-room/out-of-office/', 'Auto-replies for the overworked.'],
  ['Take Five', '/break-room/take-five/', 'A one-minute guided breathing pause for clinicians.'],
  ['Time to listen', '/break-room/time-to-listen/', 'How long until you can listen to this episode.'],
  ['Line of the day', '/line-of-the-day/', 'One quotable line from the show, every day.'],
  ['Submit a story', '/submit/', 'Send us your health care story.'],
  ['The Weekly Dose', '/weekly-dose/', 'Two satirical health care jokes and a cartoon, every Friday.'],
  ['Subscribe', '/subscribe/', 'Email updates and RSS feeds.'],
];

export function buildSearchIndex(root, { episodes, data }) {
  const read = (f) => JSON.parse(readFileSync(join(root, f), 'utf8'));
  const out = [];
  const add = (t, u, k, d, x = '') => out.push({ t, u, k, d: clip(d, 160), x: clip(x, 900) });

  for (const e of episodes) {
    const tags = (e.tags || []).map((g) => data.topics?.[g] || g).join(' ');
    add(e.title, `/episodes/${e.slug}/`, 'Episode', e.summary || e.description, `${tags} ${e.series ? data.series?.[e.series] || '' : ''} ${e.description || ''}`);
  }

  try {
    for (const x of read('data/explainers.json').explainers) add(x.title, `/explained/${x.slug}/`, 'Explainer', x.summary, `${x.term} ${x.dek || ''}`);
  } catch (e) { /* optional */ }

  const eponyms = [['data/eponyms.json', '/eponyms/'], ['data/eponyms-psychiatry.json', '/eponyms/psychiatry/']];
  for (const [file, page] of eponyms) {
    try { for (const r of read(file).entries) add(r.name, `${page}#${slugify(r.name)}`, 'Eponym', `${r.person}. ${r.what}`, `${r.years || ''} ${r.field || ''}`); } catch (e) { /* optional */ }
  }

  const timelines = [['data/timeline.json', '/timeline/'], ['data/timeline-psychiatry.json', '/timeline/psychiatry/']];
  for (const [file, page] of timelines) {
    try { for (const r of read(file).entries) add(`${r.yearLabel}: ${clip(r.event, 70)}`, `${page}#${r.slug}`, 'Timeline', r.event, r.field || ''); } catch (e) { /* optional */ }
  }

  try {
    for (const g of read('data/teaching.json').guides) {
      const ep = episodes.find((e) => e.slug === g.slug);
      if (ep) add(`Teaching guide: ${ep.title}`, `/teach/${g.slug}/`, 'Teaching guide', g.theme, `${g.audience} ${(g.objectives || []).join(' ')}`);
    }
  } catch (e) { /* optional */ }

  const newsDir = join(root, 'data', 'news');
  if (existsSync(newsDir)) {
    for (const f of readdirSync(newsDir).filter((n) => n.endsWith('.json')).sort().reverse()) {
      try {
        const n = read(`data/news/${f}`);
        if (n.status === 'published' && n.pick) add(n.pick.headline || n.pick.title, `/news/${n.date}/`, 'News of the day', n.pick.take, `${n.pick.title} ${n.pick.source || ''}`);
      } catch (e) { /* skip bad file */ }
    }
  }

  for (const [t, u, d] of PAGES) add(t, u, 'Page', d);

  writeFileSync(join(root, 'search-index.json'), JSON.stringify(out));
  return out.length;
}
