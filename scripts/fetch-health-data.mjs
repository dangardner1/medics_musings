// Fetches the public health data behind the site's live tables and writes it to
// data/*.json, which build-episodes.mjs turns into pages. Runs weekly from
// .github/workflows/health-data.yml, or by hand:
//
//   node scripts/fetch-health-data.mjs            # every dataset
//   node scripts/fetch-health-data.mjs recalls    # just one
//
// Datasets:
//   recalls  FDA drug, device and food recalls from the last 30 days (openFDA)
//
// If a source is down or returns something unexpected, that dataset keeps its
// last good file (the page shows its "updated" date) and the run carries on.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'medicsmusings.com health-data bot' };

const readOld = (file) => (existsSync(join(ROOT, file)) ? JSON.parse(readFileSync(join(ROOT, file), 'utf8')) : null);
const save = (file, value) => writeFileSync(join(ROOT, file), JSON.stringify(value, null, 1) + '\n');
const ymd = (d) => d.toISOString().slice(0, 10);
const compact = (d) => ymd(d).replace(/-/g, '');
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)).replace(/[\s,;:.]+$/, '') + '…';
};

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (res.status === 404) return null; // openFDA answers "no matches" with a 404
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// ---- Recalls (openFDA enforcement reports) ------------------------------------------

const RECALL_DAYS = 30;
const CATEGORIES = { drug: 'Drug', device: 'Device', food: 'Food' };

async function recalls() {
  const file = 'data/recalls.json';
  const old = readOld(file);
  const end = new Date();
  const start = new Date(end.getTime() - RECALL_DAYS * 86400000);
  const range = `report_date:%5B${compact(start)}+TO+${compact(end)}%5D`;
  const rows = [];
  let sourceUpdated = '';

  for (const [key, label] of Object.entries(CATEGORIES)) {
    for (let skip = 0; ; skip += 1000) {
      const json = await getJson(`https://api.fda.gov/${key}/enforcement.json?search=${range}&limit=1000&skip=${skip}`);
      if (!json) break;
      if (!Array.isArray(json.results)) throw new Error(`openFDA ${key}: unexpected response`);
      sourceUpdated = json.meta?.last_updated || sourceUpdated;
      for (const r of json.results) {
        const d = r.report_date || '';
        rows.push({
          id: r.recall_number,
          date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
          category: label,
          classification: r.classification,
          product: clip(r.product_description, 160),
          firm: r.recalling_firm,
          reason: clip(r.reason_for_recall, 220),
          status: r.status,
          distribution: clip(r.distribution_pattern, 80),
        });
      }
      if (skip + 1000 >= (json.meta?.results?.total || 0)) break;
    }
  }
  if (!rows.length) throw new Error('openFDA returned no recalls at all; keeping the old file');

  // Newest first; the most serious class first within a day.
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.classification.localeCompare(b.classification));
  const oldIds = new Set((old?.recalls || []).map((r) => r.id));
  const newIds = old ? rows.filter((r) => !oldIds.has(r.id)).map((r) => r.id) : [];
  const count = (pred) => rows.filter(pred).length;

  save(file, {
    source: 'openFDA enforcement reports (api.fda.gov/{drug,device,food}/enforcement)',
    sourceUpdated,
    fetched: ymd(end),
    windowDays: RECALL_DAYS,
    counts: {
      total: rows.length,
      classI: count((r) => r.classification === 'Class I'),
      ...Object.fromEntries(Object.values(CATEGORIES).map((c) => [c.toLowerCase(), count((r) => r.category === c)])),
    },
    previousTotal: old?.counts?.total ?? null,
    newIds,
    recalls: rows,
  });
  return `${rows.length} recalls (${newIds.length} new since last run)`;
}

// ---- Run ----------------------------------------------------------------------------

const DATASETS = { recalls };
const only = process.argv.slice(2);
let failed = 0;
for (const [name, run] of Object.entries(DATASETS)) {
  if (only.length && !only.includes(name)) continue;
  try {
    console.log(`${name}: ${await run()}`);
  } catch (e) {
    failed++;
    // GitHub Actions shows ::warning:: lines on the run summary.
    console.log(`::warning::${name} not updated (kept the last good data): ${e.message}`);
  }
}
if (failed && failed === Object.keys(DATASETS).filter((n) => !only.length || only.includes(n)).length) {
  console.log('Every dataset failed; nothing changed.');
}
