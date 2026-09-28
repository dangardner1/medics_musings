// Prints the GitHub issue body for this week's Top 10 drafts (used by
// .github/workflows/top10.yml). Lists each draft's picks and takes, or its
// candidates when no takes have been drafted yet.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.GITHUB_REPOSITORY || 'dangardner1/medics_musings';
const NAMES = { 'ai-health': 'Top 10 AI in Health Care', 'ai-updates': 'Top 10 AI Updates' };
const out = [];
for (const [key, name] of Object.entries(NAMES)) {
  const dir = join(ROOT, 'data', 'top10', key);
  if (!existsSync(dir)) continue;
  const file = readdirSync(dir).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f)).sort().at(-1);
  if (!file) continue;
  const d = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  if (d.status === 'published') continue;
  const path = `data/top10/${key}/${file}`;
  out.push(`## ${name}, ${d.week} (${d.start} to ${d.end}): ${d.status}`, '');
  if (d.picks.length) {
    for (const p of d.picks) out.push(`${p.rank}. **[${p.title}](${p.url})** (${p.source})  `, `   ${p.take}`);
  } else {
    out.push('No takes drafted yet. Candidates:', '');
    for (const c of d.candidates) out.push(`- ${c.id}. [${c.title}](${c.url}) (${c.source}, ${c.date})`);
  }
  out.push('', `Edit or approve: https://github.com/${REPO}/edit/main/${path} (change \`"status"\` to \`"published"\` and commit; the site rebuilds itself).`, '');
}
console.log(out.length ? [
  'This week\'s Top 10 drafts are ready. **Nothing is published until you approve it.**',
  '',
  'Check each take (satire aims at the hype, never at authors or patients; no article text quoted). To publish, set the file\'s status to "published", or ask Claude to "publish the Top 10".',
  '',
  ...out,
].join('\n') : '');
