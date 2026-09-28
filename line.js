// Line of the day (/line-of-the-day/): every line is already in the page;
// this shows today's, counted from the launch date on the reader's calendar,
// so everyone sees the same line on the same day.
(function () {
  var root = document.getElementById('line-of-the-day');
  if (!root) return;
  var days = root.querySelectorAll('.line-day');
  if (!days.length) return;
  var launch = root.getAttribute('data-launch').split('-');
  var now = new Date();
  var n = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(+launch[0], +launch[1] - 1, +launch[2])) / 86400000);
  var i = ((n % days.length) + days.length) % days.length;
  Array.prototype.forEach.call(days, function (d, k) { d.hidden = k !== i; });
  var num = document.querySelector('[data-line-num]');
  if (num) num.textContent = '#' + (Math.max(0, n) + 1);
  var next = root.querySelector('.line-next');
  var tick = function () {
    var d = new Date();
    var ms = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d;
    if (ms <= 0) { location.reload(); return; }
    var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
    next.textContent = 'Next line in ' + h + 'h ' + (m < 10 ? '0' : '') + m + 'm.';
  };
  tick();
  setInterval(tick, 30000);
  try {
    days[i].querySelector('.line-hear a').addEventListener('click', function () {
      if (window.gtag) window.gtag('event', 'line_hear', { line: i + 1 });
    });
  } catch (e) {}
})();
