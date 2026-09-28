// Word Rounds (/games/word-rounds/): the daily medical word search. The themes
// are embedded in the page (#ws-data) by build-extras.mjs. Each day's grid is
// generated here from a seed (the puzzle number), so every player gets the same
// puzzle. Progress and stats stay in this browser (localStorage).
(function () {
  var root = document.getElementById('word-rounds');
  var dataEl = document.getElementById('ws-data');
  if (!root || !dataEl) return;
  var themes;
  try { themes = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var SIZE = 10;
  var KEY = 'mm-word-rounds-v1';
  var DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  // Filler letters weighted like English text, so the grid doesn't look random.
  var FILL = 'EEEEEEEAAAAAIIIIIOOOOONNNNNRRRRRTTTTTSSSSLLLCCCDDDUUUMMPPHHGGBBFYWKV';

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function mmss(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // How many times a word can be read in the grid, in any direction.
  function occurrences(grid, word) {
    var n = 0;
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) for (var d = 0; d < 8; d++) {
      var k = 0;
      while (k < word.length) {
        var rr = r + DIRS[d][0] * k, cc = c + DIRS[d][1] * k;
        if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE || grid[rr][cc] !== word[k]) break;
        k++;
      }
      if (k === word.length) n++;
    }
    return n;
  }

  // Deterministic: the same seed always gives the same grid.
  function generate(words, seed) {
    var rand = mulberry32(seed);
    var order = words.slice().sort(function (a, b) { return b.length - a.length; });
    for (var attempt = 0; attempt < 200; attempt++) {
      var grid = [];
      for (var i = 0; i < SIZE; i++) grid.push(new Array(SIZE).fill(''));
      var places = {};
      var ok = order.every(function (w) {
        for (var tries = 0; tries < 400; tries++) {
          var d = DIRS[Math.floor(rand() * 8)];
          var r = Math.floor(rand() * SIZE), c = Math.floor(rand() * SIZE);
          var er = r + d[0] * (w.length - 1), ec = c + d[1] * (w.length - 1);
          if (er < 0 || ec < 0 || er >= SIZE || ec >= SIZE) continue;
          var fits = true;
          for (var k = 0; k < w.length && fits; k++) {
            var ch = grid[r + d[0] * k][c + d[1] * k];
            if (ch && ch !== w[k]) fits = false;
          }
          if (!fits) continue;
          var cells = [];
          for (k = 0; k < w.length; k++) { grid[r + d[0] * k][c + d[1] * k] = w[k]; cells.push((r + d[0] * k) * SIZE + c + d[1] * k); }
          places[w] = cells;
          return true;
        }
        return false;
      });
      if (!ok) continue;
      for (var r2 = 0; r2 < SIZE; r2++) for (var c2 = 0; c2 < SIZE; c2++) if (!grid[r2][c2]) grid[r2][c2] = FILL[Math.floor(rand() * FILL.length)];
      // Every word exactly once (palindromes read twice from the same cells, so allow 2).
      var unique = words.every(function (w) {
        var n = occurrences(grid, w);
        return n === 1 || (n === 2 && w === w.split('').reverse().join(''));
      });
      if (unique) return { grid: grid, places: places };
    }
    return null;
  }
  window.MMWordRounds = { generate: generate, themes: themes }; // for testing in the console

  var launch = root.getAttribute('data-launch').split('-');
  var now = new Date();
  var day = Math.max(1, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(+launch[0], +launch[1] - 1, +launch[2])) / 86400000) + 1);
  var theme = themes[(day - 1) % themes.length];
  var puzzle = generate(theme.words, day * 7919 + 17);
  if (!puzzle) return;

  var store = load();
  if (!store.stats) store.stats = { played: 0, streak: 0, best: null, last: 0 };
  if (!store.game || store.game.day !== day) store.game = { day: day, found: [], elapsed: 0, done: false };
  var game = store.game;

  var num = document.querySelector('[data-ws-num]');
  if (num) num.textContent = '#' + day;
  root.querySelector('.ws-theme').textContent = theme.title;
  root.querySelector('.ws-sub').textContent = theme.subtitle;
  var gridEl = root.querySelector('.ws-grid');
  var wordsEl = root.querySelector('.ws-words');
  var countEl = root.querySelector('.ws-count');
  var clockEl = root.querySelector('.ws-clock');
  var sayEl = root.querySelector('[data-ws-say]');
  var result = root.querySelector('.game-result');
  var statsEl = root.querySelector('.game-stats');

  var cells = [];
  for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
    var b = el('button', 'ws-cell', puzzle.grid[r][c]);
    b.type = 'button';
    b.tabIndex = r === 0 && c === 0 ? 0 : -1;
    b.setAttribute('data-i', r * SIZE + c);
    b.setAttribute('aria-label', 'Row ' + (r + 1) + ', column ' + (c + 1) + ': ' + puzzle.grid[r][c]);
    gridEl.appendChild(b);
    cells.push(b);
  }
  var wordItems = {};
  theme.words.slice().sort().forEach(function (w) {
    var li = el('li', null, w);
    wordsEl.appendChild(li);
    wordItems[w] = li;
  });

  function paintFound() {
    cells.forEach(function (x) { x.classList.remove('is-found'); });
    game.found.forEach(function (w) {
      (puzzle.places[w] || []).forEach(function (i) { cells[i].classList.add('is-found'); });
      if (wordItems[w]) wordItems[w].classList.add('is-found');
    });
    countEl.textContent = game.found.length + ' of ' + theme.words.length + ' found';
  }

  // Timer: counts only while the page is open and the puzzle is unfinished.
  var ticking = null;
  function startClock() {
    if (ticking || game.done) return;
    if (!game.found.length && !game.elapsed) track('ws_start', { puzzle: day });
    ticking = setInterval(function () {
      if (document.hidden) return;
      game.elapsed++;
      clockEl.textContent = mmss(game.elapsed);
      if (game.elapsed % 5 === 0) save();
    }, 1000);
  }
  clockEl.textContent = mmss(game.elapsed);

  // Selection: cells on the straight line from a to b (or null if not straight).
  function line(a, b) {
    var ar = Math.floor(a / SIZE), ac = a % SIZE, br = Math.floor(b / SIZE), bc = b % SIZE;
    var dr = br - ar, dc = bc - ac;
    if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return null;
    var n = Math.max(Math.abs(dr), Math.abs(dc));
    var sr = Math.sign(dr), sc = Math.sign(dc), out = [];
    for (var k = 0; k <= n; k++) out.push((ar + sr * k) * SIZE + ac + sc * k);
    return out;
  }
  var anchor = null, current = [];
  function showSelection(list) {
    current.forEach(function (i) { cells[i].classList.remove('is-picking'); });
    current = list || [];
    current.forEach(function (i) { cells[i].classList.add('is-picking'); });
  }
  function clearAnchor() {
    if (anchor != null) cells[anchor].classList.remove('is-anchor');
    anchor = null;
  }
  function check(list) {
    showSelection([]);
    if (!list || list.length < 3) return;
    var s = list.map(function (i) { return puzzle.grid[Math.floor(i / SIZE)][i % SIZE]; }).join('');
    var rev = s.split('').reverse().join('');
    var hit = theme.words.filter(function (w) { return (w === s || w === rev) && game.found.indexOf(w) === -1; })[0];
    if (!hit) { sayEl.textContent = 'Not a word on the list.'; return; }
    game.found.push(hit);
    sayEl.textContent = 'Found ' + hit + '. ' + (theme.words.length - game.found.length) + ' to go.';
    track('ws_word', { puzzle: day, word: hit });
    paintFound();
    if (game.found.length === theme.words.length) finish(true);
    save();
  }

  // Pointer: drag from one letter to another, or tap two letters.
  var dragging = false, moved = false, downAt = null;
  function cellAt(x, y) {
    var t = document.elementFromPoint(x, y);
    return t && t.classList && t.classList.contains('ws-cell') ? +t.getAttribute('data-i') : null;
  }
  gridEl.addEventListener('pointerdown', function (e) {
    var i = cellAt(e.clientX, e.clientY);
    if (i == null || game.done) return;
    e.preventDefault();
    startClock();
    dragging = true; moved = false; downAt = i;
    showSelection((anchor != null && line(anchor, i)) || [i]);
  });
  gridEl.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var i = cellAt(e.clientX, e.clientY);
    if (i == null || i === downAt) return;
    moved = true;
    var l = line(downAt, i);
    if (l) showSelection(l);
  });
  function up() {
    if (!dragging) return;
    dragging = false;
    if (moved) { clearAnchor(); check(current); return; }
    // A tap: first tap sets the start, second tap checks the line.
    if (anchor == null) { anchor = downAt; cells[anchor].classList.add('is-anchor'); showSelection([anchor]); return; }
    var l = line(anchor, downAt);
    clearAnchor();
    check(l);
  }
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', function () { dragging = false; showSelection([]); });

  // Keyboard: roving focus with arrow keys; Enter/Space picks start then end.
  gridEl.addEventListener('keydown', function (e) {
    var i = +document.activeElement.getAttribute('data-i');
    if (isNaN(i)) return;
    var r0 = Math.floor(i / SIZE), c0 = i % SIZE, next = null;
    if (e.key === 'ArrowUp' && r0 > 0) next = i - SIZE;
    if (e.key === 'ArrowDown' && r0 < SIZE - 1) next = i + SIZE;
    if (e.key === 'ArrowLeft' && c0 > 0) next = i - 1;
    if (e.key === 'ArrowRight' && c0 < SIZE - 1) next = i + 1;
    if (next != null) {
      e.preventDefault();
      cells[i].tabIndex = -1; cells[next].tabIndex = 0; cells[next].focus();
      if (anchor != null) showSelection(line(anchor, next) || [anchor]);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (game.done) return;
      startClock();
      if (anchor == null) { anchor = i; cells[i].classList.add('is-anchor'); showSelection([i]); sayEl.textContent = 'Start: ' + puzzle.grid[r0][c0] + '. Move to the last letter and press Enter.'; return; }
      var l = line(anchor, i);
      clearAnchor();
      check(l);
    }
    if (e.key === 'Escape') { clearAnchor(); showSelection([]); }
  });
  // Clicks from the keyboard are handled above; stop buttons from also "clicking".
  gridEl.addEventListener('click', function (e) { e.preventDefault(); });

  function shareText() {
    return 'Medics Musings Word Rounds #' + day + ' ✅ ' + game.found.length + '/' + theme.words.length + ' in ' + mmss(game.elapsed) + '\n' + location.origin + '/games/word-rounds/';
  }
  function showStats() {
    var s = store.stats;
    statsEl.innerHTML = '';
    [['Played', s.played], ['Streak', s.streak], ['Best time', s.best != null ? mmss(s.best) : '–']].forEach(function (t) {
      var d = el('div');
      d.appendChild(el('dt', null, t[0]));
      d.appendChild(el('dd', null, String(t[1])));
      statsEl.appendChild(d);
    });
    statsEl.hidden = false;
  }
  var timer = null;
  function countdown(node) {
    function tick() {
      var d = new Date();
      var ms = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d;
      if (ms <= 0) { location.reload(); return; }
      var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
      node.textContent = 'Next puzzle in ' + h + 'h ' + (m < 10 ? '0' : '') + m + 'm.';
    }
    tick();
    clearInterval(timer);
    timer = setInterval(tick, 30000);
  }
  function finish(fresh) {
    clearInterval(ticking);
    if (fresh) {
      game.done = true;
      var s = store.stats;
      s.played++;
      s.streak = s.last === day - 1 ? s.streak + 1 : 1;
      s.last = day;
      if (s.best == null || game.elapsed < s.best) s.best = game.elapsed;
      track('ws_finish', { puzzle: day, seconds: game.elapsed });
      save();
    }
    root.classList.add('is-done');
    result.hidden = false;
    result.querySelector('.game-verdict').textContent = 'All ' + theme.words.length + ' found in ' + mmss(game.elapsed) + '.';
    var links = result.querySelector('.game-links');
    links.innerHTML = '';
    if (theme.link) {
      var a = el('a', 'hear-link', theme.link.label);
      a.href = theme.link.href;
      links.appendChild(a);
    }
    result.querySelector('.game-share').textContent = shareText();
    countdown(result.querySelector('.game-next'));
    showStats();
    if (fresh) result.focus();
  }

  root.querySelector('[data-ws-share]').addEventListener('click', function (e) {
    var btn = e.currentTarget, text = shareText(), label = btn.textContent;
    var copied = function () { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = label; }, 2000); };
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function () {});
      track('ws_share', { method: 'native' });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, function () { window.prompt('Copy your result:', text); });
    else window.prompt('Copy your result:', text);
    track('ws_share', { method: 'clipboard' });
  });

  paintFound();
  if (game.done) finish(false);
  else if (game.found.length) startClock();
})();
