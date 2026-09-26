// Shared podcast-feed helpers for the newsletter and episode-sync scripts.
export const FEED = process.env.FEED_URL || 'https://anchor.fm/s/117844514/podcast/rss';

export const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export const plain = (html) => decode(html).replace(/<\/(p|li|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

// Text of the first <name>...</name> in an XML fragment (no regex escapes needed).
function field(block, name) {
  const start = block.search(new RegExp('<' + name + '[ >]'));
  if (start < 0) return '';
  const open = block.indexOf('>', start);
  const end = block.indexOf('</' + name + '>', open);
  return end < 0 ? '' : block.slice(open + 1, end).trim();
}

export function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => {
    const guid = decode(field(b, 'guid')) || decode(field(b, 'link'));
    const secs = field(b, 'itunes:duration');
    let seconds = 0;
    if (/^\d+$/.test(secs)) seconds = Number(secs);
    else if (secs) seconds = secs.split(':').reduce((t, p) => t * 60 + Number(p), 0);
    return {
      guid,
      title: plain(field(b, 'title')),
      date: new Date(decode(field(b, 'pubDate'))),
      link: decode(field(b, 'link')),
      description: plain(field(b, 'description') || field(b, 'content:encoded')),
      minutes: seconds ? Math.max(1, Math.round(seconds / 60)) : 0,
    };
  }).filter((i) => i.guid && i.title && !Number.isNaN(i.date.getTime()))
    .sort((a, b) => a.date - b.date);
}

export async function fetchFeed() {
  const res = await fetch(FEED, { headers: { 'User-Agent': 'medicsmusings-bot/1.0' } });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  return parseFeed(await res.text());
}

export const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Find the entry whose title matches a feed title: exact first, then a feed title
// that is the entry's title plus a subtitle ("Title: Subtitle"). With `loose`, an
// entry title that extends the feed title also counts (for other platforms'
// listings). Near matches are only used when exactly one entry qualifies, so
// "Out of Touch" never lands on "Out of Touch: From Healing Touch...".
export function findByTitle(list, title, get = (x) => x.title, loose = false) {
  const t = norm(title);
  const exact = list.find((x) => norm(get(x)) === t);
  if (exact) return exact;
  const near = list.filter((x) => {
    const a = norm(get(x));
    return (a.length > 8 && t.startsWith(a + ' ')) || (loose && t.length > 8 && a.startsWith(t + ' '));
  });
  return near.length === 1 ? near[0] : undefined;
}
