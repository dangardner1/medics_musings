// ICD-10 code of the day (/icd10/): the page embeds every code as JSON, and this
// shows today's, counted from the launch date on the reader's calendar, so
// everyone sees the same code on the same day. Also lists the last week's codes
// and handles sharing.
(function () {
  var root = document.getElementById('icd10-of-the-day');
  var dataEl = document.getElementById('icd10-data');
  if (!root || !dataEl) return;
  var list;
  try { list = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!list || !list.length) return;

  var launch = root.getAttribute('data-launch').split('-');
  var now = new Date();
  var n = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(+launch[0], +launch[1] - 1, +launch[2])) / 86400000);
  var at = function (day) { return list[((day % list.length) + list.length) % list.length]; };
  var idOf = function (code) { return code.toLowerCase().replace('.', '-'); };
  var today = at(n);
  var number = Math.max(0, n) + 1;

  var set = function (sel, text) { var el = root.querySelector(sel); if (el) el.textContent = text; };
  set('[data-icd-kind]', today.k);
  set('[data-icd-code]', today.c);
  set('[data-icd-desc]', today.d);
  set('[data-icd-note]', today.n);
  var more = root.querySelector('[data-icd-more]');
  if (more) more.setAttribute('href', '#' + idOf(today.c));
  var num = document.querySelector('[data-icd-num]');
  if (num) num.textContent = '#' + number;

  // The last week's codes, newest first (nothing before the launch day).
  var recent = document.querySelector('[data-icd-recent]');
  if (recent) {
    var ol = recent.querySelector('.icd-recent-list');
    for (var k = 1; k <= 7 && n - k >= 0; k++) {
      var e = at(n - k);
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + idOf(e.c);
      var code = document.createElement('b');
      code.textContent = e.c;
      a.appendChild(code);
      a.appendChild(document.createTextNode(' ' + e.d));
      li.appendChild(a);
      ol.appendChild(li);
    }
    recent.hidden = !ol.children.length;
  }

  var next = root.querySelector('.icd-next');
  var tick = function () {
    var d = new Date();
    var ms = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d;
    if (ms <= 0) { location.reload(); return; }
    var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
    if (next) next.textContent = 'Next code in ' + h + 'h ' + (m < 10 ? '0' : '') + m + 'm.';
  };
  tick();
  setInterval(tick, 30000);

  var track = function (name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (err) {} };
  var share = root.querySelector('[data-icd-share]');
  if (share) share.addEventListener('click', function () {
    var url = 'https://www.medicsmusings.com/icd10/#' + idOf(today.c);
    var text = 'ICD-10 code of the day #' + number + ': ' + today.c + ', ' + today.d + '. “' + today.n + '”';
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.share({ title: 'Medics Musings', text: text, url: url }).catch(function () {});
      track('share', { method: 'native', content_type: 'icd10', item_id: today.c });
      return;
    }
    var label = share.textContent;
    var done = function () { share.textContent = 'Copied!'; setTimeout(function () { share.textContent = label; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + ' ' + url).then(done, function () { window.prompt('Copy this:', text + ' ' + url); });
    } else {
      window.prompt('Copy this:', text + ' ' + url);
    }
    track('share', { method: 'clipboard', content_type: 'icd10', item_id: today.c });
  });
})();
