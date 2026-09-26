// Enhances every self-hosted episode player (audio.ep-audio) on the homepage
// and episode pages: skip ±15s, speed, sleep timer, lock-screen controls
// (Media Session) and 25/50/75/100% listening milestones for GA4.
// Spotify-only episodes use Spotify's own player; see episodes/episode.js.
(function () {
  var ARTIST = 'Leo A. Gordon, MD & Dan Gardner, MD';
  var RATES = [1, 1.25, 1.5, 1.75, 2];
  var SLEEPS = [0, 15, 30, 60, 'end'];
  var SKIP = 15;
  var bars = [];
  var rate = 1;
  var sleepIdx = 0;
  var sleepTimer = null;
  var sleepAtEnd = false;
  var active = null;
  var onEpisodePage = !!document.querySelector('.episode');

  try { rate = parseFloat(localStorage.getItem('mm-rate')) || 1; } catch (e) {}
  if (RATES.indexOf(rate) < 0) rate = 1;

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }

  function titleFor(a) {
    var card = a.closest('.ep-card');
    var h = (card && card.querySelector('h3')) || document.querySelector('h1');
    return h ? h.textContent.trim() : document.title;
  }

  function rateLabel(r) { return r + '×'; }
  function sleepLabel(v) {
    if (!v) return 'Sleep';
    return v === 'end' ? 'Sleep: end' : 'Sleep ' + v + 'm';
  }

  // Shared with episodes/episode.js so "sleep at end of episode" also stops autoplay-next.
  window.MM = window.MM || {};
  window.MM.track = track;
  window.MM.sleepAtEnd = function () { return sleepAtEnd; };

  function setSleep(idx) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    sleepIdx = idx;
    var v = SLEEPS[idx];
    sleepAtEnd = v === 'end';
    if (typeof v === 'number' && v > 0) {
      sleepTimer = setTimeout(function () {
        Array.prototype.forEach.call(document.querySelectorAll('audio.ep-audio'), function (a) { a.pause(); });
        setSleep(0);
        track('sleep_timer_fired');
      }, v * 60000);
    }
    bars.forEach(function (b) {
      b.sleep.textContent = sleepLabel(v);
      b.sleep.classList.toggle('is-on', !!v);
    });
    if (v) track('sleep_timer_set', { minutes: String(v) });
  }

  function setRate(r) {
    rate = r;
    try { localStorage.setItem('mm-rate', String(r)); } catch (e) {}
    Array.prototype.forEach.call(document.querySelectorAll('audio.ep-audio'), function (a) { a.playbackRate = r; });
    bars.forEach(function (b) {
      b.speed.textContent = rateLabel(r);
      b.speed.classList.toggle('is-on', r !== 1);
    });
  }

  function seek(a, delta) {
    var t = a.currentTime + delta;
    a.currentTime = Math.max(0, isFinite(a.duration) ? Math.min(a.duration, t) : t);
  }

  function makeButton(label, aria, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctl' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    return b;
  }

  function buildBar(a) {
    var bar = document.createElement('div');
    bar.className = 'ep-controls';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Playback controls');
    var back = makeButton('−' + SKIP + 's', 'Back ' + SKIP + ' seconds');
    var fwd = makeButton('+' + SKIP + 's', 'Forward ' + SKIP + ' seconds');
    var speed = makeButton(rateLabel(rate), 'Playback speed', rate !== 1 ? 'is-on' : '');
    var sleep = makeButton(sleepLabel(SLEEPS[sleepIdx]), 'Sleep timer');
    back.addEventListener('click', function () { seek(a, -SKIP); });
    fwd.addEventListener('click', function () { seek(a, SKIP); });
    speed.addEventListener('click', function () {
      setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]);
      track('playback_speed', { rate: String(rate) });
    });
    sleep.addEventListener('click', function () { setSleep((sleepIdx + 1) % SLEEPS.length); });
    [back, fwd, speed, sleep].forEach(function (b) { bar.appendChild(b); });
    a.parentNode.insertBefore(bar, a.nextSibling);
    bars.push({ speed: speed, sleep: sleep });
  }

  function setMediaSession(a) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    active = a;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: titleFor(a),
        artist: ARTIST,
        album: 'Medics Musings',
        artwork: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/channel-poster.jpg', sizes: '912x1154', type: 'image/jpeg' }
        ]
      });
      var handlers = {
        play: function () { active && active.play(); },
        pause: function () { active && active.pause(); },
        seekbackward: function (d) { active && seek(active, -((d && d.seekOffset) || SKIP)); },
        seekforward: function (d) { active && seek(active, (d && d.seekOffset) || SKIP); },
        seekto: function (d) { if (active && d && typeof d.seekTime === 'number') active.currentTime = d.seekTime; },
        nexttrack: function () {
          var next = document.querySelector('.episode');
          if (next && next.getAttribute('data-next-url')) location.href = next.getAttribute('data-next-url');
        }
      };
      Object.keys(handlers).forEach(function (k) {
        try { navigator.mediaSession.setActionHandler(k, handlers[k]); } catch (e) {}
      });
      if (!onEpisodePage) { try { navigator.mediaSession.setActionHandler('nexttrack', null); } catch (e) {} }
    } catch (e) {}
  }

  function setPosition(a) {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !isFinite(a.duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: a.duration,
        playbackRate: a.playbackRate || 1,
        position: Math.min(a.currentTime, a.duration)
      });
    } catch (e) {}
  }

  function milestones(a) {
    var fired = {};
    var prev = 0;
    var lastPos = 0;
    function fire(pct) {
      if (fired[pct]) return;
      fired[pct] = true;
      track('episode_progress', {
        episode_title: titleFor(a),
        percent: pct,
        player: 'self_hosted',
        page: onEpisodePage ? 'episode' : 'home'
      });
    }
    a.addEventListener('timeupdate', function () {
      if (!isFinite(a.duration) || !a.duration) return;
      var pct = (a.currentTime / a.duration) * 100;
      // Count natural playback only; a big jump (seek or resume) doesn't earn milestones.
      if (pct - prev > 0 && pct - prev <= 5) {
        [25, 50, 75].forEach(function (m) { if (prev < m && pct >= m) fire(m); });
      }
      prev = pct;
      if (Date.now() - lastPos > 1000) { lastPos = Date.now(); setPosition(a); }
    });
    a.addEventListener('ended', function () { fire(100); });
    a.addEventListener('play', function () {
      if (a.currentTime < 1) { fired = {}; prev = 0; }
      a.playbackRate = rate;
      setMediaSession(a);
    });
    a.addEventListener('loadedmetadata', function () { a.playbackRate = rate; setPosition(a); });
    a.addEventListener('ratechange', function () { setPosition(a); });
    a.addEventListener('seeked', function () { setPosition(a); });
  }

  try {
    var audios = document.querySelectorAll('audio.ep-audio');
    Array.prototype.forEach.call(audios, function (a) {
      buildBar(a);
      milestones(a);
      // Only one episode plays at a time.
      a.addEventListener('play', function () {
        Array.prototype.forEach.call(document.querySelectorAll('audio.ep-audio'), function (o) { if (o !== a) o.pause(); });
      });
    });
  } catch (e) {}
})();
