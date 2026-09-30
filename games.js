// The daily "Name that eponym" game on /games/eponym/. The puzzles are embedded
// in the page (#game-data) by build-extras.mjs; everyone gets the same one each
// day, counted from the launch date on the player's own calendar. Progress and
// stats stay in this browser (localStorage) and are never sent anywhere.
(function () {
  var root = document.getElementById('eponym-game');
  var dataEl = document.getElementById('game-data');
  if (!root || !dataEl) return;

  var MAX = 5;
  var KEY = 'mm-eponym-v1';
  var puzzles;
  try { puzzles = JSON.parse(dataEl.textContent); } catch (e) { return; }

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/['’]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Puzzle number from the local calendar date (day 1 = launch).
  var launch = root.getAttribute('data-launch').split('-');
  var now = new Date();
  var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  var day = Math.max(1, Math.floor((today - Date.UTC(+launch[0], +launch[1] - 1, +launch[2])) / 86400000) + 1);
  var p = puzzles[(day - 1) % puzzles.length];

  var store = load();
  if (!store.stats) store.stats = { played: 0, wins: 0, streak: 0, best: 0, last: 0 };
  if (!store.game || store.game.day !== day) store.game = { day: day, guesses: [], done: false, won: false };
  var game = store.game;

  var num = document.querySelector('[data-game-num]');
  if (num) num.textContent = '#' + day;
  var clues = root.querySelector('.game-clues');
  var form = root.querySelector('.game-form');
  var input = form.querySelector('input');
  var left = form.querySelector('.game-left');
  var guessList = root.querySelector('.game-guesses');
  var result = root.querySelector('.game-result');
  var statsEl = root.querySelector('.game-stats');

  function showClues(n) {
    while (clues.children.length < n) {
      var i = clues.children.length;
      var li = el('li', 'game-clue');
      li.appendChild(el('span', 'game-clue-n', 'Clue ' + (i + 1)));
      li.appendChild(el('span', 'game-clue-text', p.clues[i]));
      clues.appendChild(li);
    }
  }

  function showGuesses() {
    guessList.innerHTML = '';
    game.guesses.forEach(function (g, i) {
      var right = i === game.guesses.length - 1 && game.won;
      var li = el('li', right ? 'is-right' : 'is-wrong');
      li.appendChild(el('span', 'game-mark', right ? '✓' : '✗'));
      li.appendChild(document.createTextNode(' ' + g));
      guessList.appendChild(li);
    });
    var remaining = MAX - game.guesses.length;
    left.textContent = game.done ? '' : remaining + (remaining === 1 ? ' guess left' : ' guesses left');
  }

  function shareText() {
    var grid = game.guesses.map(function (g, i) { return i === game.guesses.length - 1 && game.won ? '🟩' : '🟥'; }).join('');
    return 'Medics Musings Eponym #' + day + ' ' + grid + ' ' + (game.won ? game.guesses.length : 'X') + '/' + MAX + '\n' + location.origin + '/games/eponym/';
  }

  function showStats() {
    var s = store.stats;
    statsEl.innerHTML = '';
    [['Played', s.played], ['Win %', s.played ? Math.round(100 * s.wins / s.played) : 0], ['Streak', s.streak], ['Best streak', s.best]].forEach(function (t) {
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
      var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
      node.textContent = 'Next eponym in ' + h + 'h ' + (m < 10 ? '0' : '') + m + 'm ' + (sec < 10 ? '0' : '') + sec + 's.';
    }
    tick();
    clearInterval(timer);
    timer = setInterval(tick, 1000);
  }

  function finish(focus) {
    form.hidden = true;
    showClues(MAX);
    result.hidden = false;
    result.querySelector('.game-verdict').textContent = game.won
      ? (game.guesses.length === 1 ? 'First guess. Show-off.' : 'Got it in ' + game.guesses.length + '.')
      : 'Not today. The answer was:';
    var ans = result.querySelector('.game-answer');
    ans.innerHTML = '';
    ans.appendChild(el('strong', null, p.name));
    ans.appendChild(document.createTextNode(' (' + p.person + '). ' + p.what));
    var links = result.querySelector('.game-links');
    links.innerHTML = '';
    if (p.listen) {
      var a = el('a', 'hear-link', 'Hear it in “' + p.listen.title + '”');
      a.href = p.listen.url;
      links.appendChild(a);
    }
    var more = el('a', 'hear-link', 'Read more in the eponym index');
    more.href = p.more;
    links.appendChild(more);
    result.querySelector('.game-share').textContent = shareText();
    countdown(result.querySelector('.game-next'));
    showStats();
    if (focus) result.focus();
  }

  function record(won) {
    var s = store.stats;
    s.played++;
    if (won) {
      s.wins++;
      s.streak = s.last === day - 1 ? s.streak + 1 : 1;
      s.best = Math.max(s.best, s.streak);
      s.last = day;
    } else {
      s.streak = 0;
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var g = input.value.trim();
    if (!g || game.done) return;
    if (game.guesses.some(function (x) { return norm(x) === norm(g); })) {
      left.textContent = 'You already tried that one.';
      return;
    }
    if (!game.guesses.length) track('game_start', { game: 'eponym', puzzle: day });
    game.guesses.push(g);
    var right = p.accept.indexOf(norm(g)) !== -1;
    track('game_guess', { game: 'eponym', puzzle: day, correct: right, guess_number: game.guesses.length });
    input.value = '';
    if (right || game.guesses.length >= MAX) {
      game.done = true;
      game.won = right;
      record(right);
      track('game_finish', { game: 'eponym', puzzle: day, won: right, guesses: game.guesses.length });
    }
    save(store);
    showGuesses();
    if (game.done) finish(true);
    else { showClues(game.guesses.length + 1); input.focus(); }
  });

  function cardOpts() {
    var grid = game.guesses.map(function (g, i) { return i === game.guesses.length - 1 && game.won ? '🟩' : '🟥'; }).join('');
    return { game: 'Name that eponym', number: day, result: grid, detail: (game.won ? game.guesses.length : 'X') + '/' + MAX + ' guesses', url: 'medicsmusings.com/games/eponym/' };
  }

  root.querySelector('[data-game-share]').addEventListener('click', function (e) {
    var btn = e.currentTarget;
    var text = shareText();
    var label = btn.textContent;
    var reset = function () { setTimeout(function () { btn.textContent = label; }, 2000); };
    if (window.MMResultCard) {
      btn.textContent = 'Preparing…';
      window.MMResultCard.share(cardOpts(), text, 'medics-musings-eponym-' + day + '.png').then(function (method) {
        btn.textContent = method === 'clipboard' ? 'Copied!' : label;
        track('game_share', { game: 'eponym', method: method, with_image: method === 'native-image' });
        if (method !== 'cancelled') reset();
      });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { btn.textContent = 'Copied!'; reset(); }, function () { window.prompt('Copy your result:', text); });
    else window.prompt('Copy your result:', text);
    track('game_share', { game: 'eponym', method: 'clipboard', with_image: false });
  });

  var dlBtn = root.querySelector('[data-game-download]');
  if (dlBtn) dlBtn.addEventListener('click', function () {
    if (!window.MMResultCard) return;
    track('game_share', { game: 'eponym', method: 'download' });
    window.MMResultCard.download(cardOpts(), 'medics-musings-eponym-' + day + '.png');
  });

  // Restore today's progress (a reload mid-game keeps the guesses).
  showGuesses();
  if (game.done) finish(false);
  else { form.hidden = false; showClues(game.guesses.length + 1); }
})();
