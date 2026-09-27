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
    if (!form) return;
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
  } catch (e) {}
})();
