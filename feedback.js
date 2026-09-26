// "Tell Leo and Dan they're wrong" form on the homepage.
// Set FEEDBACK_URL to a Formspree endpoint (https://formspree.io/f/<id>) to
// receive messages in your inbox with no page reload. Until then, Send opens a
// pre-filled email to the show inbox.
(function () {
  var FEEDBACK_URL = '';
  var INBOX = 'BialystockMDandBloomMD@Gmail.com';

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }

  try {
    var form = document.getElementById('feedback');
    if (!form) return;
    var button = form.querySelector('button[type="submit"]');
    var status = form.querySelector('.signup-status');
    var say = function (msg, isError) {
      status.textContent = msg;
      status.classList.toggle('is-error', !!isError);
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var kind = form.elements.kind.value;
      var message = form.elements.message.value.trim();
      var email = form.elements.email.value.trim();
      if (form.elements.company.value) return; // honeypot
      if (!message) return;

      if (!FEEDBACK_URL) {
        location.href = 'mailto:' + INBOX +
          '?subject=' + encodeURIComponent('Medics Musings: ' + kind) +
          '&body=' + encodeURIComponent(message + (email ? '\n\nReply to: ' + email : ''));
        say('Your email app should open. Hit send and it’s on its way.');
        track('feedback_submit', { kind: kind, method: 'mailto' });
        return;
      }

      button.disabled = true;
      say('Sending…');
      fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ kind: kind, message: message, email: email, _subject: 'Medics Musings: ' + kind })
      }).then(function (res) {
        if (!res.ok) throw new Error('bad status');
        form.reset();
        say('Sent. Leo and Dan will pretend they’re not reading it.');
        track('feedback_submit', { kind: kind, method: 'form' });
      }).catch(function () {
        say('Couldn’t send that. Please try again, or email us directly.', true);
      }).then(function () { button.disabled = false; });
    });
  } catch (e) {}
})();
