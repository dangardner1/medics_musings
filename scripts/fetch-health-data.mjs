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

// Weekly recall counts by class, for the trend chart: one openFDA count query per
// type and class, summed into Monday-start weeks. The newest week is partial.
const TREND_WEEKS = 26;
const CLASSES = { 'Class I': 'I', 'Class II': 'II', 'Class III': 'III' };
const weekStart = (yyyymmdd) => {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return ymd(d);
};
async function recallTrend(end) {
  const first = new Date(end.getTime() - TREND_WEEKS * 7 * 86400000);
  const range = `report_date:%5B${compact(first)}+TO+${compact(end)}%5D`;
  const weeks = new Map();
  for (const key of Object.keys(CATEGORIES)) {
    for (const [cls, code] of Object.entries(CLASSES)) {
      const json = await getJson(`https://api.fda.gov/${key}/enforcement.json?search=${range}+AND+classification.exact:%22${cls.replace(' ', '+')}%22&count=report_date`);
      for (const r of json?.results || []) {
        const w = weekStart(r.time);
        const row = weeks.get(w) || { week: w, I: 0, II: 0, III: 0 };
        row[code] += r.count;
        weeks.set(w, row);
      }
    }
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

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

  let trend = old?.trend || [];
  try { trend = await recallTrend(end); } catch (e) { console.log(`::warning::recall trend not updated: ${e.message}`); }

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
    trend,
    previousTotal: old?.counts?.total ?? null,
    newIds,
    recalls: rows,
  });
  return `${rows.length} recalls (${newIds.length} new since last run)`;
}

// ---- ER wait times (CMS Care Compare, Timely and Effective Care) -----------------------
// OP_18b: median minutes from ER arrival to leaving (patients sent home).
// OP_18c: the same for psychiatric/mental health patients.
// OP_22: percent of patients who left before being seen.  EDV: ER volume band.
// CMS refreshes these quarterly; weekly runs only change the file when CMS does.

const CMS = 'https://data.cms.gov/provider-data/api/1';
const CMS_SETS = { national: 'isrn-hqyy', state: 'apyc-v239', hospital: 'yv7e-xc69' };
const ER_MEASURES = ['OP_18b', 'OP_18c', 'OP_22', 'EDV'];
const num = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
const usDate = (s) => (s ? `${s.slice(6, 10)}-${s.slice(0, 2)}-${s.slice(3, 5)}` : '');
// CMS names are upper case; make them readable without mangling initialisms.
const SMALL = new Set(['of', 'and', 'the', 'at', 'in', 'for', 'on', 'by']);
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[\w']+/g, (w, i) =>
  (i > 0 && SMALL.has(w) ? w : /^(llc|lp|inc|pc|ii|iii|iv|va|us|st)$/.test(w) ? (w === 'st' ? 'St' : w.length <= 3 && w !== 'inc' ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)) : w[0].toUpperCase() + w.slice(1)));

async function cmsQuery(set, measure) {
  const out = [];
  for (let offset = 0; ; ) {
    const url = `${CMS}/datastore/query/${set}/0?conditions%5B0%5D%5Bproperty%5D=measure_id&conditions%5B0%5D%5Bvalue%5D=${measure}&limit=1500&offset=${offset}&count=true`;
    const json = await getJson(url);
    if (!json || !Array.isArray(json.results)) throw new Error(`CMS ${set} ${measure}: unexpected response`);
    out.push(...json.results);
    offset += json.results.length;
    if (!json.results.length || offset >= (json.count || 0)) break;
  }
  return out;
}

async function erWait() {
  const file = 'data/er-wait.json';
  const old = readOld(file);
  const meta = await getJson(`${CMS}/metastore/schemas/dataset/items/${CMS_SETS.hospital}`);

  const byMeasure = {};
  for (const level of ['national', 'state', 'hospital']) {
    byMeasure[level] = {};
    for (const m of ER_MEASURES) {
      if (level !== 'hospital' && m === 'EDV') continue;
      byMeasure[level][m] = await cmsQuery(CMS_SETS[level], m);
    }
  }
  const nat = Object.fromEntries(Object.entries(byMeasure.national).map(([m, rows]) => [m, num(rows[0]?.score)]));
  if (!nat.OP_18b) throw new Error('CMS returned no national ER median; keeping the old file');

  const states = {};
  for (const [m, rows] of Object.entries(byMeasure.state)) {
    for (const r of rows) (states[r.state] ||= { state: r.state })[m] = num(r.score);
  }
  const hospitals = {};
  for (const [m, rows] of Object.entries(byMeasure.hospital)) {
    for (const r of rows) {
      const h = (hospitals[r.facility_id] ||= {
        id: r.facility_id, name: titleCase(r.facility_name), city: titleCase(r.citytown), state: r.state, zip: r.zip_code,
      });
      h[m] = m === 'EDV' ? (r.score && r.score !== 'Not Available' ? r.score : null) : num(r.score);
    }
  }
  // Keep hospitals that report the headline measure; count them per state.
  const reporting = Object.values(hospitals).filter((h) => h.OP_18b != null);
  for (const h of reporting) if (states[h.state]) states[h.state].hospitals = (states[h.state].hospitals || 0) + 1;

  const first = (m) => byMeasure.hospital[m]?.find((r) => r.start_date) || {};
  const period = (m) => ({ start: usDate(first(m).start_date), end: usDate(first(m).end_date) });
  const periods = { OP_18b: period('OP_18b'), OP_22: period('OP_22') };
  const newData = !old || old.periods?.OP_18b?.end !== periods.OP_18b.end;

  save(file, {
    source: 'CMS Care Compare, Timely and Effective Care (data.cms.gov/provider-data)',
    sourceModified: meta?.modified || '',
    fetched: ymd(new Date()),
    periods,
    national: nat,
    // When CMS releases a new period, remember the previous national median for "what changed".
    previousNational: newData ? old?.national || null : old?.previousNational || null,
    previousPeriodEnd: newData ? old?.periods?.OP_18b?.end || null : old?.previousPeriodEnd || null,
    states: Object.values(states).sort((a, b) => a.state.localeCompare(b.state)),
    hospitals: reporting.map((h) => ({ ...h, name: h.name })).sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name)),
  });
  return `national median ${nat.OP_18b} min; ${reporting.length} hospitals in ${Object.keys(states).length} states/territories${newData && old ? ' (new CMS period)' : ''}`;
}

// ---- Run ----------------------------------------------------------------------------

const DATASETS = { recalls, 'er-wait': erWait };
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
