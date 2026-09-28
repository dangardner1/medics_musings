// RSS/Atom reading shared by the news scripts (fetch-top10.mjs,
// fetch-daily-news.mjs). Keeps only headline, link, outlet and date for
// publishing; `about` (the feed summary) is for judging relevance and is never
// written to the site.
export const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; medicsmusings.com news bot)' };
export const ymd = (d) => d.toISOString().slice(0, 10);

export const decode = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&(quot|apos|#39|lt|gt|nbsp|amp);/g, (_, e) => ({ quot: '"', apos: "'", '#39': "'", lt: '<', gt: '>', nbsp: ' ', amp: '&' }[e]))
  .replace(/\s+/g, ' ').trim();
export const tag = (xml, name) => (xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i')) || [])[1];

export async function feed(source, url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
  const xml = await res.text();
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const link = decode(tag(b, 'link')) || (b.match(/<link\b[^>]*href="([^"]+)"/i) || [])[1] || '';
    const when = new Date(decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
    return {
      title: decode(tag(b, 'title')).replace(/^STAT\+:\s*/, ''),
      url: link.trim().replace(/[?&]utm_[^#]*$/, ''),
      source,
      date: Number.isNaN(+when) ? '' : ymd(when),
      time: +when || 0,
      about: decode(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 400),
    };
  }).filter((i) => i.title && /^https?:\/\//.test(i.url));
}
