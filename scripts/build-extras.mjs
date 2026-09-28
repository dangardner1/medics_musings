// Pages beyond the episode catalogue, built by build-episodes.mjs:
//   explained/            plain-English explainers (data/explainers.json), with FAQPage markup
//   teach/                discussion guides for teaching (data/teaching.json)
//   top-10/               weekly Top 10 lists (data/top10/), with an RSS feed each
//   submit/               listener story and guest submissions (sent through Formspree)
//   subscribe/            email-by-topic signup and the RSS feeds
//   feeds/*.xml           RSS for all episodes, each topic and each series
//   embed/<slug>/         a compact player other sites can put in an <iframe>
//   e/<n>/                short links (medicsmusings.com/e/12) used on clips and cards
//   episodes/<slug>/quotes/<n>/  share pages for quote cards (og/quotes/<slug>-<n>.jpg)
// Returns the sitemap entries for the indexable ones.
import { writeFileSync, mkdirSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, SITE, SHOW, INBOX, esc, jsonLd, readJson, dateLabel, snippet, clock,
  writePage, shareImage, pageHead, signupSection, footer, prefChoices,
} from './lib/page.mjs';

const EXPLAINED_URL = `${SITE}/explained/`;
const TEACH_URL = `${SITE}/teach/`;

const scripts = (...names) => names.map((n) => `<script src="/${n}" defer></script>`).join('\n');

function crumbs(items) {
  const parts = [`<a href="/">Home</a>`];
  items.forEach(([label, href]) => parts.push(href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`));
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join(' <span aria-hidden="true">/</span> ')}</nav>`;
}

function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [['Medics Musings', `${SITE}/`], ...items].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

const faqLd = (faq) => ({
  '@type': 'FAQPage',
  mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

export function faqSection(faq, heading = 'Frequently asked questions') {
  if (!faq?.length) return '';
  return `<section class="faq" aria-label="${esc(heading)}">
        <h2>${esc(heading)}</h2>
        ${faq.map(({ q, a }) => `<details class="faq-item">
          <summary>${esc(q)}</summary>
          <p>${esc(a)}</p>
        </details>`).join('\n        ')}
      </section>`;
}
export { faqLd };

const pageEnd = (data, { signup = true, js = ['signup.js', 'site.js'] } = {}) => `${signup ? signupSection(data) : ''}
</main>

${footer()}

${scripts(...js)}
</body>
</html>
`;

// ---- Explainers ------------------------------------------------------------------

function explainerPage(x, ctx) {
  const url = `${EXPLAINED_URL}${x.slug}/`;
  const eps = x.episodes.map((s) => ctx.bySlug.get(s)).filter(Boolean);
  const related = (x.related || []).map((s) => ctx.explainers.find((e) => e.slug === s)).filter(Boolean);
  // Eponyms named in the same episodes this explainer links to, not just a shared topic
  // (most eponyms share the "surgery" topic, which would otherwise match almost all of them).
  const relatedEponyms = [...(ctx.eponyms || []), ...(ctx.psychEponyms || [])].filter((r) => r.episodes.some((e) => x.episodes.includes(e.slug)));
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: x.title,
        description: x.summary,
        url,
        image: shareImage(null).url,
        inLanguage: 'en',
        about: { '@type': 'Thing', name: x.term },
        author: { '@type': 'Organization', name: 'Medics Musings', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'Medics Musings Productions', url: `${SITE}/` },
        isPartOf: { '@id': `${SITE}/#website` },
        mentions: eps.map((e) => ({ '@type': 'PodcastEpisode', name: e.title, url: e.url })),
      },
      faqLd(x.faq),
      breadcrumbLd([['Explainers', EXPLAINED_URL], [x.title, url]]),
    ],
  };
  const body = x.sections.map((s) => `<h2>${esc(s.h)}</h2>
        ${s.p.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}`).join('\n        ');
  return `${pageHead({ title: `${x.seoTitle} | Medics Musings`, description: x.summary, url, ogTitle: x.title, image: shareImage(null), type: 'article', ld })}
<main>
  <article class="explainer">
    <div class="wrap">
      ${crumbs([['Explainers', '/explained/'], [x.term]])}
      <span class="eyebrow">Explained · the real medicine behind the jokes</span>
      <h1>${esc(x.title)}</h1>
      <p class="dek">${esc(x.dek)}</p>
      <div class="prose">
        ${body}
      </div>
      ${faqSection(x.faq)}
      <section class="hear-it" aria-label="Episodes about this">
        <h2>Hear it on the show</h2>
        <ul class="coll-list">
          ${eps.map((e) => ctx.collectionCard(e)).join('\n          ')}
        </ul>
      </section>${related.length ? `
      <p class="related">Related: ${related.map((r) => `<a href="/explained/${r.slug}/">${esc(r.title)}</a>`).join(' · ')}</p>` : ''}${relatedEponyms.length ? `
      <p class="related">Related names: ${relatedEponyms.map((r) => `<a href="${r.page}#${slugify(r.name)}">${esc(r.name)}</a>`).join(' · ')} <a href="${relatedEponyms[0].page}">(full index)</a></p>` : ''}
${(x.topics || []).includes('mind') ? `
      <p class="related">History: <a href="/timeline/psychiatry/">The psychiatry and psychoanalysis timeline</a></p>` : ''}
      <p class="satire-note"><b>Not medical advice.</b> This page is general information, written to explain terms our satire leans on; it isn't a substitute for advice from your own clinician. In an emergency, call 911.</p>
    </div>
  </article>

${pageEnd(ctx.data)}`;
}

function explainedHub(ctx) {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        url: EXPLAINED_URL,
        name: 'Medical terms, explained',
        description: ctx.explainedData.intro,
        isPartOf: { '@id': `${SITE}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: ctx.explainers.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: `${EXPLAINED_URL}${x.slug}/`, name: x.title })),
        },
      },
      breadcrumbLd([['Explainers', EXPLAINED_URL]]),
    ],
  };
  return `${pageHead({ title: 'Medical Terms Explained: Prior Authorization, AI Scribes, Hernias and More | Medics Musings', description: snippet(ctx.explainedData.intro), url: EXPLAINED_URL, ogTitle: 'Medical terms, explained', image: shareImage(null), ld })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Explainers']])}
      <span class="eyebrow">Explained</span>
      <h1>Medical terms, explained</h1>
      <p class="coll-intro">${esc(ctx.explainedData.intro)}</p>
      <ul class="coll-list">
        ${ctx.explainers.map((x) => `<li>
          <a class="coll-card" href="/explained/${x.slug}/">
            <span class="coll-part">${esc(x.term)}</span>
            <span class="coll-title">${esc(x.title)}</span>
            <span class="coll-desc">${esc(snippet(x.dek, 170))}</span>
          </a>
        </li>`).join('\n        ')}
      </ul>
    </div>
  </section>

${pageEnd(ctx.data)}`;
}

// ---- Eponyms and timeline (sortable, filterable data tables) -----------------------

const EPONYMS_URL = `${SITE}/eponyms/`;
const TIMELINE_URL = `${SITE}/timeline/`;
const PSYCH_TIMELINE_URL = `${SITE}/timeline/psychiatry/`;
const PSYCH_EPONYMS_URL = `${SITE}/eponyms/psychiatry/`;
// Accents are stripped (Klüver -> kluver) so anchors stay readable.
export const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A row's "hear it" links: one per episode it's tied to, timestamped when we have one.
function heardLinks(rows, ctx) {
  return rows.map((r) => {
    const ep = ctx.bySlug.get(r.slug);
    if (!ep) return '';
    const href = r.t != null ? `${ep.path}?t=${Math.floor(r.t)}` : ep.path;
    const label = r.t != null ? `${esc(ep.title)} · ${clock(r.t)}` : esc(ep.title);
    return `<a class="hear-link" href="${href}">${label}</a>`;
  }).filter(Boolean).join(' ');
}

// Search box plus one row of filter chips per group. Each group filters rows on
// a data-<attr> attribute; extras.js combines the groups (a row must match all).
function tableControls(id, fields, searchLabel, groups = [{ attr: 'field', label: 'Filter by category', values: fields }]) {
  const chipRow = (g) => `<div class="chips" role="group" aria-label="${esc(g.label)}">
          <button type="button" class="chip is-active" data-filter-attr="${g.attr}" data-filter-value="">${esc(g.all || 'All')}</button>
          ${g.values.map((v) => `<button type="button" class="chip" data-filter-attr="${g.attr}" data-filter-value="${esc(v)}">${esc(v)}</button>`).join('\n          ')}
        </div>`;
  return `<div class="table-controls">
        <label class="sr-only" for="${id}-search">${esc(searchLabel)}</label>
        <input id="${id}-search" type="search" data-filter-table="${id}" placeholder="${esc(searchLabel)}">
        ${groups.map(chipRow).join('\n        ')}
      </div>`;
}

// Two eponym indexes share this template: surgery/medicine (/eponyms/) and
// psychiatry/psychoanalysis (/eponyms/psychiatry/).
function eponymsPage(ctx, c) {
  const rows = c.entries;
  const fields = [...new Set(rows.map((r) => r.field))].sort();
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTermSet',
        '@id': `${c.url}#terms`,
        name: c.name,
        description: c.intro,
        url: c.url,
        hasDefinedTerm: rows.map((r) => ({
          '@type': 'DefinedTerm',
          name: r.name,
          description: r.what,
          url: `${c.url}#${slugify(r.name)}`,
        })),
      },
      breadcrumbLd(c.crumbs.map(([label, path]) => [label, `${SITE}${path}`])),
    ],
  };
  const rowsHtml = rows.map((r) => `<tr id="${slugify(r.name)}" data-field="${esc(r.field)}" data-search="${esc(`${r.name} ${r.person} ${r.what}`.toLowerCase())}">
          <td class="col-name"><a href="#${slugify(r.name)}">${esc(r.name)}</a><span class="row-field">${esc(r.field)}</span></td>
          <td class="col-person">${esc(r.person)}<span class="row-years">${esc(r.years)}</span></td>
          <td class="col-what">${esc(r.what)}</td>
          <td class="col-hear">${heardLinks(r.episodes, ctx)}</td>
        </tr>`).join('\n        ');
  return `${pageHead({ title: c.pageTitle, description: snippet(c.intro), url: c.url, ogTitle: c.name, image: shareImage(null), ld })}
<main>
  <section class="collection data-page">
    <div class="wrap">
      ${crumbs(c.crumbs.map(([label, path], i) => [label, i < c.crumbs.length - 1 ? path : null]))}
      <span class="eyebrow">Reference · ${rows.length} names</span>
      <h1>${esc(c.heading)}</h1>
      <p class="coll-intro">${esc(c.intro)}</p>
      ${tableControls('eponyms', fields, 'Search names, people or terms…')}
      <div class="table-wrap">
        <table class="data-table" data-sortable="eponyms">
          <thead>
            <tr>
              <th data-sort="text">Name</th>
              <th data-sort="text">Person</th>
              <th class="no-sort">What it means</th>
              <th class="no-sort">Hear it</th>
            </tr>
          </thead>
          <tbody>
        ${rowsHtml}
          </tbody>
        </table>
      </div>
      <p class="table-empty" hidden>No names match that search.</p>
      <p class="related">See also: ${c.seeAlso}</p>
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

// Two timelines share this template: surgery/medicine (/timeline/) and
// psychiatry/psychoanalysis (/timeline/psychiatry/).
function timelinePage(ctx, t) {
  const rows = [...t.entries].sort((a, b) => a.year - b.year);
  const fields = [...new Set(rows.map((r) => r.field))].sort();
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        '@id': `${t.url}#list`,
        name: t.name,
        description: t.intro,
        url: t.url,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: rows.length,
        itemListElement: rows.map((r, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          // BC years and fractional sort keys (1938.5) aren't valid dates; omit them.
          item: { '@type': 'Event', name: r.event, ...(r.year > 0 && { startDate: String(Math.floor(r.year)) }), url: `${t.url}#${r.slug}` },
        })),
      },
      breadcrumbLd(t.crumbs.map(([label, path]) => [label, `${SITE}${path}`])),
    ],
  };
  const rowsHtml = rows.map((r) => `<tr id="${r.slug}" data-field="${esc(r.field)}" data-year="${r.year}" data-search="${esc(`${r.yearLabel} ${r.event}`.toLowerCase())}">
          <td class="col-year"><a href="#${r.slug}">${esc(r.yearLabel)}</a></td>
          <td class="col-what">${esc(r.event)}<span class="row-field">${esc(r.field)}</span></td>
          <td class="col-hear">${heardLinks(r.episodes, ctx)}</td>
        </tr>`).join('\n        ');
  return `${pageHead({ title: t.pageTitle, description: snippet(t.intro), url: t.url, ogTitle: t.name, image: shareImage(null), ld })}
<main>
  <section class="collection data-page">
    <div class="wrap">
      ${crumbs(t.crumbs.map(([label, path], i) => [label, i < t.crumbs.length - 1 ? path : null]))}
      <span class="eyebrow">Reference · ${rows.length} milestones</span>
      <h1>${esc(t.heading)}</h1>
      <p class="coll-intro">${esc(t.intro)}</p>
      ${tableControls('timeline', fields, 'Search years or events…')}
      <div class="table-wrap">
        <table class="data-table" data-sortable="timeline">
          <thead>
            <tr>
              <th data-sort="number" class="is-sorted" data-dir="asc">Year</th>
              <th class="no-sort">What happened</th>
              <th class="no-sort">Hear it</th>
            </tr>
          </thead>
          <tbody>
        ${rowsHtml}
          </tbody>
        </table>
      </div>
      <p class="table-empty" hidden>No events match that search.</p>
      <p class="related">See also: ${t.seeAlso}</p>
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

// ---- Live health stats (data/*.json from scripts/fetch-health-data.mjs) ------------
// Hidden for now: the pages aren't built or linked. Set to true to bring back
// /stats/, /recalls/ and /er-wait-times/ (and restart the health-data workflow).
const SHOW_HEALTH_STATS = false;

const STATS_URL = `${SITE}/stats/`;
const RECALLS_URL = `${SITE}/recalls/`;
const shortDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const statTiles = (tiles) => `<dl class="stat-tiles">
        ${tiles.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(String(value))}</dd></div>`).join('\n        ')}
      </dl>`;

// Google Dataset Search reads this; keeps the source and license attached to the numbers.
const datasetLd = ({ url, name, description, sourceName, sourceUrl, license, modified, measured }) => ({
  '@type': 'Dataset',
  '@id': `${url}#dataset`,
  name,
  description,
  url,
  dateModified: modified,
  license,
  isAccessibleForFree: true,
  creator: { '@type': 'Organization', name: 'Medics Musings', url: `${SITE}/` },
  isBasedOn: { '@type': 'Dataset', name: sourceName, url: sourceUrl },
  variableMeasured: measured,
});

function recallsPage(ctx) {
  const d = ctx.recallData;
  const isNew = new Set(d.newIds || []);
  const rows = d.recalls.map((r) => `<tr id="${esc(r.id.toLowerCase())}" data-field="${esc(r.category)}" data-class="${esc(r.classification)}" data-year="${r.date.replace(/-/g, '')}" data-search="${esc(`${r.product} ${r.firm} ${r.reason} ${r.category} ${r.classification}`.toLowerCase())}">
          <td class="col-year"><a href="#${esc(r.id.toLowerCase())}">${esc(shortDate(r.date))}</a></td>
          <td class="col-what"><strong>${esc(r.product)}</strong>${isNew.has(r.id) ? ' <span class="badge-new">New</span>' : ''}<span class="row-field">${esc(r.category)} · ${esc(r.status)} · ${esc(r.distribution)}</span></td>
          <td class="col-person">${esc(r.firm)}</td>
          <td class="col-reason">${esc(r.reason)}</td>
          <td class="col-class"><span class="class-badge class-${r.classification.split(' ').pop().toLowerCase()}">${esc(r.classification)}</span></td>
        </tr>`).join('\n        ');
  const changed = d.previousTotal == null ? '' : `<p class="what-changed"><b>Since the last update:</b> ${d.newIds.length} new recall${d.newIds.length === 1 ? '' : 's'} added.</p>`;
  const intro = `Everything the FDA has asked companies to take back in the last ${d.windowDays} days: drugs with things floating in them, devices doing things devices shouldn't, and food with ingredients it forgot to mention. The jokes stop at this paragraph. Every recall below is exactly as the FDA reported it.`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      datasetLd({
        url: RECALLS_URL,
        name: `FDA drug, device and food recalls, last ${d.windowDays} days`,
        description: `Drug, medical device and food recalls reported by the U.S. FDA in the last ${d.windowDays} days, updated weekly from openFDA enforcement reports.`,
        sourceName: 'openFDA enforcement reports, U.S. Food and Drug Administration',
        sourceUrl: 'https://open.fda.gov/apis/',
        license: 'https://open.fda.gov/license/',
        modified: d.fetched,
        measured: ['recall classification', 'product type', 'reason for recall', 'recalling firm'],
      }),
      breadcrumbLd([['Health stats', STATS_URL], ['Recall roundup', RECALLS_URL]]),
    ],
  };
  return `${pageHead({ title: `FDA Recalls This Month: Drugs, Devices and Food (Updated ${shortDate(d.fetched)}) | Medics Musings`, description: snippet(`The latest FDA drug, medical device and food recalls from the last ${d.windowDays} days, updated weekly: ${d.counts.total} recalls, ${d.counts.classI} of them Class I. Search by product, company or reason.`), url: RECALLS_URL, ogTitle: 'The Recall Roundup', image: shareImage(null), ld, feeds: [{ title: 'Medics Musings: FDA recall roundup', href: `${SITE}/feeds/recalls.xml` }] })}
<main>
  <section class="collection data-page">
    <div class="wrap">
      ${crumbs([['Health stats', '/stats/'], ['Recall roundup']])}
      <span class="eyebrow">Live data · updated weekly · ${d.counts.total} recalls in ${d.windowDays} days</span>
      <h1>The Recall Roundup</h1>
      <p class="coll-intro">${esc(intro)}</p>
      ${statTiles([['Recalls', d.counts.total], ['Class I (most serious)', d.counts.classI], ['Drugs', d.counts.drug], ['Devices', d.counts.device], ['Food', d.counts.food]])}
      ${changed}
      ${tableControls('recalls', [], 'Search products, companies or reasons…', [
        { attr: 'field', label: 'Filter by type', values: ['Drug', 'Device', 'Food'], all: 'All types' },
        { attr: 'class', label: 'Filter by severity', values: ['Class I', 'Class II', 'Class III'], all: 'Any class' },
      ])}
      <div class="table-wrap">
        <table class="data-table" data-sortable="recalls">
          <thead>
            <tr>
              <th data-sort="number" class="is-sorted" data-dir="desc">Date</th>
              <th class="no-sort">Product</th>
              <th data-sort="text">Company</th>
              <th class="no-sort">Reason</th>
              <th class="no-sort">Class</th>
            </tr>
          </thead>
          <tbody>
        ${rows}
          </tbody>
        </table>
      </div>
      <p class="table-empty" hidden>No recalls match that search.</p>
      <details class="faq-item source-note" open>
        <summary>What the classes mean, and where this comes from</summary>
        <p><b>Class I:</b> a reasonable chance the product could cause serious health problems or death. <b>Class II:</b> could cause temporary or medically reversible health problems, or the chance of serious harm is remote. <b>Class III:</b> unlikely to cause health problems, but breaks FDA rules.</p>
        <p>If you have a recalled product, follow the instructions from the company or the FDA. Don't stop a prescription medicine without asking your pharmacist or clinician first.</p>
        <p>Source: <a href="https://open.fda.gov/apis/">openFDA enforcement reports</a>, U.S. Food and Drug Administration, via FDA's public API. FDA data as of ${esc(d.sourceUpdated)}; fetched ${esc(d.fetched)}. openFDA data is unvalidated and shouldn't be used alone for medical decisions. Official notices: <a href="https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts">FDA recalls, market withdrawals and safety alerts</a>.</p>
        <p>Follow new recalls: <a href="/feeds/recalls.xml">RSS feed</a> <button type="button" class="link-btn" data-copy="${SITE}/feeds/recalls.xml">Copy feed URL</button></p>
      </details>
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

// ---- ER wait times (data/er-wait.json) -----------------------------------------------

const ER_URL = `${SITE}/er-wait-times/`;
const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AS: 'American Samoa', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', GU: 'Guam', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', MP: 'Northern Mariana Islands', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VI: 'U.S. Virgin Islands', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const stateName = (code) => US_STATES[code] || code;
const minutes = (n) => (n == null ? '—' : `${n} min`);
const hoursLabel = (n) => (n == null ? '' : `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')} m`);
const pct = (n) => (n == null ? '—' : `${n}%`);
const monthYear = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const periodLabel = (p) => `${monthYear(p.start)}–${monthYear(p.end)}`;
// data-label names the value on phones, where the table header is hidden.
const numCell = (cls, n, text, label) => `<td class="${cls}" data-value="${n ?? ''}" data-label="${label}">${text}</td>`;

const erEmergencyNote = `<p class="emergency-note"><b>Having an emergency?</b> Call 911 or go to the nearest emergency department. Don't choose an ER by these numbers in an emergency: they're medians from a past year, not today's wait.</p>`;

function erSourceNote(d) {
  return `<details class="faq-item source-note">
        <summary>What these numbers mean, and where they come from</summary>
        <p><b>Median time in the ER:</b> the typical time from arriving at the emergency department to leaving it, for patients who were sent home (CMS measure OP-18b), ${esc(periodLabel(d.periods.OP_18b))}. Half of visits took longer. Patients transferred elsewhere are excluded.</p>
        <p><b>Mental health patients:</b> the same median for psychiatric and mental health patients (OP-18c), who often wait far longer for a bed or transfer.</p>
        <p><b>Left before being seen:</b> the percentage of patients who left the ER before a clinician saw them (OP-22), ${esc(periodLabel(d.periods.OP_22))}. Volume bands (low to very high) are CMS's own categories.</p>
        <p>Source: <a href="https://data.cms.gov/provider-data/topics/hospitals/timely-effective-care">CMS Care Compare, Timely and Effective Care</a>, the hospital data behind <a href="https://www.medicare.gov/care-compare/">Medicare's Care Compare</a>. CMS last updated it ${esc(d.sourceModified)}; fetched ${esc(d.fetched)}. CMS refreshes it about quarterly, and hospitals with too few cases don't report a number.</p>
      </details>`;
}

function erMainPage(ctx) {
  const d = ctx.erData;
  const n = d.national;
  const states = d.states.filter((s) => s.OP_18b != null && s.hospitals);
  const rows = states.map((s) => `<tr id="${s.state.toLowerCase()}" data-search="${esc(`${stateName(s.state)} ${s.state}`.toLowerCase())}">
          <td class="col-name"><a href="/er-wait-times/${s.state.toLowerCase()}/">${esc(stateName(s.state))}</a></td>
          ${numCell('col-num', s.OP_18b, `<strong>${minutes(s.OP_18b)}</strong><span class="row-years">${hoursLabel(s.OP_18b)}</span>`, 'Median time in ER')}
          ${numCell('col-num', s.OP_18c, minutes(s.OP_18c), 'Mental health')}
          ${numCell('col-num', s.OP_22, pct(s.OP_22), 'Left before seen')}
          ${numCell('col-num', s.hospitals, String(s.hospitals), 'Hospitals')}
        </tr>`).join('\n        ');
  const fastest = [...states].sort((a, b) => a.OP_18b - b.OP_18b)[0];
  const slowest = [...states].sort((a, b) => b.OP_18b - a.OP_18b)[0];
  const changed = d.previousNational?.OP_18b != null
    ? `<p class="what-changed"><b>What changed:</b> CMS released data through ${esc(monthYear(d.periods.OP_18b.end))}. The national median moved from ${d.previousNational.OP_18b} to ${n.OP_18b} minutes.</p>`
    : `<p class="what-changed"><b>Latest data:</b> ${esc(periodLabel(d.periods.OP_18b))}. CMS updates about quarterly; this page refreshes automatically when it does.</p>`;
  const intro = `The typical trip through an American emergency room, door to door, takes ${n.OP_18b} minutes: about the length of a superhero movie, with worse seating and no popcorn. Here is every state, using Medicare's own numbers. The jokes stop here; the minutes below are exactly what CMS reports.`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      datasetLd({
        url: ER_URL,
        name: 'Emergency department wait times by state and hospital',
        description: `Median time patients spend in U.S. emergency departments, by state and hospital, from CMS Care Compare (${periodLabel(d.periods.OP_18b)}), plus mental health patient times and the share who left before being seen.`,
        sourceName: 'CMS Care Compare, Timely and Effective Care',
        sourceUrl: 'https://data.cms.gov/provider-data/topics/hospitals/timely-effective-care',
        license: 'https://www.usa.gov/government-works',
        modified: d.fetched,
        measured: ['median emergency department time (minutes)', 'median time for mental health patients (minutes)', 'patients who left before being seen (%)'],
      }),
      breadcrumbLd([['Health stats', STATS_URL], ['ER wait times', ER_URL]]),
    ],
  };
  return `${pageHead({ title: `ER Wait Times by State: How Long the Emergency Room Takes (${monthYear(d.periods.OP_18b.end)} data) | Medics Musings`, description: snippet(`How long do ER visits take? The U.S. median is ${n.OP_18b} minutes. Compare emergency department times for every state and ${d.hospitals.length.toLocaleString('en-US')} hospitals, from CMS data.`), url: ER_URL, ogTitle: 'How long will the ER take?', image: shareImage(null), ld })}
<main>
  <section class="collection data-page">
    <div class="wrap">
      ${crumbs([['Health stats', '/stats/'], ['ER wait times']])}
      <span class="eyebrow">Live data · CMS · ${esc(periodLabel(d.periods.OP_18b))}</span>
      <h1>How long will the ER take?</h1>
      <p class="coll-intro">${esc(intro)}</p>
      ${erEmergencyNote}
      ${statTiles([['U.S. median time in the ER', minutes(n.OP_18b)], ['Mental health patients', minutes(n.OP_18c)], ['Left before being seen', pct(n.OP_22)], ['Hospitals reporting', d.hospitals.length.toLocaleString('en-US')]])}
      <p class="what-changed"><b>Fastest state:</b> ${esc(stateName(fastest.state))}, ${fastest.OP_18b} minutes. <b>Slowest:</b> ${esc(stateName(slowest.state))}, ${slowest.OP_18b} minutes.</p>
      ${changed}
      ${tableControls('er-states', [], 'Search states…', [])}
      <div class="table-wrap">
        <table class="data-table" data-sortable="er-states">
          <thead>
            <tr>
              <th data-sort="text" class="is-sorted" data-dir="asc">State</th>
              <th data-sort="number">Median time in ER</th>
              <th data-sort="number">Mental health patients</th>
              <th data-sort="number">Left before being seen</th>
              <th data-sort="number">Hospitals</th>
            </tr>
          </thead>
          <tbody>
        ${rows}
          </tbody>
        </table>
      </div>
      <p class="table-empty" hidden>No states match that search.</p>
      <p class="related">Pick a state to see every hospital in it. See also: <a href="/stats/">All health stats</a></p>
      ${erSourceNote(d)}
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

function erStatePage(ctx, s) {
  const d = ctx.erData;
  const code = s.state.toLowerCase();
  const url = `${ER_URL}${code}/`;
  const name = stateName(s.state);
  const hs = d.hospitals.filter((h) => h.state === s.state);
  const ranked = [...hs].sort((a, b) => a.OP_18b - b.OP_18b);
  const volumes = ['low', 'medium', 'high', 'very high'].filter((v) => hs.some((h) => h.EDV === v));
  const rows = hs.map((h) => `<tr id="h-${esc(h.id.toLowerCase())}" data-volume="${esc(h.EDV || '')}" data-search="${esc(`${h.name} ${h.city} ${h.zip}`.toLowerCase())}">
          <td class="col-name"><a href="#h-${esc(h.id.toLowerCase())}">${esc(h.name)}</a><span class="row-field">${esc(h.city)}, ${esc(h.state)} ${esc(h.zip)}</span></td>
          ${numCell('col-num', h.OP_18b, `<strong>${minutes(h.OP_18b)}</strong><span class="row-years">${hoursLabel(h.OP_18b)}</span>`, 'Median time in ER')}
          ${numCell('col-num', h.OP_18c, minutes(h.OP_18c), 'Mental health')}
          ${numCell('col-num', h.OP_22, pct(h.OP_22), 'Left before seen')}
          <td class="col-class">${h.EDV ? `<span class="class-badge">${esc(h.EDV)}</span>` : '—'}</td>
        </tr>`).join('\n        ');
  const diff = s.OP_18b - d.national.OP_18b;
  const vsNational = diff === 0 ? 'exactly the national median' : `${Math.abs(diff)} minutes ${diff < 0 ? 'faster' : 'slower'} than the national median of ${d.national.OP_18b}`;
  const intro = hs.length > 1
    ? `The typical ER visit in ${name} takes ${s.OP_18b} minutes, ${vsNational}. The quickest hospital here has a median of ${ranked[0].OP_18b} minutes and the slowest ${ranked[ranked.length - 1].OP_18b}, a spread wide enough to fit a full season of prestige television. Numbers below are exactly as CMS reports them.`
    : `The typical ER visit in ${name} takes ${s.OP_18b} minutes, ${vsNational}. Numbers below are exactly as CMS reports them.`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { ...datasetLd({
        url,
        name: `Emergency department wait times in ${name} hospitals`,
        description: `Median emergency department times for ${hs.length} hospitals in ${name}, from CMS Care Compare (${periodLabel(d.periods.OP_18b)}).`,
        sourceName: 'CMS Care Compare, Timely and Effective Care',
        sourceUrl: 'https://data.cms.gov/provider-data/topics/hospitals/timely-effective-care',
        license: 'https://www.usa.gov/government-works',
        modified: d.fetched,
        measured: ['median emergency department time (minutes)', 'median time for mental health patients (minutes)', 'patients who left before being seen (%)'],
      }), spatialCoverage: { '@type': 'Place', name } },
      breadcrumbLd([['Health stats', STATS_URL], ['ER wait times', ER_URL], [name, url]]),
    ],
  };
  return `${pageHead({ title: `ER Wait Times in ${name}: ${hs.length} Hospitals Compared | Medics Musings`, description: snippet(`How long do ER visits take in ${name}? The state median is ${s.OP_18b} minutes. Compare ${hs.length} ${name} hospitals' emergency department times, from CMS data (${periodLabel(d.periods.OP_18b)}).`), url, ogTitle: `ER wait times in ${name}`, image: shareImage(null), ld })}
<main>
  <section class="collection data-page">
    <div class="wrap">
      ${crumbs([['Health stats', '/stats/'], ['ER wait times', '/er-wait-times/'], [name]])}
      <span class="eyebrow">Live data · CMS · ${esc(periodLabel(d.periods.OP_18b))}</span>
      <h1>ER wait times in ${esc(name)}</h1>
      <p class="coll-intro">${esc(intro)}</p>
      ${erEmergencyNote}
      ${statTiles([[`${name} median`, minutes(s.OP_18b)], ['U.S. median', minutes(d.national.OP_18b)], ['Mental health patients', minutes(s.OP_18c)], ['Left before being seen', pct(s.OP_22)], ['Hospitals reporting', hs.length]])}
      ${tableControls(`er-${code}`, [], 'Search hospitals, cities or ZIP codes…', volumes.length ? [{ attr: 'volume', label: 'Filter by ER volume', values: volumes, all: 'Any volume' }] : [])}
      <div class="table-wrap">
        <table class="data-table" data-sortable="er-${code}">
          <thead>
            <tr>
              <th data-sort="text" class="is-sorted" data-dir="asc">Hospital</th>
              <th data-sort="number">Median time in ER</th>
              <th data-sort="number">Mental health patients</th>
              <th data-sort="number">Left before being seen</th>
              <th class="no-sort">ER volume</th>
            </tr>
          </thead>
          <tbody>
        ${rows}
          </tbody>
        </table>
      </div>
      <p class="table-empty" hidden>No hospitals match that search.</p>
      <p class="related"><a href="/er-wait-times/">All states</a> · <a href="/stats/">All health stats</a></p>
      ${erSourceNote(d)}
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

const erStates = (d) => (d ? d.states.filter((s) => s.OP_18b != null && s.hospitals) : []);

// Hub for the live tables. Each dataset appears once its data file exists.
function statsHub(ctx) {
  const cards = [];
  if (ctx.recallData) {
    const d = ctx.recallData;
    cards.push(['/recalls/', 'The Recall Roundup', `Updated weekly · ${d.counts.total} recalls`, `FDA drug, device and food recalls from the last ${d.windowDays} days, ${d.counts.classI} of them Class I. Searchable, filterable, and blessedly free of press-release adjectives.`]);
  }
  if (ctx.erData) {
    const d = ctx.erData;
    cards.push(['/er-wait-times/', 'How long will the ER take?', `CMS data · ${periodLabel(d.periods.OP_18b)}`, `The typical ER visit takes ${d.national.OP_18b} minutes. Compare every state and ${d.hospitals.length.toLocaleString('en-US')} hospitals, plus how many patients gave up and left.`]);
  }
  const intro = 'Live health numbers from public government data, refreshed automatically: what the FDA is recalling, how long the ER takes, and how loudly medicine is talking about AI. The headlines are satire; the numbers are exactly what the sources report.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', url: STATS_URL, name: 'Health stats', description: intro, isPartOf: { '@id': `${SITE}/#website` } },
      breadcrumbLd([['Health stats', STATS_URL]]),
    ],
  };
  return `${pageHead({ title: 'Live Health Stats: FDA Recalls and More, Updated Automatically | Medics Musings', description: snippet(intro), url: STATS_URL, ogTitle: 'Health stats', image: shareImage(null), ld })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Health stats']])}
      <span class="eyebrow">Live data</span>
      <h1>Health stats</h1>
      <p class="coll-intro">${esc(intro)}</p>
      <ul class="coll-list">
        ${cards.map(([href, title, meta, desc]) => `<li>
          <a class="coll-card" href="${href}">
            <span class="coll-title">${esc(title)}</span>
            <span class="ep-meta">${esc(meta)}</span>
            <span class="coll-desc">${esc(desc)}</span>
          </a>
        </li>`).join('\n        ')}
      </ul>
    </div>
  </section>

${pageEnd(ctx.data)}`;
}

// ---- Weekly Top 10 lists (data/top10/<list>/<YYYY-Www>.json) -------------------------
// scripts/fetch-top10.mjs drafts them; only weeks a person has marked
// "published" are built. TOP10_PREVIEW=1 also builds "review" weeks (noindex)
// for checking locally.

const TOP10_URL = `${SITE}/top-10/`;
const TOP10_LISTS = [
  {
    key: 'ai-health',
    path: 'ai-in-health-care',
    name: 'Top 10 AI in Health Care',
    short: 'AI in Health Care',
    tagline: 'The week’s ten biggest AI-in-medicine papers and stories, with commentary from two doctors who have seen a few hype cycles.',
    blurb: 'New papers from the big journals and the health-tech news that matters, ranked, with one satirical take each.',
  },
  {
    key: 'ai-updates',
    path: 'ai-updates',
    name: 'Top 10 AI Updates',
    short: 'AI Updates',
    tagline: 'The week in AI: model launches, company news and policy fights, ranked, with commentary from two doctors who read the press releases so you don’t have to.',
    blurb: 'Model releases, launches and AI industry news, ranked, with one satirical take each.',
  },
];
const TOP10_NOTE = 'Headlines link to the original papers and stories; the commentary under each is ours, and it is satire. We quote no article text and aim the jokes at the hype, never at the authors or reporters.';

function loadTop10() {
  const preview = process.env.TOP10_PREVIEW === '1';
  return TOP10_LISTS.map((list) => {
    const dir = join(ROOT, 'data', 'top10', list.key);
    const weeks = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f)).sort().reverse()
      .map((f) => readJson(`data/top10/${list.key}/${f}`, null))
      .filter((w) => w && w.picks?.length === 10 && (w.status === 'published' || (preview && w.status === 'review'))) : [];
    return { ...list, weeks };
  });
}

const weekSlug = (w) => w.week.toLowerCase();
const weekUrl = (list, w) => `${TOP10_URL}${list.path}/${weekSlug(w)}/`;
const weekLabel = (w) => (w.start.slice(5, 7) === w.end.slice(5, 7)
  ? `${shortDate(w.start)}–${Number(w.end.slice(8, 10))}, ${w.end.slice(0, 4)}`
  : `${shortDate(w.start)}–${shortDate(w.end)}, ${w.end.slice(0, 4)}`);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function top10ListHtml(w) {
  return `<ol class="top10">
        ${w.picks.map((p) => `<li class="top10-item" id="n${p.rank}">
          <span class="top10-rank" aria-hidden="true">${p.rank}</span>
          <div class="top10-body">
            <a class="top10-title" href="${esc(p.url)}" rel="noopener" target="_blank">${esc(p.title)}</a>
            <span class="top10-meta">${esc(p.source)} · ${esc(dateLabel(p.date))}${hostOf(p.url) === 'pubmed.ncbi.nlm.nih.gov' ? ' · via PubMed' : ''}</span>
            <p class="top10-take"><b>Our take:</b> ${esc(p.take)}</p>
          </div>
        </li>`).join('\n        ')}
      </ol>`;
}

const top10Ld = (list, w, url) => ({
  '@type': 'ItemList',
  '@id': `${url}#list`,
  name: `${list.name}: ${weekLabel(w)}`,
  numberOfItems: 10,
  itemListOrder: 'https://schema.org/ItemListOrderDescending',
  itemListElement: w.picks.map((p) => ({ '@type': 'ListItem', position: p.rank, url: p.url, name: p.title })),
});

const top10Robots = (w) => (w.status === 'published' ? undefined : 'noindex, nofollow');

function top10Archive(list, current) {
  if (list.weeks.length < 2) return '';
  return `<h2>Past weeks</h2>
      <ul class="top10-archive">
        ${list.weeks.filter((w) => w !== current).map((w) => `<li><a href="/top-10/${list.path}/${weekSlug(w)}/">${esc(weekLabel(w))}</a> <span>#1: ${esc(w.picks[0].title)}</span></li>`).join('\n        ')}
      </ul>`;
}

function top10Follow(list) {
  const feed = `${SITE}/feeds/top-10-${list.key}.xml`;
  return `<p>New list every Monday. Follow it: <a href="/feeds/top-10-${list.key}.xml">RSS feed</a> <button type="button" class="link-btn" data-copy="${feed}">Copy feed URL</button> · <a href="#newsletter">Get episodes by email</a></p>`;
}

// /top-10/<list>/ (latest week) and /top-10/<list>/<yyyy-wnn>/ (every week, permanent).
function top10Page(ctx, list, w, { latest }) {
  const url = latest ? `${TOP10_URL}${list.path}/` : weekUrl(list, w);
  const i = list.weeks.indexOf(w);
  const newer = list.weeks[i - 1];
  const older = list.weeks[i + 1];
  const title = latest
    ? `${list.name} This Week (${weekLabel(w)}) | Medics Musings`
    : `${list.name}: ${weekLabel(w)} | Medics Musings`;
  const description = snippet(`${list.name} for ${weekLabel(w)}. #1: ${w.picks[0].title}. ${list.blurb}`);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', url, name: `${list.name}: ${weekLabel(w)}`, description, dateModified: w.end, isPartOf: { '@id': `${SITE}/#website` }, mainEntity: { '@id': `${url}#list` } },
      top10Ld(list, w, url),
      breadcrumbLd([['Top 10', TOP10_URL], [list.name, `${TOP10_URL}${list.path}/`], ...(latest ? [] : [[weekLabel(w), url]])]),
    ],
  };
  const feeds = [{ title: `Medics Musings: ${list.name}`, href: `${SITE}/feeds/top-10-${list.key}.xml` }];
  return `${pageHead({ title, description, url, ogTitle: `${list.name}: ${weekLabel(w)}`, image: shareImage(null), ld, feeds, robots: top10Robots(w) })}
<main>
  <section class="collection data-page">
    <div class="wrap">
      ${crumbs([['Top 10', '/top-10/'], [list.name, latest ? undefined : `/top-10/${list.path}/`], ...(latest ? [] : [[weekLabel(w)]])])}
      <span class="eyebrow">Weekly · ${esc(weekLabel(w))}${w.status === 'published' ? '' : ' · DRAFT, not published'}</span>
      <h1>${esc(list.name)}</h1>
      <p class="coll-intro">${esc(list.tagline)}</p>
      ${top10ListHtml(w)}
      <nav class="top10-nav" aria-label="Other weeks">
        ${older ? `<a href="/top-10/${list.path}/${weekSlug(older)}/">← ${esc(weekLabel(older))}</a>` : '<span></span>'}
        ${newer ? `<a href="/top-10/${list.path}/${weekSlug(newer)}/">${esc(weekLabel(newer))} →</a>` : ''}
      </nav>
      <div class="source-note">
        <p>${esc(TOP10_NOTE)}</p>
        ${top10Follow(list)}
      </div>
      ${top10Archive(list, w)}
      <p class="related">See also: ${TOP10_LISTS.filter((l) => l !== list).map((l) => `<a href="/top-10/${l.path}/">${esc(l.name)}</a>`).join(' · ')} · <a href="/explained/">Explainers</a></p>
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

function top10Hub(ctx, lists) {
  const intro = 'Every Monday, the ten AI papers and stories worth knowing about, ranked, each with one satirical take from the Medics Musings desk. Real headlines, linked to the source; the commentary is ours.';
  const live = lists.filter((l) => l.weeks.length);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', url: TOP10_URL, name: 'Top 10', description: intro, isPartOf: { '@id': `${SITE}/#website` } },
      breadcrumbLd([['Top 10', TOP10_URL]]),
    ],
  };
  return `${pageHead({ title: 'Weekly Top 10: AI in Health Care and AI Updates, With Commentary | Medics Musings', description: snippet(intro), url: TOP10_URL, ogTitle: 'The weekly Top 10', image: shareImage(null), ld, robots: live.length && live.every((l) => l.weeks[0].status === 'published') ? undefined : 'noindex, nofollow' })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Top 10']])}
      <span class="eyebrow">Updated weekly</span>
      <h1>The weekly Top 10</h1>
      <p class="coll-intro">${esc(intro)}</p>
      ${live.length ? `<ul class="coll-list">
        ${live.map((l) => `<li>
          <a class="coll-card" href="/top-10/${l.path}/">
            <span class="coll-part">${esc(weekLabel(l.weeks[0]))}</span>
            <span class="coll-title">${esc(l.name)}</span>
            <span class="coll-desc">${esc(l.blurb)}</span>
            <span class="ep-meta">This week’s #1: ${esc(l.weeks[0].picks[0].title)}</span>
          </a>
        </li>`).join('\n        ')}
      </ul>` : '<p class="coll-intro">The first lists arrive Monday.</p>'}
    </div>
  </section>

${pageEnd(ctx.data)}`;
}

// ---- Games (/games/): the daily "Name that eponym" puzzle ----------------------------
// All play happens in games.js; the build embeds the puzzles as JSON. Clues come
// straight from data/eponyms*.json, with the answer blanked out.

const GAMES_URL = `${SITE}/games/`;
const EPONYM_GAME_URL = `${SITE}/games/eponym/`;
const GAME_LAUNCH = '2026-09-27'; // puzzle #1

// Short answers for entries whose index name is a phrase.
const GAME_ALIASES = {
  'bobbs-cholecystotomy': ['Bobbs'], 'heber-fitz-appendicitis': ['Fitz'], 'erle-peacock-wound-healing': ['Peacock'],
  'parviz-amid-neurectomy': ['Amid'], 'semmelweis-handwashing': ['Semmelweis'], 'barany-caloric-test': ['Bárány'],
  'billroth-gastrectomy': ['Billroth'],
};
// Extra giveaways to blank in a clue (the show's own pun on the name).
const GAME_REDACT = { 'kluver-bucy-syndrome': ['Bucey-Cleaver'] };
// Clue 3 for eponyms named after a place, a myth or a character, not a person.
const GAME_SOURCE = {
  'oedipus-complex': 'Named after a figure from Greek myth', 'electra-complex': 'Named after a figure from Greek myth',
  narcissism: 'Named after a figure from Greek myth', 'othello-syndrome': 'Named after a character in Shakespeare',
  'stockholm-syndrome': 'Named after a city', 'hawthorne-effect': 'Named after a factory',
};
// Words that describe rather than name, so clues can keep them.
const GAME_GENERIC = new Set(('syndrome delusion test effect analysis disease complex model scale inventory rating depression conditioning box '
  + 'hierarchy needs triad point suture repair fascia triangle catheter basket shunt maneuver encephalopathy ducts first gallbladder '
  + 'operation wound healing triple neurectomy handwashing caloric good-enough mother dichotomy and the via greek myth works western '
  + 'electric bank robbery with from').split(' '));
const gameNorm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function gameTokens(...texts) {
  const words = texts.join(' ').normalize('NFC').match(/[\p{L}][\p{L}'’-]*/gu) || [];
  return [...new Set(words.map((w) => w.replace(/['’]s$/, '').replace(/['’-]+$/, '')).filter((w) => w.length >= 4 && !GAME_GENERIC.has(w.toLowerCase())))];
}

function redact(text, tokens) {
  let out = text;
  for (const t of tokens.sort((a, b) => b.length - a.length)) {
    // The token itself plus words built on it (Freud -> Freudian, Mesmer -> mesmerized).
    const base = t.length <= 5 ? t : t.slice(0, Math.max(5, t.length - 3));
    const esc2 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\p{L}])${esc2(base)}[\\p{L}'’-]*`, 'giu'), '▇▇▇');
    const plain = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (plain !== t) out = out.replace(new RegExp(`(?<![\\p{L}])${esc2(plain)}[\\p{L}'’-]*`, 'giu'), '▇▇▇');
  }
  return out;
}

// Same shuffled order every build (mulberry32), so puzzle numbers never move.
function seededShuffle(list, seed) {
  const out = list.slice();
  let a = seed;
  const rand = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function eponymPuzzles(ctx) {
  const all = [...ctx.eponyms, ...ctx.psychEponyms].sort((a, b) => a.slug.localeCompare(b.slug));
  return seededShuffle(all, 20260928).map((e) => {
    const tokens = [...gameTokens(e.name, e.person, ...(GAME_ALIASES[e.slug] || [])), ...(GAME_REDACT[e.slug] || [])];
    const clue = redact(e.what, tokens);
    const left = tokens.filter((t) => new RegExp(`(?<![\\p{L}])${t}`, 'iu').test(clue));
    if (left.length) console.warn(`games: clue for ${e.slug} still shows ${left.join(', ')}`);
    const ep = e.episodes.map((x) => ({ x, ep: ctx.bySlug.get(x.slug) })).find((o) => o.ep);
    const answer = GAME_ALIASES[e.slug]?.[0] || e.name;
    const words = answer.split(/\s+/);
    // "Hippocrates of Kos" -> Hippocrates; drops Jr./Sr. and lowercase particles.
    const capWords = (p) => p.split(/\s+of\s+/)[0].split(/\s+/).filter((w) => /^\p{Lu}/u.test(w) && !/^(Jr|Sr)\.?$/.test(w));
    const people = e.person.split(/\s+and\s+/).map((p) => capWords(p).map((w) => `${w[0]}.`).join(' '));
    const letters = answer.replace(/[^\p{L}]/gu, '');
    const count = `${words.length > 1 ? `${words.length} words, ` : ''}${letters.length} letters`;
    const pattern = `Starts with “${letters[0].toUpperCase()}” · ${count}`;
    const clues = [
      clue,
      `${e.field === 'person' ? 'A person, not a thing' : `Type: ${e.field}`} · ${e.years}`,
      GAME_SOURCE[e.slug] || `Named for someone with the initials ${people.join(' and ')}`,
      ep ? `Comes up in the episode “${redact(ep.ep.title, tokens)}”` : pattern,
      ep ? pattern : `Starts with “${letters.slice(0, 2)}” · ${count}`,
    ];
    // People can be guessed by surname too (Osler for William Osler).
    const surname = e.field === 'person' ? [capWords(e.person).at(-1)] : [];
    return {
      name: e.name,
      accept: [...new Set([e.name, ...(GAME_ALIASES[e.slug] || []), ...surname].map(gameNorm))],
      clues,
      what: e.what,
      person: e.person,
      listen: ep ? { title: ep.ep.title, url: ep.x.t != null ? `${ep.ep.path}?t=${Math.floor(ep.x.t)}` : ep.ep.path } : null,
      more: `${e.page}#${slugify(e.name)}`,
    };
  });
}

function eponymGamePage(ctx) {
  const puzzles = eponymPuzzles(ctx);
  const names = [...new Set(puzzles.map((p) => p.name))].sort((a, b) => a.localeCompare(b));
  const intro = 'One real medical or psychiatric eponym a day. Five guesses, one new clue after each miss. Guessing is free, unlike the MRI.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', url: EPONYM_GAME_URL, name: 'Name that eponym: a daily medical word game', description: intro, isPartOf: { '@id': `${SITE}/#website` }, about: [{ '@type': 'DefinedTermSet', url: EPONYMS_URL }, { '@type': 'DefinedTermSet', url: PSYCH_EPONYMS_URL }] },
      breadcrumbLd([['Games', GAMES_URL], ['Name that eponym', EPONYM_GAME_URL]]),
    ],
  };
  return `${pageHead({ title: 'Name That Eponym: a Daily Medical Word Game | Medics Musings', description: snippet(`A daily puzzle for doctors, students and the medically curious: name the eponym from its clues in five guesses. ${puzzles.length} real eponyms, from McBurney's point to the Capgras delusion.`), url: EPONYM_GAME_URL, ogTitle: 'Name that eponym: the daily game', image: shareImage(null), ld })}
<main>
  <section class="collection game-page">
    <div class="wrap">
      ${crumbs([['Games', '/games/'], ['Name that eponym']])}
      <span class="eyebrow">Daily game · <span data-game-num>new puzzle every day</span></span>
      <h1>Name that eponym</h1>
      <p class="coll-intro">${esc(intro)}</p>
      <div class="game" id="eponym-game" data-launch="${GAME_LAUNCH}">
        <noscript><p class="game-note">This game needs JavaScript. Meanwhile, the answers live in the <a href="/eponyms/">eponym index</a>.</p></noscript>
        <ol class="game-clues" aria-live="polite" aria-label="Clues"></ol>
        <form class="game-form" hidden>
          <label for="game-guess">Your guess</label>
          <div class="game-row">
            <input id="game-guess" name="guess" type="text" list="game-names" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Start typing a name…" required>
            <button type="submit" class="btn btn-primary">Guess</button>
          </div>
          <datalist id="game-names">
            ${names.map((n) => `<option value="${esc(n)}"></option>`).join('\n            ')}
          </datalist>
          <p class="game-left" aria-live="polite"></p>
        </form>
        <ul class="game-guesses" aria-label="Your guesses"></ul>
        <div class="game-result" hidden tabindex="-1">
          <h2 class="game-verdict"></h2>
          <p class="game-answer"></p>
          <p class="game-links"></p>
          <p><button type="button" class="btn btn-primary" data-game-share>Share your result</button></p>
          <pre class="game-share" aria-label="Your result"></pre>
          <p class="game-next"></p>
        </div>
        <dl class="stat-tiles game-stats" hidden></dl>
      </div>
      <p class="related">Study up: <a href="/eponyms/">Surgical and medical eponyms</a> · <a href="/eponyms/psychiatry/">Psychiatric eponyms</a> · <a href="/games/">All games</a></p>
    </div>
  </section>
  <script type="application/json" id="game-data">${JSON.stringify(puzzles).replace(/</g, '\\u003c')}</script>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'games.js'] })}`;
}

function gamesHub(ctx) {
  const intro = 'Quick games built from the show’s real medicine. Come back tomorrow; the answers change and the co-pay doesn’t.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', url: GAMES_URL, name: 'Games', description: intro, isPartOf: { '@id': `${SITE}/#website` } },
      breadcrumbLd([['Games', GAMES_URL]]),
    ],
  };
  return `${pageHead({ title: 'Medical Games: Daily Eponym Puzzle and More | Medics Musings', description: snippet(intro), url: GAMES_URL, ogTitle: 'Games', image: shareImage(null), ld })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Games']])}
      <span class="eyebrow">Play</span>
      <h1>Games</h1>
      <p class="coll-intro">${esc(intro)}</p>
      <ul class="coll-list">
        <li>
          <a class="coll-card" href="/games/eponym/">
            <span class="coll-part">Daily</span>
            <span class="coll-title">Name that eponym</span>
            <span class="coll-desc">Who’s behind McBurney’s point, the Capgras delusion or the Kocher maneuver? Five guesses, one new clue after each miss, a streak to protect.</span>
          </a>
        </li>
        <li>
          <a class="coll-card" href="/line-of-the-day/">
            <span class="coll-part">Daily</span>
            <span class="coll-title">Line of the day</span>
            <span class="coll-desc">One line a day from the episodes, with a card to share and a link to hear it in context.</span>
          </a>
        </li>
      </ul>
    </div>
  </section>

${pageEnd(ctx.data)}`;
}

// ---- Line of the day (/line-of-the-day/) --------------------------------------------
// One line from the show per day, from data/quotes.json (lines that have a quote
// card). Every line is in the HTML; line.js shows today's, counted from the
// launch date on the reader's calendar, in a fixed shuffled order.

const LINE_URL = `${SITE}/line-of-the-day/`;
const LINE_LAUNCH = '2026-09-27'; // line #1

function lineOfTheDayPage(ctx) {
  const lines = seededShuffle(ctx.episodes.flatMap((ep) => (ctx.quotes[ep.slug] || [])
    .map((q, i) => ({ ep, q, n: i + 1 }))
    .filter((l) => existsSync(join(ROOT, quoteCardPath(l.ep.slug, l.n))))), 19721972);
  const days = Math.floor((Date.now() - Date.parse(`${LINE_LAUNCH}T00:00:00Z`)) / 86400000);
  const fallback = ((days % lines.length) + lines.length) % lines.length;
  const hear = (l) => (l.q.t != null ? `${l.ep.path}?t=${Math.max(0, Math.floor(l.q.t))}` : l.ep.path);
  const intro = 'One line a day from the Medics Musings episodes, straight from the transcript: no AI punch-ups, no laugh track. Share it, then hear it in context.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', url: LINE_URL, name: 'Line of the day', description: intro, isPartOf: { '@id': `${SITE}/#website` },
        mainEntity: { '@type': 'ItemList', numberOfItems: lines.length, itemListElement: lines.map((l, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Quotation', text: l.q.text, url: `${SITE}/episodes/${l.ep.slug}/quotes/${l.n}/`, isPartOf: { '@type': 'PodcastEpisode', name: l.ep.title, url: `${SITE}${l.ep.path}` } } })) },
      },
      breadcrumbLd([['Line of the day', LINE_URL]]),
    ],
  };
  return `${pageHead({ title: 'Line of the Day: Medical Satire Quotes From Two Doctors | Medics Musings', description: snippet(`${intro} ${lines.length} lines and counting.`), url: LINE_URL, ogTitle: 'Line of the day', image: { url: `${SITE}/${quoteCardPath(lines[fallback].ep.slug, lines[fallback].n)}`, alt: `Quote card: “${lines[fallback].q.text}”` }, ld })}
<main>
  <section class="collection line-page">
    <div class="wrap">
      ${crumbs([['Line of the day']])}
      <span class="eyebrow">Daily · <span data-line-num>#${fallback + 1}</span></span>
      <h1>Line of the day</h1>
      <p class="coll-intro">${esc(intro)}</p>
      <div class="line-days" id="line-of-the-day" data-launch="${LINE_LAUNCH}">
        ${lines.map((l, i) => `<article class="line-day"${i === fallback ? '' : ' hidden'}>
          <a href="/episodes/${l.ep.slug}/quotes/${l.n}/"><img class="quote-card" src="/${quoteCardPath(l.ep.slug, l.n)}" width="1200" height="630" loading="lazy" alt="Quote card: “${esc(l.q.text)}”"></a>
          <blockquote class="line-text"><p>“${esc(l.q.text)}”</p><p class="line-src">— <a href="${l.ep.path}">${esc(l.ep.title)}</a></p></blockquote>
          <p class="line-hear"><a class="btn btn-primary" href="${hear(l)}">▶ Hear it in the episode${l.q.t != null ? ` (${clock(l.q.t)})` : ''}</a></p>
          ${quoteShareRow(l.ep, l.q, l.n)}
        </article>`).join('\n        ')}
        <p class="line-next" aria-live="polite"></p>
      </div>
      <h2>Every line so far</h2>
      <ol class="line-list">
        ${lines.map((l) => `<li><a href="/episodes/${l.ep.slug}/quotes/${l.n}/">“${esc(l.q.text)}”</a> <span>${esc(l.ep.title)}</span></li>`).join('\n        ')}
      </ol>
      <p class="related">More daily habits: <a href="/games/eponym/">Name that eponym</a> · <a href="/top-10/">The weekly Top 10</a></p>
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js', 'line.js'] })}`;
}

// ---- Teaching guides ---------------------------------------------------------------

function embedFrame(ep, lazy = true) {
  return `<iframe class="embed-frame" src="/embed/${ep.slug}/" title="${esc(ep.title)} — Medics Musings player" height="${embedHeight(ep)}"${lazy ? ' loading="lazy"' : ''}></iframe>`;
}

function teachPage(g, ctx) {
  const ep = ctx.bySlug.get(g.slug);
  const url = `${TEACH_URL}${g.slug}/`;
  const explainers = (g.explainers || []).map((s) => ctx.explainers.find((e) => e.slug === s)).filter(Boolean);
  const title = `Teaching guide: ${ep.title}`;
  const description = snippet(`Free discussion guide for ${g.theme.toLowerCase()}: learning objectives, discussion questions and an activity built around the Medics Musings episode “${ep.title}”.`);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LearningResource',
        '@id': `${url}#guide`,
        name: title,
        description,
        url,
        learningResourceType: 'Discussion guide',
        educationalUse: 'Group discussion',
        audience: { '@type': 'EducationalAudience', audienceType: g.audience },
        teaches: g.objectives,
        isAccessibleForFree: true,
        inLanguage: 'en',
        isBasedOn: { '@type': 'PodcastEpisode', name: ep.title, url: ep.url },
        publisher: { '@type': 'Organization', name: 'Medics Musings Productions', url: `${SITE}/` },
      },
      breadcrumbLd([['Teaching guides', TEACH_URL], [ep.title, url]]),
    ],
  };
  return `${pageHead({ title: `${title} | Medics Musings`, description, url, ogTitle: title, image: shareImage(ep), ld })}
<main>
  <article class="guide">
    <div class="wrap">
      ${crumbs([['Teaching guides', '/teach/'], [ep.title]])}
      <span class="eyebrow">Teaching guide · ${esc(g.theme)}</span>
      <h1>${esc(ep.title)}</h1>
      <dl class="guide-meta">
        <div><dt>For</dt><dd>${esc(g.audience)}</dd></div>
        <div><dt>Episode</dt><dd>${ep.minutes} min</dd></div>
        <div><dt>Session</dt><dd>${esc(g.time)}</dd></div>
      </dl>
      <div class="guide-player no-print">${embedFrame(ep, false)}</div>
      <p class="no-print guide-actions"><a class="btn btn-primary" href="${ep.path}">Episode page &amp; transcript</a> <button type="button" class="btn btn-ghost" data-print>Print this guide</button></p>
      <p class="print-only">Listen: ${ep.url}</p>
      <div class="prose">
        <h2>Learning objectives</h2>
        <p>After listening and discussing, participants should be able to:</p>
        <ol>
          ${g.objectives.map((o) => `<li>${esc(o)}</li>`).join('\n          ')}
        </ol>
        <h2>Discussion questions</h2>
        <ol class="questions">
          ${g.questions.map((q) => `<li>${esc(q)}</li>`).join('\n          ')}
        </ol>
        <h2>Quick activity</h2>
        <p>${esc(g.activity)}</p>
        <h2>How to run it</h2>
        <p>Play the episode together (${ep.minutes} minutes) or assign it beforehand. Start with the first question to let people react to the humor, then move to the harder ones. Remind the group that the episode is satire and some of its “facts” are invented; spotting which ones is a good exercise in itself.</p>${explainers.length ? `
        <h2>Background reading</h2>
        <ul>
          ${explainers.map((x) => `<li><a href="/explained/${x.slug}/">${esc(x.title)}</a></li>`).join('\n          ')}
        </ul>` : ''}
      </div>
      <p class="satire-note"><b>Free to use.</b> ${esc(ctx.teachData.note)} Tell us how it went: <a href="/submit/?type=teaching">send feedback</a>.</p>
    </div>
  </article>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

function teachHub(ctx) {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        url: TEACH_URL,
        name: 'Teach with Medics Musings',
        description: ctx.teachData.intro,
        isPartOf: { '@id': `${SITE}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: ctx.guides.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${TEACH_URL}${g.slug}/`, name: ctx.bySlug.get(g.slug).title })),
        },
      },
      breadcrumbLd([['Teaching guides', TEACH_URL]]),
    ],
  };
  return `${pageHead({ title: 'Teach With Medics Musings: Free Discussion Guides for Residency and Med School | Medics Musings', description: snippet(ctx.teachData.intro), url: TEACH_URL, ogTitle: 'Teach with Medics Musings', image: shareImage(null), ld })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Teaching guides']])}
      <span class="eyebrow">Grand rounds kit</span>
      <h1>Teach with Medics Musings</h1>
      <p class="coll-intro">${esc(ctx.teachData.intro)}</p>
      <ul class="coll-list">
        ${ctx.guides.map((g) => {
          const ep = ctx.bySlug.get(g.slug);
          return `<li>
          <a class="coll-card" href="/teach/${g.slug}/">
            <span class="coll-part">${esc(g.theme)}</span>
            <span class="coll-title">${esc(ep.title)}</span>
            <span class="ep-meta">${ep.minutes} min episode · ${esc(g.time)} session</span>
            <span class="coll-desc">For ${esc(g.audience.charAt(0).toLowerCase() + g.audience.slice(1))}</span>
          </a>
        </li>`;
        }).join('\n        ')}
      </ul>
      <p class="satire-note"><b>Note:</b> ${esc(ctx.teachData.note)} Want a guide for another episode? <a href="/submit/?type=teaching">Ask us</a>.</p>
    </div>
  </section>

${pageEnd(ctx.data)}`;
}

// ---- Submit ----------------------------------------------------------------------

function submitPage(ctx) {
  const url = `${SITE}/submit/`;
  const description = 'Send Medics Musings your worst prior authorization saga, hospital phone-tree nightmare or waiting-room story, or pitch yourself as a guest. If we use it, we’ll send you the episode.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'ContactPage', url, name: 'Submit a story to Medics Musings', description, isPartOf: { '@id': `${SITE}/#website` } },
      breadcrumbLd([['Submit a story', url]]),
    ],
  };
  return `${pageHead({ title: 'Submit Your Worst Healthcare Story or Pitch a Guest Spot | Medics Musings', description, url, ogTitle: 'Tell us your worst healthcare story', image: shareImage(null), ld })}
<main>
  <section class="collection submit">
    <div class="wrap">
      ${crumbs([['Submit a story']])}
      <span class="eyebrow">Patient intake · no prior authorization required</span>
      <h1>Tell us your worst healthcare story</h1>
      <p class="coll-intro">The prior authorization that took longer than the pregnancy. The hospital voicemail tree with no exit. The waiting room with a TV stuck on a cooking show. Clinicians, patients and caregivers: send us the absurd, and we may turn it into an episode or read it on air. If we use it, we’ll email you the link so you can tell everyone you’re famous.</p>

      <form class="story-form" id="story-form" novalidate>
        <label for="st-type">What are you sending?</label>
        <select id="st-type" name="type">
          <option value="prior-auth">A prior authorization saga</option>
          <option value="voicemail">A hospital phone or voicemail nightmare</option>
          <option value="waiting-room">A waiting-room, billing or paperwork story</option>
          <option value="ai">An AI-in-healthcare moment</option>
          <option value="clinician">A story from the clinician side</option>
          <option value="guest">I want to be a guest</option>
          <option value="teaching">Feedback on a teaching guide</option>
          <option value="other">Something else</option>
        </select>

        <label for="st-story">Your story</label>
        <textarea id="st-story" name="story" rows="8" required placeholder="What happened? The more specific the absurdity, the better."></textarea>
        <p class="field-note"><b>Please leave out anything that could identify a patient</b>: names, dates, record numbers, photos. Change details if you need to. We can’t accept protected health information.</p>

        <div class="guest-only" hidden>
          <label for="st-pitch">Guest pitch: who are you, and what would you talk about?</label>
          <textarea id="st-pitch" name="pitch" rows="4" placeholder="Your specialty or role, a topic you'd be funny about, and a link to your work or socials."></textarea>
        </div>

        <div class="row">
          <div>
            <label for="st-name">Name or credit line</label>
            <input id="st-name" name="name" autocomplete="name" placeholder="e.g. “Dr. K., hospitalist in Ohio”">
          </div>
          <div>
            <label for="st-role">You are a…</label>
            <select id="st-role" name="role">
              <option>Patient or family member</option>
              <option>Physician</option>
              <option>Nurse</option>
              <option>Resident or student</option>
              <option>Other healthcare worker</option>
              <option>Just a listener</option>
            </select>
          </div>
        </div>

        <label for="st-email">Email (so we can send you the episode)</label>
        <input id="st-email" name="email" type="email" autocomplete="email" placeholder="you@example.com">

        <fieldset>
          <legend>Credit</legend>
          <label class="check"><input type="radio" name="credit" value="name" checked> Credit me by the name above</label>
          <label class="check"><input type="radio" name="credit" value="anonymous"> Keep me anonymous</label>
        </fieldset>
        <label class="check"><input type="checkbox" name="permission" required> I give Medics Musings permission to adapt this story for the podcast, website and social media.</label>
        <label class="check"><input type="checkbox" name="no_phi" required> My story doesn’t include information that could identify a patient.</label>
        <input class="hp" type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit" class="btn btn-primary">Send it in</button>
        <p class="signup-status" role="status" aria-live="polite"></p>
      </form>
      <p class="field-note">Prefer email? Write to <a href="mailto:${INBOX}">${INBOX}</a>. Episodes are satire; we may change details, combine stories and exaggerate wildly. That’s the job.</p>
    </div>
  </section>

${pageEnd(ctx.data, { signup: false, js: ['site.js', 'extras.js'] })}`;
}

// ---- Subscribe + feeds --------------------------------------------------------------

const feedHref = (kind, key) => (kind === 'all' ? `${SITE}/feeds/episodes.xml` : `${SITE}/feeds/${kind}/${key}.xml`);

export function feedsFor(data, { topic, series } = {}) {
  const feeds = [{ title: 'Medics Musings: all episodes (site feed)', href: feedHref('all') }];
  if (topic) feeds.push({ title: `Medics Musings: ${data.topics[topic]} episodes`, href: feedHref('topics', topic) });
  if (series) feeds.push({ title: `Medics Musings: ${data.series[series]}`, href: feedHref('series', series) });
  return feeds;
}

function rss({ title, description, link, self, items }) {
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const item = (e) => {
    const size = e.audio && existsSync(join(ROOT, e.audio)) ? statSync(join(ROOT, e.audio)).size : 0;
    return `    <item>
      <title>${x(e.title)}</title>
      <link>${e.url}</link>
      <guid isPermaLink="${e.guid ? 'false' : 'true'}">${e.guid || e.url}</guid>
      <pubDate>${new Date(e.date + 'T12:00:00Z').toUTCString()}</pubDate>
      <description>${x(e.feedDescription ?? `${e.summary} (${e.minutes} min)`)}</description>${size ? `
      <enclosure url="${SITE}/${e.audio}" length="${size}" type="audio/mpeg"/>` : ''}
    </item>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${x(title)}</title>
    <link>${link}</link>
    <atom:link href="${self}" rel="self" type="application/rss+xml"/>
    <description>${x(description)}</description>
    <language>en-us</language>
    <image><url>${SITE}/icon-512.png</url><title>${x(title)}</title><link>${link}</link></image>
    <lastBuildDate>${items.length ? new Date(items[0].date + 'T12:00:00Z').toUTCString() : new Date().toUTCString()}</lastBuildDate>
${items.map(item).join('\n')}
  </channel>
</rss>
`;
}

function writeFeeds(ctx) {
  const { data, episodes } = ctx;
  const put = (rel, xml) => {
    mkdirSync(join(ROOT, rel, '..'), { recursive: true });
    writeFileSync(join(ROOT, rel), xml);
  };
  for (const list of ctx.top10) {
    if (!list.weeks.some((w) => w.status === 'published')) continue;
    put(`feeds/top-10-${list.key}.xml`, rss({
      title: `Medics Musings: ${list.name}`,
      description: list.tagline,
      link: `${TOP10_URL}${list.path}/`, self: `${SITE}/feeds/top-10-${list.key}.xml`,
      items: list.weeks.filter((w) => w.status === 'published').slice(0, 26).map((w) => ({
        title: `${list.name}: ${weekLabel(w)}`,
        url: weekUrl(list, w),
        date: w.end,
        feedDescription: w.picks.map((p) => `${p.rank}. ${p.title} (${p.source}). ${p.take}`).join(' '),
      })),
    }));
  }
  if (SHOW_HEALTH_STATS && ctx.recallData) {
    const d = ctx.recallData;
    put('feeds/recalls.xml', rss({
      title: 'Medics Musings: FDA recall roundup',
      description: `FDA drug, device and food recalls from the last ${d.windowDays} days, updated weekly from openFDA.`,
      link: RECALLS_URL, self: `${SITE}/feeds/recalls.xml`,
      items: d.recalls.slice(0, 60).map((r) => ({
        title: `${r.classification} ${r.category.toLowerCase()} recall: ${r.product.slice(0, 90)} (${r.firm})`,
        url: `${RECALLS_URL}#${r.id.toLowerCase()}`,
        guid: r.id,
        date: r.date,
        feedDescription: `${r.reason} Recalling firm: ${r.firm}. Status: ${r.status}.`,
      })),
    }));
  }
  put('feeds/episodes.xml', rss({
    title: 'Medics Musings: all episodes', description: 'Every Medics Musings episode, newest first.',
    link: `${SITE}/`, self: feedHref('all'), items: episodes,
  }));
  for (const [k, label] of Object.entries(data.topics)) {
    put(`feeds/topics/${k}.xml`, rss({
      title: `Medics Musings: ${label}`, description: data.topicIntros?.[k] || `Medics Musings episodes about ${label}.`,
      link: `${SITE}/topics/${k}/`, self: feedHref('topics', k), items: episodes.filter((e) => (e.tags || []).includes(k)),
    }));
  }
  for (const [k, label] of Object.entries(data.series)) {
    put(`feeds/series/${k}.xml`, rss({
      title: `Medics Musings: ${label}`, description: data.seriesIntros?.[k] || `Every part of ${label}.`,
      link: `${SITE}/series/${k}/`, self: feedHref('series', k), items: episodes.filter((e) => e.series === k),
    }));
  }
}

function subscribePage(ctx) {
  const { data, episodes } = ctx;
  const url = `${SITE}/subscribe/`;
  const description = 'Get Medics Musings by email or RSS, for every episode or just the topics you care about: AI in medicine, surgery, aging, mental health, hospital life, or a single series.';
  const count = (fn) => episodes.filter(fn).length;
  const row = (label, href, n, page) => `<li><a class="feed-link" href="${href}">${esc(label)}</a> <span class="ep-meta">${n} episodes</span> <a class="ep-link" href="${page}">page</a> <button type="button" class="link-btn" data-copy="${href}">Copy feed URL</button></li>`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', url, name: 'Subscribe to Medics Musings', description, isPartOf: { '@id': `${SITE}/#website` } },
      breadcrumbLd([['Subscribe', url]]),
    ],
  };
  return `${pageHead({ title: 'Subscribe by Email or RSS, by Topic or Series | Medics Musings', description, url, ogTitle: 'Subscribe to Medics Musings', image: shareImage(null), ld, feeds: feedsFor(data) })}
<main>
  <section class="collection">
    <div class="wrap">
      ${crumbs([['Subscribe']])}
      <span class="eyebrow">Refill reminder</span>
      <h1>Subscribe your way</h1>
      <p class="coll-intro">${esc(description)}</p>

      <h2>By email</h2>
      <p class="coll-intro">Pick topics or series and we’ll only email you when one of those drops. Pick nothing and you get everything.</p>
      <form class="signup signup-wide" data-location="subscribe_page">
        <label class="sr-only" for="sub-email">Email address</label>
        <input id="sub-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
        <button type="submit" class="btn btn-primary">Subscribe</button>
        <div class="prefs prefs-open">
          ${prefChoices(data)}
        </div>
        <p class="signup-status" role="status" aria-live="polite"></p>
      </form>

      <h2>By RSS</h2>
      <p class="coll-intro">Website feeds for Feedly, Inoreader, NetNewsWire or any feed reader. To listen in a podcast app, use the <a href="${SHOW.rss}">podcast feed</a> or <a href="${SHOW.apple}" target="_blank" rel="noopener">Apple Podcasts</a> / <a href="${SHOW.spotify}" target="_blank" rel="noopener">Spotify</a>.</p>
      <ul class="feed-list">
        ${row('All episodes', feedHref('all'), episodes.length, '/#episodes')}
        ${Object.entries(data.topics).map(([k, label]) => row(label, feedHref('topics', k), count((e) => (e.tags || []).includes(k)), `/topics/${k}/`)).join('\n        ')}
        ${Object.entries(data.series).map(([k, label]) => row(`${label} (series)`, feedHref('series', k), count((e) => e.series === k), `/series/${k}/`)).join('\n        ')}
      </ul>
    </div>
  </section>
</main>

${footer()}

${scripts('signup.js', 'site.js', 'extras.js')}
</body>
</html>
`;
}

// ---- Embeds -------------------------------------------------------------------------

export const embedHeight = (ep) => (ep.audio ? 190 : 250);

export function embedSnippet(ep) {
  return `<iframe src="${SITE}/embed/${ep.slug}/" title="${esc(ep.title)} — Medics Musings" width="100%" height="${embedHeight(ep)}" style="border:0;border-radius:12px;max-width:640px" loading="lazy" allow="autoplay; encrypted-media"></iframe>
<p><a href="${ep.url}">${esc(ep.title)}</a> on <a href="${SITE}/">Medics Musings</a>, the medical satire podcast.</p>`;
}

function embedPage(ep) {
  const link = `${ep.url}?utm_source=embed&utm_medium=iframe`;
  const player = ep.audio
    ? `<audio controls preload="none" src="${SITE}/${ep.audio}"></audio>`
    : ep.spotify
      ? `<iframe title="${esc(ep.title)}" src="https://open.spotify.com/embed/episode/${ep.spotify}?utm_source=generator&theme=0" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`
      : `<a class="go" href="${link}" target="_blank" rel="noopener">▶ Listen on medicsmusings.com</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ep.title)} — Medics Musings player</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${ep.url}">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HPV5BLPF1B"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-HPV5BLPF1B', { page_title: 'Embed: ${esc(ep.title).replace(/'/g, "\\'")}', embed_host: (document.referrer || '').split('/')[2] || 'direct' });
</script>
<style>
  :root { --bg:#0b0f14; --surface:#131a22; --text:#f4f1ea; --muted:#8892a0; --accent:#ff5a3c; --pulse:#35d399; --border:#24303b; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.4 "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; min-height: 100vh; }
  .top { display: flex; gap: 12px; align-items: center; }
  .top img { width: 48px; height: 48px; border-radius: 8px; flex: none; }
  .brand { font: 800 13px/1 "Arial Narrow", Arial, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--text); text-decoration: none; }
  .brand span { color: var(--accent); }
  h1 { margin: 4px 0 0; font-size: 16px; line-height: 1.25; }
  h1 a { color: inherit; text-decoration: none; }
  h1 a:hover { color: var(--accent); }
  audio { width: 100%; }
  iframe { width: 100%; border: 0; border-radius: 12px; display: block; }
  .meta { font: 12px ui-monospace, "SFMono-Regular", monospace; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .more { font: 12px ui-monospace, "SFMono-Regular", monospace; color: var(--pulse); text-decoration: none; }
  .more:hover, .go:hover { color: var(--accent); }
  .go { color: var(--text); background: var(--accent); padding: 10px 14px; border-radius: 4px; text-decoration: none; align-self: flex-start; font-weight: 600; }
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <img src="${SITE}/icon-192.png" alt="" width="48" height="48">
    <div>
      <a class="brand" href="${SITE}/?utm_source=embed&utm_medium=iframe" target="_blank" rel="noopener">Medics<span>Musings</span></a>
      <h1><a href="${link}" target="_blank" rel="noopener">${esc(ep.title)}</a></h1>
      <div class="meta">${dateLabel(ep.date)} · ${ep.minutes} min · medical satire</div>
    </div>
  </div>
  ${player}
  <a class="more" href="${link}" target="_blank" rel="noopener">Transcript, show notes &amp; more episodes at medicsmusings.com →</a>
</div>
<script>
  (function () {
    var a = document.querySelector('audio');
    if (a) a.addEventListener('play', function once() { a.removeEventListener('play', once); try { gtag('event', 'episode_play', { episode_title: ${JSON.stringify(ep.title)}, player: 'embed' }); } catch (e) {} });
  })();
</script>
</body>
</html>
`;
}

// ---- Short links ----------------------------------------------------------------------

function shortLinkPage(ep, n) {
  const to = `${ep.url}?utm_source=short_link&utm_campaign=e${n}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(ep.title)} — Medics Musings</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${ep.url}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)});</script>
</head>
<body><p><a href="${to}">${esc(ep.title)}</a></p></body>
</html>
`;
}

// ---- Quote share pages ----------------------------------------------------------------------

export const quoteCardPath = (slug, n) => `og/quotes/${slug}-${n}.jpg`;
export const quotePageUrl = (ep, n) => `${ep.url}quotes/${n}/`;

export function quoteShareLinks(ep, q, n) {
  const url = quotePageUrl(ep, n);
  const text = `“${q.text}” — ${ep.title}, Medics Musings`;
  return {
    url,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    bluesky: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`,
  };
}

// Share buttons for one quote; the copy/share clicks are handled by extras.js.
export function quoteShareRow(ep, q, n) {
  const l = quoteShareLinks(ep, q, n);
  const a = (href, label, net) => `<a class="ctl" href="${href}" target="_blank" rel="noopener" data-quote-share="${net}">${label}</a>`;
  return `<p class="quote-share" data-quote-url="${l.url}" data-quote-text="${esc(`“${q.text}” — ${ep.title}, Medics Musings`)}">
        ${a(l.linkedin, 'LinkedIn', 'linkedin')}
        ${a(l.x, 'X', 'x')}
        ${a(l.bluesky, 'Bluesky', 'bluesky')}
        ${a(l.facebook, 'Facebook', 'facebook')}
        <button type="button" class="ctl" data-quote-copy>Copy link</button>
        <a class="ctl" href="/${quoteCardPath(ep.slug, n)}" download="medics-musings-${ep.slug}-quote-${n}.jpg" data-quote-share="download">Download image</a>
      </p>`;
}

function quotePage(ep, q, n, ctx) {
  const links = quoteShareLinks(ep, q, n);
  const card = `${SITE}/${quoteCardPath(ep.slug, n)}`;
  const listen = q.t != null ? `${ep.path}?t=${Math.floor(q.t)}` : ep.path;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Quotation',
    text: q.text,
    url: links.url,
    isPartOf: { '@type': 'PodcastEpisode', name: ep.title, url: ep.url },
  };
  return `${pageHead({
    title: `“${snippet(q.text, 90)}” — ${ep.title} | Medics Musings`,
    description: snippet(`“${q.text}” From “${ep.title},” a Medics Musings episode.`),
    url: links.url,
    ogTitle: `“${snippet(q.text, 110)}”`,
    image: { url: card, alt: `Quote card: “${q.text}” — Medics Musings` },
    type: 'article',
    ld,
    robots: 'noindex, follow',
  })}
<main>
  <section class="collection quote-page">
    <div class="wrap">
      ${crumbs([['Episodes', '/#episodes'], [ep.title, ep.path], ['Quote']])}
      <img class="quote-card" src="/${quoteCardPath(ep.slug, n)}" width="1200" height="630" alt="Quote card: “${esc(q.text)}”">
      <blockquote class="quote-big"><p>“${esc(q.text)}”</p><footer>From <a href="${ep.path}">${esc(ep.title)}</a>${q.t != null ? ` at ${clock(q.t)}` : ''}</footer></blockquote>
      <p class="guide-actions"><a class="btn btn-primary" href="${listen}">▶ Hear it in context</a></p>
      ${quoteShareRow(ep, q, n)}
    </div>
  </section>

${pageEnd(ctx.data, { js: ['signup.js', 'site.js', 'extras.js'] })}`;
}

// ---- Build ----------------------------------------------------------------------------------

export function buildExtras(ctx) {
  const explainedData = readJson('data/explainers.json', { intro: '', explainers: [] });
  const teachData = readJson('data/teaching.json', { intro: '', note: '', guides: [] });
  const eponymData = readJson('data/eponyms.json', { intro: '', entries: [] });
  const psychEponymData = readJson('data/eponyms-psychiatry.json', { intro: '', entries: [] });
  const timelineData = readJson('data/timeline.json', { intro: '', entries: [] });
  const psychTimelineData = readJson('data/timeline-psychiatry.json', { intro: '', entries: [] });
  const recallData = SHOW_HEALTH_STATS ? readJson('data/recalls.json', null) : null;
  const erData = SHOW_HEALTH_STATS ? readJson('data/er-wait.json', null) : null;
  const top10 = loadTop10();
  const onSite = (r) => r.episodes.every((e) => ctx.bySlug.has(e.slug));
  const full = {
    ...ctx,
    explainedData,
    explainers: explainedData.explainers,
    teachData,
    guides: teachData.guides.filter((g) => ctx.bySlug.has(g.slug)),
    eponymData,
    eponyms: eponymData.entries.filter((r) => r.episodes.every((e) => ctx.bySlug.has(e.slug))).map((r) => ({ ...r, page: '/eponyms/' })),
    psychEponyms: psychEponymData.entries.filter((r) => r.episodes.every((e) => ctx.bySlug.has(e.slug))).map((r) => ({ ...r, page: '/eponyms/psychiatry/' })),
    timelineData,
    timeline: timelineData.entries.filter(onSite),
    psychTimeline: psychTimelineData.entries.filter(onSite),
    recallData,
    erData,
    top10,
  };

  writePage('explained', explainedHub(full));
  for (const x of full.explainers) writePage(`explained/${x.slug}`, explainerPage(x, full));
  writePage('teach', teachHub(full));
  for (const g of full.guides) writePage(`teach/${g.slug}`, teachPage(g, full));
  writePage('eponyms', eponymsPage(full, {
    url: EPONYMS_URL,
    name: 'Medics Musings eponym index',
    pageTitle: 'Medical Eponym Index: Who’s Behind the Names | Medics Musings',
    heading: "Who's behind the name?",
    intro: eponymData.intro,
    entries: full.eponyms,
    crumbs: [['Eponym index', '/eponyms/']],
    seeAlso: '<a href="/eponyms/psychiatry/">Psychiatric and psychoanalytic eponyms</a> · <a href="/timeline/">The surgery history timeline</a>',
  }));
  writePage('eponyms/psychiatry', eponymsPage(full, {
    url: PSYCH_EPONYMS_URL,
    name: psychEponymData.title,
    pageTitle: 'Psychiatric Eponyms: Freudian Slips, Capgras, Cotard and More | Medics Musings',
    heading: psychEponymData.heading,
    intro: psychEponymData.intro,
    entries: full.psychEponyms,
    crumbs: [['Eponym index', '/eponyms/'], ['Psychiatry & psychoanalysis', '/eponyms/psychiatry/']],
    seeAlso: '<a href="/timeline/psychiatry/">The psychiatry and psychoanalysis timeline</a> · <a href="/eponyms/">Surgical and medical eponyms</a> · <a href="/explained/psychoanalysis/">What is psychoanalysis?</a>',
  }));
  writePage('timeline', timelinePage(full, {
    url: TIMELINE_URL,
    name: 'Surgery and medicine history timeline',
    pageTitle: 'A Timeline of Surgery and Medicine History | Medics Musings',
    heading: 'From Hippocrates to the robot',
    intro: timelineData.intro,
    entries: full.timeline,
    crumbs: [['History timeline', '/timeline/']],
    seeAlso: '<a href="/timeline/psychiatry/">The psychiatry and psychoanalysis timeline</a> · <a href="/eponyms/">The eponym index</a>',
  }));
  writePage('timeline/psychiatry', timelinePage(full, {
    url: PSYCH_TIMELINE_URL,
    name: psychTimelineData.title,
    pageTitle: 'A Satirical Timeline of Psychiatry and Psychoanalysis | Medics Musings',
    heading: psychTimelineData.heading,
    intro: psychTimelineData.intro,
    entries: full.psychTimeline,
    crumbs: [['History timeline', '/timeline/'], ['Psychiatry & psychoanalysis', '/timeline/psychiatry/']],
    seeAlso: '<a href="/timeline/">The surgery and medicine timeline</a> · <a href="/eponyms/psychiatry/">Psychiatric and psychoanalytic eponyms</a> · <a href="/explained/psychoanalysis/">What is psychoanalysis?</a>',
  }));
  // Rebuilt from scratch so a week taken back to draft disappears.
  rmSync(join(ROOT, 'top-10'), { recursive: true, force: true });
  const top10Pages = ['top-10'];
  writePage('top-10', top10Hub(full, top10));
  for (const list of top10) {
    if (!list.weeks.length) continue;
    writePage(`top-10/${list.path}`, top10Page(full, list, list.weeks[0], { latest: true }));
    top10Pages.push(`top-10/${list.path}`);
    for (const w of list.weeks) {
      writePage(`top-10/${list.path}/${weekSlug(w)}`, top10Page(full, list, w, { latest: false }));
      top10Pages.push(`top-10/${list.path}/${weekSlug(w)}`);
    }
  }
  if (SHOW_HEALTH_STATS) writePage('stats', statsHub(full));
  if (recallData) writePage('recalls', recallsPage(full));
  if (erData) {
    writePage('er-wait-times', erMainPage(full));
    for (const st of erStates(erData)) writePage(`er-wait-times/${st.state.toLowerCase()}`, erStatePage(full, st));
  }
  writePage('line-of-the-day', lineOfTheDayPage(full));
  writePage('games', gamesHub(full));
  writePage('games/eponym', eponymGamePage(full));
  writePage('submit', submitPage(full));
  writePage('subscribe', subscribePage(full));
  writeFeeds(full);

  for (const ep of ctx.episodes) {
    writePage(`embed/${ep.slug}`, embedPage(ep));
    writePage(`e/${ctx.num.get(ep.slug)}`, shortLinkPage(ep, ctx.num.get(ep.slug)));
    (ctx.quotes[ep.slug] || []).forEach((q, i) => {
      if (existsSync(join(ROOT, quoteCardPath(ep.slug, i + 1)))) writePage(`episodes/${ep.slug}/quotes/${i + 1}`, quotePage(ep, q, i + 1, full));
    });
  }

  const newest = ctx.episodes[0].date;
  return {
    explainers: full.explainers,
    guides: full.guides,
    eponyms: full.eponyms,
    timeline: full.timeline,
    psychTimeline: full.psychTimeline,
    sitemap: [
      { loc: EXPLAINED_URL, lastmod: newest, changefreq: 'monthly', priority: '0.8' },
      ...full.explainers.map((x) => ({ loc: `${EXPLAINED_URL}${x.slug}/`, lastmod: newest, changefreq: 'monthly', priority: '0.8' })),
      { loc: TEACH_URL, lastmod: newest, changefreq: 'monthly', priority: '0.7' },
      ...full.guides.map((g) => ({ loc: `${TEACH_URL}${g.slug}/`, lastmod: newest, changefreq: 'monthly', priority: '0.7' })),
      { loc: EPONYMS_URL, lastmod: newest, changefreq: 'monthly', priority: '0.7' },
      { loc: PSYCH_EPONYMS_URL, lastmod: newest, changefreq: 'monthly', priority: '0.7' },
      { loc: TIMELINE_URL, lastmod: newest, changefreq: 'monthly', priority: '0.7' },
      { loc: PSYCH_TIMELINE_URL, lastmod: newest, changefreq: 'monthly', priority: '0.7' },
      ...top10.some((l) => l.weeks.some((w) => w.status === 'published')) ? [{ loc: TOP10_URL, lastmod: top10.flatMap((l) => l.weeks.filter((w) => w.status === 'published').map((w) => w.end)).sort().at(-1), changefreq: 'weekly', priority: '0.8' }] : [],
      ...top10.flatMap((l) => {
        const pub = l.weeks.filter((w) => w.status === 'published');
        return pub.length ? [
          { loc: `${TOP10_URL}${l.path}/`, lastmod: pub[0].end, changefreq: 'weekly', priority: '0.8' },
          ...pub.map((w) => ({ loc: weekUrl(l, w), lastmod: w.end, changefreq: 'yearly', priority: '0.6' })),
        ] : [];
      }),
      ...(SHOW_HEALTH_STATS ? [{ loc: STATS_URL, lastmod: recallData?.fetched || newest, changefreq: 'weekly', priority: '0.7' }] : []),
      ...(recallData ? [{ loc: RECALLS_URL, lastmod: recallData.fetched, changefreq: 'weekly', priority: '0.8' }] : []),
      ...(erData ? [
        { loc: ER_URL, lastmod: erData.sourceModified || erData.fetched, changefreq: 'monthly', priority: '0.8' },
        ...erStates(erData).map((st) => ({ loc: `${ER_URL}${st.state.toLowerCase()}/`, lastmod: erData.sourceModified || erData.fetched, changefreq: 'monthly', priority: '0.7' })),
      ] : []),
      { loc: LINE_URL, lastmod: newest, changefreq: 'daily', priority: '0.7' },
      { loc: GAMES_URL, lastmod: newest, changefreq: 'monthly', priority: '0.6' },
      { loc: EPONYM_GAME_URL, lastmod: newest, changefreq: 'daily', priority: '0.7' },
      { loc: `${SITE}/submit/`, lastmod: newest, changefreq: 'yearly', priority: '0.5' },
      { loc: `${SITE}/subscribe/`, lastmod: newest, changefreq: 'monthly', priority: '0.5' },
    ],
    pages: ['explained', ...full.explainers.map((x) => `explained/${x.slug}`), 'teach', ...full.guides.map((g) => `teach/${g.slug}`), 'eponyms', 'eponyms/psychiatry', 'timeline', 'timeline/psychiatry', ...top10Pages, ...(SHOW_HEALTH_STATS ? ['stats'] : []), ...(recallData ? ['recalls'] : []), ...(erData ? ['er-wait-times', ...erStates(erData).map((st) => `er-wait-times/${st.state.toLowerCase()}`)] : []), 'line-of-the-day', 'games', 'games/eponym', 'submit', 'subscribe'],
  };
}
