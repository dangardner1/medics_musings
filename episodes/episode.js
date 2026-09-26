// Episode pages: share, reactions, resume, outbound tracking, and the
// "what's next" flow (next part of a series plays on; otherwise a recommendation).
// Self-hosted audio is enhanced by /player.js; Spotify-only episodes use
// Spotify's iFrame API here so we can see progress and the end of the episode.
(function () {
  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }
  var article = document.querySelector('.episode');
  if (!article) return;
  var slug = article.getAttribute('data-slug');
  var title = article.getAttribute('data-title') || (document.querySelector('h1') || {}).textContent || '';
  var nextUrl = article.getAttribute('data-next-url');
  var nextTitle = article.getAttribute('data-next-title');
  var nextKind = article.getAttribute('data-next-kind');
  var autoplay = /[?&]autoplay=1(&|$)/.test(location.search);

  // ---- Share ---------------------------------------------------------------
  try {
    var btn = document.querySelector('.ep-share');
    if (btn) {
      var label = btn.textContent;
      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-share-url');
        if (navigator.share) {
          navigator.share({ title: btn.getAttribute('data-share-title'), url: url }).then(function () {
            track('share', { method: 'native', content_type: 'episode', item_id: slug });
          }).catch(function () {});
          return;
        }
        track('share', { method: 'clipboard', content_type: 'episode', item_id: slug });
        var done = function (msg) {
          btn.textContent = msg;
          setTimeout(function () { btn.textContent = label; }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { done('Link copied'); }, function () { window.prompt('Copy this link:', url); });
        } else {
          window.prompt('Copy this link:', url);
        }
      });
    }
  } catch (e) {}

  // ---- Reaction (kept in this browser; counted in analytics) ------------------
  try {
    var react = document.querySelector('.react');
    var note = document.querySelector('.react-note');
    if (react) {
      var key = 'mm-like:' + slug;
      var liked = false;
      try { liked = localStorage.getItem(key) === '1'; } catch (e) {}
      var paint = function () {
        react.setAttribute('aria-pressed', String(liked));
        react.classList.toggle('is-on', liked);
        react.textContent = liked ? '👍 Thanks!' : '👍 Loved it';
        if (note) note.textContent = liked ? 'Leo and Dan will be insufferable about this.' : '';
      };
      paint();
      react.addEventListener('click', function () {
        liked = !liked;
        try { if (liked) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch (e) {}
        paint();
        track('episode_reaction', { episode_slug: slug, reaction: liked ? 'like' : 'unlike' });
      });
    }
  } catch (e) {}

  // ---- What's next -------------------------------------------------------------
  var toast = document.getElementById('up-next-toast');
  var countdown = null;
  function hideToast() {
    clearInterval(countdown);
    countdown = null;
    if (toast) toast.hidden = true;
  }
  function go() {
    hideToast();
    track('up_next_go', { from: slug, kind: nextKind });
    location.href = nextUrl + (nextKind === 'series' ? '?autoplay=1' : '');
  }
  function episodeEnded() {
    if (!toast || !nextUrl) return;
    var text = toast.querySelector('.toast-text');
    var goBtn = toast.querySelector('.toast-go');
    var cancel = toast.querySelector('.toast-cancel');
    goBtn.href = nextUrl + (nextKind === 'series' ? '?autoplay=1' : '');
    goBtn.textContent = 'Play now';
    cancel.onclick = hideToast;
    var sleeping = window.MM && window.MM.sleepAtEnd && window.MM.sleepAtEnd();
    if (nextKind === 'series' && !sleeping) {
      var left = 8;
      text.textContent = 'Next: ' + nextTitle + ' in ' + left + 's';
      toast.hidden = false;
      countdown = setInterval(function () {
        left--;
        if (left <= 0) { go(); return; }
        text.textContent = 'Next: ' + nextTitle + ' in ' + left + 's';
      }, 1000);
    } else {
      text.textContent = 'Recommended next: ' + nextTitle;
      cancel.textContent = 'Not now';
      toast.hidden = false;
      var upNext = document.getElementById('up-next');
      if (upNext) upNext.classList.add('is-highlight');
    }
    track('up_next_shown', { from: slug, kind: nextKind });
  }

  // ---- Self-hosted audio: resume, events, what's next ---------------------------
  try {
    var a = document.querySelector('.ep-audio');
    if (a) {
      var fmt = function (sec) {
        sec = Math.floor(sec);
        return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
      };
      // Same key as the homepage, so a listener can start on one page and resume on the other.
      var posKey = 'mm-pos:' + a.getAttribute('src').replace(/^\//, '');
      var saved = 0;
      try { saved = parseFloat(localStorage.getItem(posKey)) || 0; } catch (e) {}
      var hint = null;
      if (saved > 5 && !autoplay) {
        hint = document.createElement('p');
        hint.className = 'ep-resume';
        hint.textContent = 'Resumes from ' + fmt(saved);
        var bar = a.nextElementSibling && a.nextElementSibling.classList.contains('ep-controls') ? a.nextElementSibling : a;
        bar.parentNode.insertBefore(hint, bar.nextSibling);
      }
      a.addEventListener('loadedmetadata', function () {
        if (saved > 5 && !autoplay && saved < a.duration - 10) a.currentTime = saved;
      });
      var lastWrite = 0;
      a.addEventListener('timeupdate', function () {
        if (Date.now() - lastWrite < 5000) return;
        lastWrite = Date.now();
        try { localStorage.setItem(posKey, String(a.currentTime)); } catch (e) {}
      });
      var started = false;
      a.addEventListener('play', function () {
        hideToast();
        if (started) return;
        started = true;
        track('episode_play', { episode_title: title, player: 'self_hosted', page: 'episode', resumed: saved > 5 });
      });
      a.addEventListener('ended', function () {
        try { localStorage.removeItem(posKey); } catch (e) {}
        if (hint) hint.remove();
        track('episode_complete', { episode_title: title, page: 'episode' });
        episodeEnded();
      });
      if (autoplay) {
        var p = a.play();
        if (p && p.catch) p.catch(function () {
          if (toast) {
            toast.querySelector('.toast-text').textContent = 'Tap play to start ' + title;
            toast.querySelector('.toast-go').hidden = true;
            toast.querySelector('.toast-cancel').textContent = 'OK';
            toast.querySelector('.toast-cancel').onclick = hideToast;
            toast.hidden = false;
          }
        });
      }
    }
  } catch (e) {}

  // ---- Spotify-only episodes: progress + end via Spotify's iFrame API ----------------
  try {
    var wrap = document.getElementById('ep-embed');
    var id = wrap && wrap.getAttribute('data-spotify');
    if (wrap && id) {
      var fired = {};
      var prev = 0;
      var ended = false;
      var started2 = false;
      var fire = function (pct) {
        if (fired[pct]) return;
        fired[pct] = true;
        track('episode_progress', { episode_title: title, percent: pct, player: 'spotify_embed', page: 'episode' });
      };
      window.onSpotifyIframeApiReady = function (IFrameAPI) {
        var mount = document.createElement('div');
        wrap.appendChild(mount);
        IFrameAPI.createController(mount, { uri: 'spotify:episode:' + id, width: '100%', height: window.innerWidth <= 680 ? 352 : 152 }, function (ctrl) {
          var staticFrame = wrap.querySelector('iframe[src*="/embed/episode/"]:not([data-api])');
          // The API replaces `mount` with its own iframe; drop the static fallback once it exists.
          var mounted = wrap.querySelectorAll('iframe');
          if (mounted.length > 1 && staticFrame) staticFrame.remove();
          ctrl.addListener('playback_update', function (e) {
            var d = e && e.data;
            if (!d || !d.duration) return;
            if (!d.isPaused && !started2) {
              started2 = true;
              hideToast();
              track('episode_play', { episode_title: title, player: 'spotify_embed', page: 'episode' });
            }
            var pct = (d.position / d.duration) * 100;
            if (pct - prev > 0 && pct - prev <= 5) {
              [25, 50, 75].forEach(function (m) { if (prev < m && pct >= m) fire(m); });
            }
            prev = pct;
            // Spotify plays full episodes only for signed-in listeners; a short preview isn't "the end".
            if (d.duration >= 90000 && d.position >= d.duration - 1500 && !ended) {
              ended = true;
              fire(100);
              track('episode_complete', { episode_title: title, page: 'episode' });
              episodeEnded();
            }
            if (d.position < d.duration - 5000) ended = false;
          });
          if (autoplay) {
            ctrl.addListener('ready', function () { ctrl.play(); });
            setTimeout(function () { try { ctrl.play(); } catch (e) {} }, 800);
          }
        });
      };
      var s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      document.body.appendChild(s);
    }
  } catch (e) {}

  // ---- Outbound clicks --------------------------------------------------------------
  try {
    Array.prototype.forEach.call(document.querySelectorAll('a[data-platform]'), function (link) {
      link.addEventListener('click', function () {
        var platform = link.getAttribute('data-platform');
        if (link.closest('.ep-listen') || link.classList.contains('ep-link')) {
          track('episode_outbound', { episode_title: title, platform: platform, page: 'episode' });
        } else {
          track('follow_click', { platform: platform, location: 'episode_page' });
        }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="mailto:"]'), function (link) {
      link.addEventListener('click', function () { track('contact_click'); });
    });
  } catch (e) {}
})();
