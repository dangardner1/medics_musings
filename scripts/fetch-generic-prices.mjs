// Fetches this week's Generic Price Check data: what a basket of common generics
// actually costs a retail pharmacy, from CMS's National Average Drug Acquisition
// Cost survey (NADAC, data.medicaid.gov), and writes data/generic-prices.json,
// which build-extras.mjs turns into /generic-price-check/.
//
//   node scripts/fetch-generic-prices.mjs
//
// CMS publishes a new NADAC file every Wednesday (one row per NDC, stamped with an
// "as of" date) and starts a new dataset each January, so the dataset is looked up
// by title rather than hard-coded. Each drug below is matched on its exact NADAC
// description; one description covers many NDCs that share a single price, and the
// median is used in case they ever differ. The weekly history is kept in the data
// file itself (52 weeks); the first run seeds it from the current year's dataset.
//
// If CMS is down, or a drug goes missing from the file, the old data is kept for it
// and the run says so. Runs weekly from .github/workflows/generic-prices.yml.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data', 'generic-prices.json');
const API = 'https://data.medicaid.gov/api/1';
const UA = { 'User-Agent': 'medicsmusings.com generic-price-check bot' };
const HISTORY_WEEKS = 52;

// slug, NADAC description (exact), what people call it, quantity and what that quantity is,
// and a standing note (satire; aimed at the pricing system, never at people taking the drug).
export const DRUGS = [
  ['atorvastatin', 'ATORVASTATIN 20 MG TABLET', 'Atorvastatin 20 mg', 30, 'a month’s supply', 'Lowers cholesterol for pennies. Raising the bill takes a team.'],
  ['lisinopril', 'LISINOPRIL 10 MG TABLET', 'Lisinopril 10 mg', 30, 'a month’s supply', 'The blood pressure comes down. The deductible does not.'],
  ['amlodipine', 'AMLODIPINE BESYLATE 5 MG TAB', 'Amlodipine 5 mg', 30, 'a month’s supply', 'About a penny a pill. The bill, on the other hand, has several digits.'],
  ['metformin', 'METFORMIN HCL 500 MG TABLET', 'Metformin 500 mg', 60, 'a month’s supply, twice a day', 'A 1950s drug with a 2020s explanation of benefits.'],
  ['levothyroxine', 'LEVOTHYROXINE 50 MCG TABLET', 'Levothyroxine 50 mcg', 30, 'a month’s supply', 'Measured in micrograms. Billed in dollars.'],
  ['omeprazole', 'OMEPRAZOLE DR 20 MG CAPSULE', 'Omeprazole 20 mg', 30, 'a month’s supply', 'Treats heartburn. The bill causes it.'],
  ['sertraline', 'SERTRALINE HCL 50 MG TABLET', 'Sertraline 50 mg', 30, 'a month’s supply', 'Cheaper than the phone call about whether it’s covered.'],
  ['losartan', 'LOSARTAN POTASSIUM 50 MG TAB', 'Losartan 50 mg', 30, 'a month’s supply', 'An ARB, not to be confused with arbitrage, which is what happens after it leaves the wholesaler.'],
  ['amoxicillin', 'AMOXICILLIN 500 MG CAPSULE', 'Amoxicillin 500 mg', 30, 'a ten-day course', 'Kills bacteria. The pricing model is resistant.'],
  ['prednisone', 'PREDNISONE 10 MG TABLET', 'Prednisone 10 mg', 20, 'a short course', 'A steroid. The markup, on the other hand, is natural.'],
  ['gabapentin', 'GABAPENTIN 300 MG CAPSULE', 'Gabapentin 300 mg', 90, 'a month’s supply, three times a day', 'Three times a day, one price a pill, several prices a claim.'],
  ['ibuprofen', 'IBUPROFEN 800 MG TABLET', 'Ibuprofen 800 mg', 90, 'a month’s supply, three times a day', 'Prescription strength. Prescription paperwork.'],
  ['hydrochlorothiazide', 'HYDROCHLOROTHIAZIDE 25 MG TAB', 'Hydrochlorothiazide 25 mg', 30, 'a month’s supply', 'A diuretic. Money also goes somewhere.'],
  ['montelukast', 'MONTELUKAST SOD 10 MG TABLET', 'Montelukast 10 mg', 30, 'a month’s supply', 'Helps you breathe. The price breathes on its own.'],
  ['rosuvastatin', 'ROSUVASTATIN CALCIUM 10 MG TAB', 'Rosuvastatin 10 mg', 30, 'a month’s supply', 'Once a brand-name blockbuster. Now a generic with a blockbuster explanation of benefits.'],
  ['metoprolol', 'METOPROLOL SUCC ER 25 MG TAB', 'Metoprolol succinate ER 25 mg', 30, 'a month’s supply', 'Slows the heart rate. The claims process needed no help.'],
  ['tamsulosin', 'TAMSULOSIN HCL 0.4 MG CAPSULE', 'Tamsulosin 0.4 mg', 30, 'a month’s supply', 'Improves flow. The money flows in one direction.'],
  ['fluoxetine', 'FLUOXETINE HCL 20 MG CAPSULE', 'Fluoxetine 20 mg', 30, 'a month’s supply', 'Famous since 1987, affordable since the patent expired, confusing ever since.'],
  ['pantoprazole', 'PANTOPRAZOLE SOD DR 40 MG TAB', 'Pantoprazole 40 mg', 30, 'a month’s supply', 'Delayed release, like the reimbursement.'],
  ['cephalexin', 'CEPHALEXIN 500 MG CAPSULE', 'Cephalexin 500 mg', 28, 'a seven-day course', 'Four times a day for a week. The prior authorization takes longer.'],
  ['azithromycin', 'AZITHROMYCIN 250 MG TABLET', 'Azithromycin 250 mg', 6, 'a five-day pack', 'Six tablets in five days. The explanation of benefits runs longer.'],
  ['furosemide', 'FUROSEMIDE 40 MG TABLET', 'Furosemide 40 mg', 30, 'a month’s supply', 'Removes excess fluid. Excess fees are handled elsewhere.'],
].map(([slug, nadac, name, qty, supply, note]) => ({ slug, nadac, name, qty, supply, note }));

const round5 = (n) => Math.round(n * 1e5) / 1e5;
const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url} -> ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// The newest "NADAC (National Average Drug Acquisition Cost) <year>" dataset.
async function currentDataset() {
  const json = await getJson(`${API}/search?fulltext=${encodeURIComponent('NADAC National Average Drug Acquisition Cost')}&page-size=50`);
  const items = Object.values(json.results || {});
  const yearly = items
    .map((d) => ({ id: d.identifier, title: d.title, year: Number((d.title || '').match(/^NADAC \(National Average Drug Acquisition Cost\) (\d{4})$/)?.[1]) }))
    .filter((d) => d.year)
    .sort((a, b) => b.year - a.year);
  if (!yearly.length) throw new Error('no yearly NADAC dataset found on data.medicaid.gov');
  return yearly[0];
}

function query(id, params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.append(k, v);
  return getJson(`${API}/datastore/query/${id}/0?${qs}`);
}

async function latestAsOf(id) {
  const json = await query(id, { limit: 1, 'sorts[0][property]': 'as_of_date', 'sorts[0][order]': 'desc', 'properties[0]': 'as_of_date', count: 'false' });
  const d = json.results?.[0]?.as_of_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) throw new Error('could not read the latest NADAC "as of" date');
  return d;
}

// Every weekly price for one description in a dataset: { 'YYYY-MM-DD': perUnit }.
async function history(id, description) {
  const byDate = {};
  for (let offset = 0; ; ) {
    const json = await query(id, {
      limit: 1000, offset,
      'conditions[0][property]': 'ndc_description', 'conditions[0][value]': description, 'conditions[0][operator]': '=',
      'properties[0]': 'as_of_date', 'properties[1]': 'nadac_per_unit', 'properties[2]': 'classification_for_rate_setting',
    });
    const rows = json.results || [];
    for (const r of rows) {
      if (r.classification_for_rate_setting && r.classification_for_rate_setting !== 'G') continue;
      const v = Number(r.nadac_per_unit);
      if (Number.isFinite(v) && v > 0) (byDate[r.as_of_date] ||= []).push(v);
    }
    offset += rows.length;
    if (!rows.length || offset >= (json.count || 0)) break;
  }
  return Object.fromEntries(Object.entries(byDate).map(([d, vs]) => [d, round5(median(vs))]));
}

// This week's price for one description.
async function priceOn(id, description, asOf) {
  const json = await query(id, {
    limit: 500,
    'conditions[0][property]': 'ndc_description', 'conditions[0][value]': description, 'conditions[0][operator]': '=',
    'conditions[1][property]': 'as_of_date', 'conditions[1][value]': asOf,
    'properties[0]': 'nadac_per_unit', 'properties[1]': 'effective_date', 'properties[2]': 'classification_for_rate_setting', 'properties[3]': 'pricing_unit',
  });
  const rows = (json.results || []).filter((r) => (r.classification_for_rate_setting || 'G') === 'G');
  const vals = rows.map((r) => Number(r.nadac_per_unit)).filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  return {
    perUnit: round5(median(vals)),
    unit: rows[0].pricing_unit || 'EA',
    effective: rows.map((r) => r.effective_date).sort().at(-1) || '',
    ndcs: rows.length,
  };
}

async function main() {
  const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
  const oldBySlug = new Map((old?.drugs || []).map((d) => [d.slug, d]));
  const ds = await currentDataset();
  const asOf = await latestAsOf(ds.id);
  if (old?.asOf === asOf) console.log(`NADAC is still as of ${asOf}; refreshing anyway.`);

  const drugs = [];
  const problems = [];
  for (const d of DRUGS) {
    const prev = oldBySlug.get(d.slug);
    let hist = { ...(prev?.history || {}) };
    try {
      // Seed from the whole year the first time; afterwards just add this week.
      if (Object.keys(hist).length < 4) hist = { ...hist, ...(await history(ds.id, d.nadac)) };
      const now = await priceOn(ds.id, d.nadac, asOf);
      if (!now) throw new Error(`not in the ${asOf} file`);
      hist[asOf] = now.perUnit;
      const dates = Object.keys(hist).sort().slice(-HISTORY_WEEKS);
      drugs.push({
        ...d, perUnit: now.perUnit, unit: now.unit, effective: now.effective, ndcs: now.ndcs,
        history: Object.fromEntries(dates.map((k) => [k, hist[k]])),
      });
    } catch (err) {
      problems.push(`${d.name}: ${err.message}`);
      if (prev) drugs.push({ ...prev, ...d, stale: true });
    }
  }
  if (!drugs.length) throw new Error(`no prices at all; keeping the old file\n${problems.join('\n')}`);

  const data = {
    source: {
      name: `NADAC (National Average Drug Acquisition Cost) ${ds.year}`,
      publisher: 'Centers for Medicare & Medicaid Services, via data.medicaid.gov',
      url: `https://data.medicaid.gov/dataset/${ds.id}`,
      about: 'https://www.medicaid.gov/medicaid/prescription-drugs/pharmacy-pricing/index.html',
    },
    asOf,
    fetched: new Date().toISOString().slice(0, 10),
    drugs,
  };
  writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`Generic Price Check: ${drugs.length} drugs as of ${asOf}${problems.length ? `; ${problems.length} kept from last week` : ''}.`);
  if (problems.length) {
    console.warn(problems.map((p) => `::warning::${p}`).join('\n'));
  }
}

main().catch((err) => {
  console.error(`::error::${err.message}`);
  process.exit(1);
});
