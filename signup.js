// Email signup for every form.signup on the site.
// Set ENDPOINT to the newsletter provider's subscribe URL once the list exists:
//   Buttondown: https://buttondown.com/api/emails/embed-subscribe/<username>
//   Kit:        https://app.kit.com/forms/<form-id>/subscriptions
// Until then, Subscribe opens a pre-filled email to the show inbox.
(function () {
  var ENDPOINT = '';
  var INBOX = 'BialystockMDandBloomMD@Gmail.com';

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }

  try {
    Array.prototype.forEach.call(document.querySelectorAll('form.signup'), function (form) {
      var input = form.querySelector('input[type="email"]');
      var button = form.querySelector('button[type="submit"]');
      var status = form.querySelector('.signup-status');
      var where = form.getAttribute('data-location') || 'page';
      var say = function (msg, isError) {
        status.textContent = msg;
        status.classList.toggle('is-error', !!isError);
      };

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = input.value.trim();

        if (!ENDPOINT) {
          location.href = 'mailto:' + INBOX +
            '?subject=' + encodeURIComponent('Add me to the Medics Musings email list') +
            '&body=' + encodeURIComponent('Please email me when new episodes drop: ' + email);
          say('Your email app should open. Hit send and you’re on the list.');
          track('sign_up', { method: 'newsletter_email', location: where });
          return;
        }

        // Providers don't send CORS headers, so the response is opaque; a
        // network failure is the only error we can see.
        var body = new URLSearchParams();
        body.set(/kit\.com|convertkit/.test(ENDPOINT) ? 'email_address' : 'email', email);
        button.disabled = true;
        say('Signing you up…');
        fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body: body }).then(function () {
          form.reset();
          say('Almost done: check your inbox to confirm.');
          track('sign_up', { method: 'newsletter', location: where });
        }, function () {
          say('Couldn’t reach the sign-up service. Please try again in a minute.', true);
        }).then(function () { button.disabled = false; });
      });
    });
  } catch (e) {}
})();
