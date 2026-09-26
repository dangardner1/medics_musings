// Site-wide extras: offline support (service worker), "Copy RSS" buttons and
// the hero's "Play the latest episode" button.
(function () {
  var RSS = 'https://anchor.fm/s/117844514/podcast/rss';

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }

  // Offline: pages you've visited keep working without a connection.
  try {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      });
    }
  } catch (e) {}

  try {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy-rss]'), function (btn) {
      var label = btn.textContent;
      btn.addEventListener('click', function () {
        var done = function () {
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = label; }, 2000);
          track('copy_rss', { location: btn.closest('.follow') ? 'topbar' : 'page' });
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(RSS).then(done, function () { window.prompt('Copy this RSS feed:', RSS); });
        } else {
          window.prompt('Copy this RSS feed:', RSS);
        }
      });
    });
  } catch (e) {}

  // Hero: one tap plays the newest episode (self-hosted audio, or Spotify's player).
  try {
    var latest = document.querySelector('[data-play-latest]');
    if (latest) {
      latest.addEventListener('click', function () {
        var grid = document.getElementById('ep-grid');
        var card = grid && grid.querySelector('.ep-card');
        if (!card) return;
        track('play_latest_click', { episode_title: (card.querySelector('h3') || {}).textContent });
        var audio = card.querySelector('audio.ep-audio');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (audio) {
          audio.play().catch(function () {});
        } else {
          var btn = card.querySelector('.ep-play');
          if (btn) btn.click();
        }
      });
    }
  } catch (e) {}
})();
