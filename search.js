// Site-wide search. Adds a Search button to the header; it opens a panel with a
// search box that filters /search-index.json (built by scripts/lib/search-index.mjs)
// as you type. Keys: "/" opens it, arrows move through results, Enter opens the
// highlighted one, Esc closes.
(function () {
  var bar = document.querySelector('.topbar-inner');
  if (!bar || document.querySelector('.site-search')) return;

  var css = document.createElement('style');
  css.textContent = [
    '.site-search-btn{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font:inherit;font-size:0.78rem;padding:8px 12px;}',
    '.site-search-btn svg{width:16px;height:16px;flex:none}',
    '.site-search-btn kbd{font:inherit;font-size:0.7rem;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;padding:0 5px}',
    '@media (max-width:680px){.site-search-btn{order:2;padding:11px 12px}.site-search-btn .ss-label,.site-search-btn kbd{display:none}}',
    '.ss-panel{position:fixed;left:0;right:0;z-index:60;padding:12px 16px;background:var(--bg);border-bottom:1px solid var(--border);box-shadow:var(--shadow);}',
    '.ss-panel[hidden]{display:none}',
    '.ss-inner{max-width:760px;margin:0 auto}',
    '.ss-field{display:flex;align-items:center;gap:10px;border:1px solid var(--accent);border-radius:8px;background:var(--surface);padding:0 12px}',
    '.ss-field svg{width:18px;height:18px;flex:none;color:var(--text-muted)}',
    '.ss-field input{flex:1;min-width:0;font:inherit;font-size:1rem;color:var(--text);background:none;border:0;padding:13px 0;outline:none}',
    '.ss-close{font:inherit;font-size:0.78rem;color:var(--text-muted);background:none;border:0;cursor:pointer;padding:6px}',
    '.ss-close:hover,.ss-close:focus-visible{color:var(--accent)}',
    '.ss-status{margin:10px 2px 4px;font-size:0.8rem;color:var(--text-muted)}',
    '.ss-list{list-style:none;margin:0;padding:0;max-height:calc(100vh - 190px);overflow-y:auto}',
    '.ss-list a{display:grid;gap:2px;padding:10px 12px;border-radius:6px;color:var(--text);text-decoration:none}',
    '.ss-list a:hover,.ss-list a.is-active{background:var(--surface-2)}',
    '.ss-list a.is-active{outline:2px solid var(--accent);outline-offset:-2px}',
    '.ss-title{font-weight:600}',
    '.ss-kind{font-family:"IBM Plex Mono",monospace;font-size:0.68rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--pulse);margin-right:8px}',
    '.ss-desc{font-size:0.86rem;color:var(--text-muted)}',
    '.ss-list mark{background:none;color:var(--accent);font-weight:700}'
  ].join('');
  document.head.appendChild(css);

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost site-search site-search-btn';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = ICON + '<span class="ss-label">Search</span><kbd aria-hidden="true">/</kbd>';
  var menu = bar.querySelector('.site-menu');
  bar.insertBefore(btn, menu || null);

  var panel = document.createElement('div');
  panel.className = 'ss-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Search the site');
  panel.innerHTML =
    '<div class="ss-inner">' +
      '<form class="ss-field" role="search" action="/#episodes" method="get">' + ICON +
        '<label class="sr-only" for="ss-input" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Search episodes, explainers, eponyms, news and games</label>' +
        '<input id="ss-input" type="search" name="q" autocomplete="off" placeholder="Search episodes, explainers, eponyms, news, games" aria-controls="ss-list">' +
        '<button type="button" class="ss-close">Close</button>' +
      '</form>' +
      '<p class="ss-status" role="status" aria-live="polite"></p>' +
      '<ul class="ss-list" id="ss-list"></ul>' +
    '</div>';
  document.body.appendChild(panel);

  var input = panel.querySelector('input');
  var list = panel.querySelector('.ss-list');
  var statusEl = panel.querySelector('.ss-status');
  var form = panel.querySelector('form');
  var data = null, loading = null, active = -1, shown = [];
  var MAX = 8;

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) {
      loading = fetch('/search-index.json').then(function (r) {
        if (!r.ok) throw new Error('index ' + r.status);
        return r.json();
      }).then(function (rows) {
        rows.forEach(function (r) { r._t = norm(r.t); r._d = norm(r.d); r._x = norm(r.x); r._k = norm(r.k); });
        data = rows;
        return rows;
      });
      loading.catch(function () { loading = null; });
    }
    return loading;
  }

  // Every word must appear somewhere; title hits count most, then description, then the rest.
  function query(q) {
    var tokens = norm(q).split(/\s+/).filter(Boolean);
    if (!tokens.length || !data) return [];
    var res = [];
    data.forEach(function (r) {
      var score = 0;
      for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i], s = 0;
        var at = r._t.indexOf(t);
        if (at > -1) s = at === 0 || r._t.charAt(at - 1) === ' ' ? 10 : 6;
        else if (r._d.indexOf(t) > -1) s = 3;
        else if (r._x.indexOf(t) > -1 || r._k.indexOf(t) > -1) s = 1;
        if (!s) return;
        score += s;
      }
      if (r._t === tokens.join(' ')) score += 20;
      res.push({ r: r, s: score });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    return res.map(function (o) { return o.r; });
  }

  function mark(text, tokens) {
    var out = esc(text);
    tokens.forEach(function (t) {
      if (t.length < 2) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  function render() {
    var q = input.value.trim();
    active = -1;
    if (!q) {
      shown = [];
      list.innerHTML = '';
      statusEl.textContent = 'Type to search episodes, explainers, eponyms, news and games.';
      return;
    }
    if (!data) { statusEl.textContent = 'Loading…'; return; }
    var all = query(q);
    shown = all.slice(0, MAX);
    var tokens = norm(q).split(/\s+/).filter(Boolean);
    list.innerHTML = shown.map(function (r, i) {
      return '<li><a href="' + esc(r.u) + '" data-i="' + i + '"><span class="ss-title"><span class="ss-kind">' + esc(r.k) + '</span>' + mark(r.t, tokens) + '</span>' +
        (r.d ? '<span class="ss-desc">' + mark(r.d, tokens) + '</span>' : '') + '</a></li>';
    }).join('');
    statusEl.textContent = all.length
      ? (all.length > MAX ? 'Showing the top ' + MAX + ' of ' + all.length + ' results.' : all.length + (all.length === 1 ? ' result.' : ' results.'))
      : 'No results for “' + q + '”. Try a shorter word, like “hernia” or “burnout”.';
  }

  function setActive(i) {
    var links = list.querySelectorAll('a');
    if (!links.length) return;
    active = (i + links.length) % links.length;
    Array.prototype.forEach.call(links, function (a, n) { a.classList.toggle('is-active', n === active); });
    links[active].scrollIntoView({ block: 'nearest' });
  }

  function place() {
    var hdr = document.querySelector('.topbar');
    panel.style.top = (hdr ? hdr.getBoundingClientRect().bottom : 0) + 'px';
  }

  function open() {
    place();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    input.focus();
    input.select();
    load().then(render, function () { statusEl.textContent = 'Search is unavailable right now. Try the All episodes page.'; });
    render();
    track('search_open');
  }
  function close() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function () { panel.hidden ? open() : close(); });
  panel.querySelector('.ss-close').addEventListener('click', function () { close(); btn.focus(); });

  var timer = null;
  input.addEventListener('input', function () {
    render();
    clearTimeout(timer);
    timer = setTimeout(function () { if (input.value.trim()) track('search', { search_term: input.value.trim().slice(0, 60), results: shown.length }); }, 900);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active < 0 ? -1 : active - 1); }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pick = shown[active > -1 ? active : 0];
    if (pick) { track('search_select', { search_term: input.value.trim().slice(0, 60), page: pick.u }); location.href = pick.u; }
  });
  list.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (a) track('search_select', { search_term: input.value.trim().slice(0, 60), page: a.getAttribute('href') });
    close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) { close(); btn.focus(); return; }
    var tag = (e.target && e.target.tagName) || '';
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable);
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(); }
  });
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) close();
  });
  window.addEventListener('resize', function () { if (!panel.hidden) place(); });
})();
