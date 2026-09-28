// Prints the GitHub issue body for today's News of the Day draft (used by
// .github/workflows/daily-news.yml): the pick, headline and take, or the
// candidates when nothing has been drafted yet.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.GITHUB_REPOSITORY || 'dangardner1/medics_musings';
const dir = join(ROOT, 'data', 'news');
const file = existsSync(dir) && readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
const d = file && JSON.parse(readFileSync(join(dir, file), 'utf8'));
if (!d || d.status === 'published') process.exit(0);

const out = [
  `News of the Day for ${d.date} is ready (${d.status}). **Nothing is published until you approve it.**`,
  '',
  'Check the take: satire aims at the system, never at patients or reporters, and no article text is quoted. To publish, set `"status"` to `"published"`, or ask Claude to "publish today\'s news".',
  '',
];
if (d.pick) {
  out.push(`### ${d.pick.headline}`, '', `Real story: [${d.pick.title}](${d.pick.url}) (${d.pick.source}, ${d.pick.date})`, '', `**Our take:** ${d.pick.take}`, '');
} else {
  out.push('No take drafted yet. Candidates:', '');
  for (const c of d.candidates) out.push(`- ${c.id}. [${c.title}](${c.url}) (${c.source}, ${c.date})`);
  out.push('');
}
out.push(`Edit or approve: https://github.com/${REPO}/edit/main/data/news/${file}`);
console.log(out.join('\n'));
