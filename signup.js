// Email signup for every form.signup on the site, backed by a Mailchimp audience.
// Set MAILCHIMP_URL to the form action from Mailchimp's embedded form
// (Audience > Signup forms > Embedded forms, the <form action="..."> value):
//   https://<account>.us<N>.list-manage.com/subscribe/post?u=<u>&id=<id>&f_id=<f_id>
// Until then, Subscribe opens a pre-filled email to the show inbox.
(function () {
  var MAILCHIMP_URL = 'https://dangardnermd.us2.list-manage.com/subscribe/post?u=6ec106537cbe21888e56c9dc8&id=8cbe14ef1a&f_id=005eb3e3f0';
  var INBOX = 'BialystockMDandBloomMD@Gmail.com';

  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {}
  }

  // Mailchimp answers this endpoint with JSONP when given a callback name (c=),
  // and sends no CORS headers, so a <script> tag is how we read its reply.
  var seq = 0;
  function subscribe(email, done) {
    var cb = 'mmSignup' + (++seq) + '_' + Date.now();
    var base = MAILCHIMP_URL;
    var params = new URL(base).searchParams;
    // b_<u>_<id> is Mailchimp's bot trap and must be sent empty.
    var url = base + '&EMAIL=' + encodeURIComponent(email) +
      '&b_' + params.get('u') + '_' + params.get('id') + '=' +
      // Marketing permission "Email" (the form's copy tells people they're agreeing to episode emails).
      '&' + encodeURIComponent('gdpr[6553]') + '=Y&c=' + cb;
    var script = document.createElement('script');
    var timer = setTimeout(function () { finish({ result: 'error', msg: '' }); }, 10000);
    function finish(res) {
      clearTimeout(timer);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      script.remove();
      done(res);
    }
    window[cb] = finish;
    script.onerror = function () { finish({ result: 'error', msg: '' }); };
    script.src = url;
    document.head.appendChild(script);
  }

  function plain(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/^\d+\s*-\s*/, '').trim();
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

        if (!MAILCHIMP_URL) {
          location.href = 'mailto:' + INBOX +
            '?subject=' + encodeURIComponent('Add me to the Medics Musings email list') +
            '&body=' + encodeURIComponent('Please email me when new episodes drop: ' + email);
          say('Your email app should open. Hit send and you’re on the list.');
          track('sign_up', { method: 'newsletter_email', location: where });
          return;
        }

        button.disabled = true;
        say('Signing you up…');
        subscribe(email, function (res) {
          button.disabled = false;
          if (res.result === 'success') {
            form.reset();
            say('Almost done: check your inbox to confirm.');
            track('sign_up', { method: 'mailchimp', location: where });
          } else if (/already subscribed/i.test(res.msg)) {
            say('You’re already on the list. New episodes will find you.');
          } else {
            say(plain(res.msg) || 'Couldn’t reach the sign-up service. Please try again in a minute.', true);
          }
        });
      });
    });
  } catch (e) {}
})();
