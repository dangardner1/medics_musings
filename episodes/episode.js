// Episode pages: share button, outbound/play tracking, and resume for
// self-hosted audio. The saved position uses the homepage's key, so a
// listener can start on one page and pick up on the other.
(function () {
  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }
  var article = document.querySelector('.episode');
  var slug = article ? article.getAttribute('data-slug') : '';
  var title = (document.querySelector('h1') || {}).textContent || '';

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

  try {
    var a = document.querySelector('.ep-audio');
    if (a) {
      var fmt = function (sec) {
        sec = Math.floor(sec);
        return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
      };
      var key = 'mm-pos:' + a.getAttribute('src').replace(/^\//, '');
      var saved = 0;
      try { saved = parseFloat(localStorage.getItem(key)) || 0; } catch (e) {}
      var hint = null;
      if (saved > 5) {
        hint = document.createElement('p');
        hint.className = 'ep-resume';
        hint.textContent = 'Resumes from ' + fmt(saved);
        a.parentNode.insertBefore(hint, a.nextSibling);
      }
      a.addEventListener('loadedmetadata', function () {
        if (saved > 5 && saved < a.duration - 10) a.currentTime = saved;
      });
      var lastWrite = 0;
      a.addEventListener('timeupdate', function () {
        if (Date.now() - lastWrite < 5000) return;
        lastWrite = Date.now();
        try { localStorage.setItem(key, String(a.currentTime)); } catch (e) {}
      });
      var started = false;
      a.addEventListener('play', function () {
        if (started) return;
        started = true;
        track('episode_play', { episode_title: title, player: 'self_hosted', page: 'episode', resumed: saved > 5 });
      });
      a.addEventListener('ended', function () {
        try { localStorage.removeItem(key); } catch (e) {}
        if (hint) hint.remove();
        track('episode_complete', { episode_title: title, page: 'episode' });
      });
    }
  } catch (e) {}

  try {
    Array.prototype.forEach.call(document.querySelectorAll('a[data-platform]'), function (link) {
      link.addEventListener('click', function () {
        if (link.classList.contains('ep-link')) {
          track('episode_outbound', { episode_title: title, platform: link.getAttribute('data-platform'), page: 'episode' });
        } else {
          track('follow_click', { platform: link.getAttribute('data-platform'), location: 'episode_page' });
        }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="mailto:"]'), function (link) {
      link.addEventListener('click', function () { track('contact_click'); });
    });
  } catch (e) {}
})();
