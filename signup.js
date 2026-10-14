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
  // topics: '|ai|series-pax-inguinalis|' (the TOPICS merge field; blank = every episode).
  // scripts/new-episode-email.mjs sends each episode only to matching or blank subscribers.
  function subscribe(email, topics, name, done) {
    var cb = 'mmSignup' + (++seq) + '_' + Date.now();
    var base = MAILCHIMP_URL;
    var params = new URL(base).searchParams;
    // b_<u>_<id> is Mailchimp's bot trap and must be sent empty.
    var parts = (name || '').trim().split(/\s+/);
    var first = parts.shift() || '';
    var last = parts.join(' ');
    var url = base + '&EMAIL=' + encodeURIComponent(email) +
      (first ? '&FNAME=' + encodeURIComponent(first) : '') +
      (last ? '&LNAME=' + encodeURIComponent(last) : '') +
      (topics ? '&TOPICS=' + encodeURIComponent(topics) : '') +
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
      // Every signup collects a name (for The Weekly Dose greeting). Pages built
      // before the name field existed get one added here.
      var nameInput = form.querySelector('input[name="fname"]');
      if (!nameInput && input) {
        nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.name = 'fname';
        nameInput.required = true;
        nameInput.autocomplete = 'name';
        nameInput.placeholder = 'Your name';
        nameInput.setAttribute('aria-label', 'Your name');
        input.parentNode.insertBefore(nameInput, input);
      }
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
        var name = nameInput ? nameInput.value.trim() : '';
        var picked = Array.prototype.map.call(form.querySelectorAll('input[name="topics"]:checked'), function (b) { return b.value; });
        var topics = picked.length ? '|' + picked.join('|') + '|' : '';

        if (!MAILCHIMP_URL) {
          location.href = 'mailto:' + INBOX +
            '?subject=' + encodeURIComponent('Add me to the Medics Musings email list') +
            '&body=' + encodeURIComponent('Please add me to the list: ' + (name ? name + ', ' : '') + email + (picked.length ? ' (topics: ' + picked.join(', ') + ')' : ''));
          say('Your email app should open. Hit send and you’re on the list.');
          track('sign_up', { method: 'newsletter_email', location: where });
          return;
        }

        button.disabled = true;
        say('Signing you up…');
        subscribe(email, topics, name, function (res) {
          button.disabled = false;
          if (res.result === 'success') {
            form.reset();
            say('Almost done: check your inbox to confirm.');
            track('sign_up', { method: 'mailchimp', location: where, topics: picked.join(',') || 'all' });
          } else if (/already subscribed/i.test(res.msg)) {
            say(picked.length
              ? 'You’re already on the list. To change topics, use “Update preferences” at the bottom of any of our emails.'
              : 'You’re already on the list. New episodes will find you.');
          } else {
            say(plain(res.msg) || 'Couldn’t reach the sign-up service. Please try again in a minute.', true);
          }
        });
      });
    });
  } catch (e) {}
})();
