// Small helpers for the newer page types: copy buttons (feed URLs, short links,
// embed code), quote sharing, printing teaching guides, and the story
// submission form on /submit/ (sent through Formspree, like the homepage form).
(function () {
  var FORM_URL = 'https://formspree.io/f/mzezjwgn';
  var INBOX = 'BialystockMDandBloomMD@Gmail.com';

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }
  function copy(text, btn, done) {
    var label = btn.textContent;
    var ok = function () {
      btn.textContent = done || 'Copied!';
      setTimeout(function () { btn.textContent = label; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () { window.prompt('Copy this:', text); });
    } else {
      window.prompt('Copy this:', text);
    }
  }
  var slug = (document.querySelector('[data-slug]') || { getAttribute: function () { return ''; } }).getAttribute('data-slug');

  // data-copy="..." buttons (feed URLs, short links).
  try {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy');
        copy(text, btn);
        track('copy_link', { link_url: text, location: location.pathname });
      });
    });
  } catch (e) {}

  // Embed code on episode pages.
  try {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy-embed]'), function (btn) {
      btn.addEventListener('click', function () {
        var box = btn.closest('.embed-box');
        copy(box.querySelector('textarea').value, btn, 'Copied! Paste it in your page');
        track('embed_copy', { episode_slug: slug });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.embed-box'), function (box) {
      box.addEventListener('toggle', function () { if (box.open) track('embed_open', { episode_slug: slug }); });
      var ta = box.querySelector('textarea');
      if (ta) ta.addEventListener('focus', function () { ta.select(); });
    });
  } catch (e) {}

  // Quote sharing.
  try {
    Array.prototype.forEach.call(document.querySelectorAll('.quote-share'), function (row) {
      var url = row.getAttribute('data-quote-url');
      var text = row.getAttribute('data-quote-text');
      Array.prototype.forEach.call(row.querySelectorAll('[data-quote-share]'), function (a) {
        a.addEventListener('click', function () {
          track('share', { method: a.getAttribute('data-quote-share'), content_type: 'quote', item_id: url });
        });
      });
      var btn = row.querySelector('[data-quote-copy]');
      if (btn) btn.addEventListener('click', function () {
        if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
          navigator.share({ title: 'Medics Musings', text: text, url: url }).catch(function () {});
          track('share', { method: 'native', content_type: 'quote', item_id: url });
          return;
        }
        copy(url, btn, 'Link copied');
        track('share', { method: 'clipboard', content_type: 'quote', item_id: url });
      });
    });
  } catch (e) {}

  // Print (teaching guides).
  try {
    Array.prototype.forEach.call(document.querySelectorAll('[data-print]'), function (btn) {
      btn.addEventListener('click', function () {
        track('guide_print', { page: location.pathname });
        window.print();
      });
    });
  } catch (e) {}

  // Story submissions.
  try {
    var form = document.getElementById('story-form');
    if (form) {
      var type = form.elements.type;
      var guest = form.querySelector('.guest-only');
      var status = form.querySelector('.signup-status');
      var button = form.querySelector('button[type="submit"]');
      var say = function (msg, isError) {
        status.textContent = msg;
        status.classList.toggle('is-error', !!isError);
      };
      var preset = (location.search.match(/[?&]type=([a-z-]+)/) || [])[1];
      if (preset && type.querySelector('option[value="' + preset + '"]')) type.value = preset;
      var sync = function () { guest.hidden = type.value !== 'guest'; };
      type.addEventListener('change', sync);
      sync();

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (form.elements.company.value) return; // honeypot
        var story = form.elements.story.value.trim();
        if (!story) { say('Tell us the story first.', true); form.elements.story.focus(); return; }
        if (!form.elements.permission.checked || !form.elements.no_phi.checked) {
          say('Please tick both boxes so we can use your story.', true);
          return;
        }
        var payload = {
          kind: 'Story submission: ' + type.options[type.selectedIndex].text,
          type: type.value,
          story: story,
          pitch: form.elements.pitch.value.trim(),
          name: form.elements.name.value.trim(),
          role: form.elements.role.value,
          email: form.elements.email.value.trim(),
          credit: form.elements.credit.value,
          permission: 'yes',
          no_phi_confirmed: 'yes',
          _subject: 'Medics Musings story: ' + type.options[type.selectedIndex].text
        };
        button.disabled = true;
        say('Sending…');
        fetch(FORM_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) {
          if (!res.ok) throw new Error('bad status');
          form.reset();
          sync();
          say('Got it. If it makes the show, we’ll send you the link.');
          track('story_submit', { type: payload.type, role: payload.role });
        }).catch(function () {
          say('Couldn’t send that. Please try again, or email ' + INBOX + '.', true);
        }).then(function () { button.disabled = false; });
      });
    }
  } catch (e) {}

  // Data tables (eponym index, history timeline): search box, field chips, sortable columns.
  // The full table is already in the HTML, so all of this is enhancement, not a requirement.
  try {
    Array.prototype.forEach.call(document.querySelectorAll('table[data-sortable]'), function (table) {
      var id = table.getAttribute('data-sortable');
      var tbody = table.querySelector('tbody');
      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      var wrap = table.closest('.data-page') || document;
      var search = wrap.querySelector('[data-filter-table="' + id + '"]');
      var chips = wrap.querySelectorAll('[data-filter-attr]');
      var empty = wrap.querySelector('.table-empty');
      // One active value per chip group, keyed by the row attribute it filters (data-<attr>).
      var state = { q: '', filters: {} };
      var searchTimer = null;

      function applyFilter() {
        var shown = 0;
        rows.forEach(function (row) {
          var matchesFilters = Object.keys(state.filters).every(function (attr) {
            return !state.filters[attr] || row.getAttribute('data-' + attr) === state.filters[attr];
          });
          var matchesText = !state.q || (row.getAttribute('data-search') || '').indexOf(state.q) !== -1;
          var show = matchesFilters && matchesText;
          row.hidden = !show;
          if (show) shown++;
        });
        if (empty) empty.hidden = shown !== 0;
      }

      if (search) {
        search.addEventListener('input', function () {
          state.q = search.value.trim().toLowerCase();
          applyFilter();
          clearTimeout(searchTimer);
          searchTimer = setTimeout(function () {
            track('table_search', { table: id, has_query: !!state.q });
          }, 600);
        });
      }
      Array.prototype.forEach.call(chips, function (chip) {
        chip.addEventListener('click', function () {
          var attr = chip.getAttribute('data-filter-attr');
          state.filters[attr] = chip.getAttribute('data-filter-value') || '';
          Array.prototype.forEach.call(chips, function (c) {
            if (c.getAttribute('data-filter-attr') === attr) c.classList.toggle('is-active', c === chip);
          });
          applyFilter();
          track('table_filter', { table: id, filter: attr, value: state.filters[attr] || 'all' });
        });
      });

      Array.prototype.forEach.call(table.querySelectorAll('th[data-sort]'), function (th, colIndex) {
        var type = th.getAttribute('data-sort');
        th.setAttribute('role', 'button');
        th.setAttribute('tabindex', '0');
        var sort = function () {
          var dir = th.getAttribute('data-dir') === 'asc' ? 'desc' : 'asc';
          Array.prototype.forEach.call(table.querySelectorAll('th[data-sort]'), function (other) {
            other.classList.toggle('is-sorted', other === th);
            if (other !== th) other.removeAttribute('data-dir');
          });
          th.setAttribute('data-dir', dir);
          var cellIndex = Array.prototype.indexOf.call(th.parentNode.children, th);
          var sorted = rows.slice().sort(function (a, b) {
            var av, bv;
            if (type === 'number') {
              // A cell's data-value wins (tables with several numeric columns);
              // otherwise the row's data-year. Blanks sort last either way.
              var numOf = function (row) {
                var cell = row.children[cellIndex];
                var v = parseFloat(cell && cell.hasAttribute('data-value') ? cell.getAttribute('data-value') : row.getAttribute('data-year'));
                return isNaN(v) ? (dir === 'asc' ? Infinity : -Infinity) : v;
              };
              av = numOf(a); bv = numOf(b);
            } else {
              // The cell's own text (its link/label), lowercased; ignores the small
              // secondary line (row-field/row-years) some cells carry.
              var cellText = function (row) {
                var cell = row.children[cellIndex];
                var main = cell.querySelector('a') || cell.firstChild;
                return (main && main.textContent ? main.textContent : cell.textContent).trim().toLowerCase();
              };
              av = cellText(a); bv = cellText(b);
            }
            if (av < bv) return dir === 'asc' ? -1 : 1;
            if (av > bv) return dir === 'asc' ? 1 : -1;
            return 0;
          });
          sorted.forEach(function (row) { tbody.appendChild(row); });
          rows = sorted;
          track('table_sort', { table: id, column: th.textContent.trim(), direction: dir });
        };
        th.addEventListener('click', sort);
        th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
      });
    });
  } catch (e) {}
})();
