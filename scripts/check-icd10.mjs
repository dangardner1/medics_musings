// Checks data/icd10.json (the ICD-10 Code of the Day list) against the official
// ICD-10-CM code files, and with --write fills in each entry's official description.
//
//   node scripts/check-icd10.mjs [--write] FILE [FILE...]
//
// FILE is the plain-text code list from CDC's ICD-10-CM release: icd10cm-codes-<year>.txt
// inside the "Code Descriptions" zip on https://www.cdc.gov/nchs/icd/icd-10-cm/files.html
// (one code and description per line, codes without the decimal point).
//
// Pass this fiscal year's file and the next one's together, and re-run each October
// when the new fiscal year starts. Every entry has to exist, with the same
// description, in every file given. Exit code 1 if any entry fails.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/page.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('Usage: node scripts/check-icd10.mjs [--write] icd10cm-codes-2026.txt [icd10cm-codes-2027.txt ...]');
  process.exit(2);
}

const undot = (code) => code.replace('.', '').toUpperCase();
const load = (path) => new Map(readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
  const [code, ...rest] = line.trim().split(/\s+/);
  return [code, rest.join(' ')];
}));
const years = files.map((f) => ({ name: f.split(/[\\/]/).pop(), codes: load(f) }));

const dataPath = join(ROOT, 'data', 'icd10.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const problems = [];
const seen = new Set();

for (const e of data.entries) {
  const where = e.code;
  if (!/^[A-Z]\d[A-Z0-9](\.[A-Z0-9]{1,4})?$/.test(e.code)) problems.push(`${where}: not written like an ICD-10-CM code (e.g. W61.62XA)`);
  if (seen.has(e.code)) problems.push(`${where}: listed twice`);
  seen.add(e.code);
  if (!data.kinds[e.kind]) problems.push(`${where}: unknown kind "${e.kind}"`);
  if (!e.note || e.note.length > 200) problems.push(`${where}: note must be 1-200 characters`);

  const found = years.map((y) => ({ y: y.name, d: y.codes.get(undot(e.code)) }));
  const missing = found.filter((f) => f.d === undefined).map((f) => f.y);
  if (missing.length) { problems.push(`${where}: not in ${missing.join(', ')}`); continue; }
  const descs = [...new Set(found.map((f) => f.d))];
  if (descs.length > 1) { problems.push(`${where}: description differs between files: ${found.map((f) => `${f.y}="${f.d}"`).join(' | ')}`); continue; }
  if (write) e.description = descs[0];
  else if (e.description !== descs[0]) problems.push(`${where}: description is "${e.description || ''}", official is "${descs[0]}" (run with --write)`);
}

if (write && !problems.length) writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);

const counts = {};
for (const e of data.entries) counts[e.kind] = (counts[e.kind] || 0) + 1;
console.log(`${data.entries.length} entries checked against ${years.map((y) => `${y.name} (${y.codes.size} codes)`).join(', ')}`);
console.log(Object.entries(counts).map(([k, n]) => `${k}: ${n}`).join(', '));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(write ? 'Descriptions written from the official files.' : 'All codes and descriptions match.');
