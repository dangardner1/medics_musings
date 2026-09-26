// Homepage episode discovery: text search, topic and series filters, and a
// linkable state (?q=, ?topic=, ?series=, ?all=1).
(function () {
  var grid = document.getElementById('ep-grid');
  var section = document.getElementById('episodes');
  var input = document.getElementById('ep-search');
  var panel = document.getElementById('ep-topics');
  var toggle = document.getElementById('ep-filter-toggle');
  var statusEl = document.getElementById('ep-status');
  var moreBtn = document.getElementById('ep-toggle');
  if (!grid || !section || !input) return;

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.ep-card'));
  cards.forEach(function (c) {
    c._text = (c.textContent + ' ' + (c.getAttribute('data-tags') || '') + ' ' + (c.getAttribute('data-series') || '')).toLowerCase();
    c._tags = (c.getAttribute('data-tags') || '').split(' ');
  });

  var state = { q: '', topic: '', series: '' };
  var searchTimer = null;

  function labelFor(attr, key) {
    var el = panel && panel.querySelector('[' + attr + '="' + key + '"]');
    return el ? el.textContent.replace(/\s*·\s*\d+\s*$/, '') : key;
  }

  function writeUrl() {
    var p = new URLSearchParams(location.search);
    ['q', 'topic', 'series'].forEach(function (k) {
      if (state[k]) p.set(k, state[k]); else p.delete(k);
    });
    var s = p.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) {}
  }

  function apply() {
    var tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    cards.forEach(function (c) {
      var ok = tokens.every(function (t) { return c._text.indexOf(t) > -1; }) &&
        (!state.topic || c._tags.indexOf(state.topic) > -1) &&
        (!state.series || c.getAttribute('data-series') === state.series);
      c.hidden = !ok;
      if (ok) shown++;
    });
    var filtered = !!(tokens.length || state.topic || state.series);
    grid.classList.toggle('is-filtered', filtered);
    section.classList.toggle('is-filtered', filtered);

    if (panel) {
      Array.prototype.forEach.call(panel.querySelectorAll('[data-topic]'), function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-topic') === state.topic);
      });
      Array.prototype.forEach.call(panel.querySelectorAll('[data-series]'), function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-series') === state.series);
      });
    }

    if (statusEl) {
      if (filtered) {
        var parts = [];
        if (state.topic) parts.push(labelFor('data-topic', state.topic));
        if (state.series) parts.push(labelFor('data-series', state.series));
        if (state.q) parts.push('“' + state.q + '”');
        statusEl.textContent = 'Showing ' + shown + ' of ' + cards.length + ' episodes' + (parts.length ? ' · ' + parts.join(' + ') : '');
        var clear = document.createElement('button');
        clear.type = 'button';
        clear.textContent = 'Clear';
        clear.addEventListener('click', function () { set({ q: '', topic: '', series: '' }); input.value = ''; });
        statusEl.appendChild(clear);
        if (!shown) statusEl.insertBefore(document.createTextNode(' — nothing matches. '), clear);
        statusEl.hidden = false;
      } else {
        statusEl.hidden = true;
      }
    }
    if (panel && (state.topic || state.series) && panel.hidden) setPanel(true);
  }

  function set(next) {
    Object.keys(next).forEach(function (k) { state[k] = next[k]; });
    apply();
    writeUrl();
  }

  function setPanel(open) {
    if (!panel || !toggle) return;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  input.addEventListener('input', function () {
    set({ q: input.value.trim() });
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      if (state.q.length > 1) track('search', { search_term: state.q });
    }, 800);
  });

  if (toggle) toggle.addEventListener('click', function () { setPanel(panel.hidden); });

  function chipClick(e) {
    var chip = e.target.closest('[data-topic], [data-series]');
    if (!chip || !(section.contains(chip))) return;
    if (chip.tagName === 'A' || chip.tagName === 'BUTTON') {
      e.preventDefault();
      if (chip.hasAttribute('data-topic')) {
        var t = chip.getAttribute('data-topic');
        set({ topic: state.topic === t ? '' : t });
        if (t) track('filter_topic', { topic: t });
      } else {
        var s = chip.getAttribute('data-series');
        set({ series: state.series === s ? '' : s });
        if (s) track('filter_series', { series: s });
      }
      if (chip.closest('.ep-card')) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  section.addEventListener('click', chipClick);

  // "Show all" is linkable: ?all=1 expands the list.
  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      setTimeout(function () {
        var p = new URLSearchParams(location.search);
        if (grid.classList.contains('is-collapsed')) p.delete('all'); else p.set('all', '1');
        var s = p.toString();
        try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) {}
      }, 0);
    });
  }

  // Deep links to a card hidden by a filter clear the filter.
  function revealHashTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    var card = id && document.getElementById(id);
    if (card && card.classList && card.classList.contains('ep-card') && card.hidden) {
      set({ q: '', topic: '', series: '' });
      input.value = '';
    }
  }
  window.addEventListener('hashchange', revealHashTarget);

  var p = new URLSearchParams(location.search);
  var initial = { q: p.get('q') || '', topic: p.get('topic') || '', series: p.get('series') || '' };
  if (initial.topic && !cards.some(function (c) { return c._tags.indexOf(initial.topic) > -1; })) initial.topic = '';
  if (initial.series && !cards.some(function (c) { return c.getAttribute('data-series') === initial.series; })) initial.series = '';
  input.value = initial.q;
  state = initial;
  apply();
  revealHashTarget();
  if (p.get('all') === '1' && moreBtn && grid.classList.contains('is-collapsed')) moreBtn.click();
  if ((state.q || state.topic || state.series) && !location.hash) {
    setTimeout(function () { section.scrollIntoView({ block: 'start' }); }, 0);
  }
})();
