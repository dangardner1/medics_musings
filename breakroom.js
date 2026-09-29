// The Break Room (/break-room/*): small client-side tools for tired clinicians.
// Every tool runs entirely in the browser. Nothing typed is sent anywhere, and
// analytics events (if any) never include what was typed. Each page embeds its
// content as JSON in #br-data; this script wires up whichever tool is present.
(function () {
  var dataEl = document.getElementById('br-data');
  var data = null;
  if (dataEl) { try { data = JSON.parse(dataEl.textContent); } catch (e) { data = null; } }

  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function copyText(text, button, done) {
    var label = button ? button.textContent : '';
    var ok = function () { if (button) { button.textContent = done || 'Copied!'; setTimeout(function () { button.textContent = label; }, 1800); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { window.prompt('Copy this:', text); });
    else window.prompt('Copy this:', text);
  }
  function isMobile() { return /Mobi|Android/i.test(navigator.userAgent); }
  function shareText(text, url) {
    if (navigator.share && isMobile()) return navigator.share({ text: text, url: url }).then(function () { return 'native'; }, function () { return 'cancelled'; });
    return Promise.resolve(false);
  }

  // ---------------------------------------------------------------- Pizza party
  var pizza = $('[data-pizza-form]');
  if (pizza && data) {
    var canvas = $('[data-pizza-canvas]');
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var byId = {};
    data.occasions.forEach(function (o) { byId[o.id] = o; });
    var customWrap = $('[data-pizza-custom]');

    var wrap = function (text, maxWidth) {
      var words = text.split(/\s+/), lines = [], line = '';
      words.forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t;
      });
      if (line) lines.push(line);
      return lines;
    };
    var fitText = function (text, family, weight, style, max, start, min) {
      var size = start;
      do { ctx.font = style + ' ' + weight + ' ' + size + 'px ' + family; size -= 4; } while (ctx.measureText(text).width > max && size > min);
      return text;
    };
    var center = function (text, y) { ctx.fillText(text, W / 2, y); };
    var SERIF = 'Georgia, "Times New Roman", serif';

    var draw = function () {
      var f = pizza.elements;
      var occ = byId[f.occasion.value] || data.occasions[0];
      var isCustom = occ.id === 'custom';
      customWrap.hidden = !isCustom;
      var name = (f.name.value || '').trim() || 'The Person Who Actually Did It';
      var reason = isCustom ? ((f.custom.value || '').trim() || 'everything nobody wrote down') : occ.reason;
      var signer = f.signer.value;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fbf5e4'; ctx.fillRect(0, 0, W, H);
      // subtle paper vignette
      var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(160,120,50,0.18)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // double border
      ctx.strokeStyle = '#8a1c14'; ctx.lineWidth = 14; ctx.strokeRect(38, 38, W - 76, H - 76);
      ctx.strokeStyle = '#b8892b'; ctx.lineWidth = 4; ctx.strokeRect(66, 66, W - 132, H - 132);
      // corner rosettes
      [[92, 92], [W - 92, 92], [92, H - 92], [W - 92, H - 92]].forEach(function (c) {
        ctx.fillStyle = '#b8892b'; ctx.beginPath(); ctx.arc(c[0], c[1], 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbf5e4'; ctx.beginPath(); ctx.arc(c[0], c[1], 6, 0, Math.PI * 2); ctx.fill();
      });

      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#8a1c14'; ctx.font = '600 30px ' + SERIF;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
      center('OFFICE OF EMPLOYEE APPRECIATION', 150);
      ctx.fillStyle = '#1e1a14'; ctx.font = '700 88px ' + SERIF;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
      center('CERTIFICATE', 260);
      ctx.font = '400 44px ' + SERIF;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '14px';
      center('OF APPRECIATION', 322);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

      ctx.fillStyle = '#5b5040'; ctx.font = 'italic 400 34px ' + SERIF;
      center('This certifies that', 398);

      ctx.fillStyle = '#8a1c14';
      fitText(name, SERIF, '700', 'italic', W - 320, 108, 44);
      center(name, 508);
      ctx.strokeStyle = '#b8892b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(300, 534); ctx.lineTo(W - 300, 534); ctx.stroke();

      ctx.fillStyle = '#1e1a14';
      var rs = 34, lines;
      do { ctx.font = '400 ' + rs + 'px ' + SERIF; lines = wrap('in recognition of ' + reason + ', is hereby awarded', W - 340); rs -= 2; } while (lines.length > 2 && rs > 26);
      var y = 572;
      lines.forEach(function (l) { center(l, y); y += rs + 14; });

      y += 50;
      ctx.fillStyle = '#8a1c14'; ctx.font = '800 92px ' + SERIF;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
      center('ONE (1) SLICE', y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      y += 54;
      ctx.fillStyle = '#1e1a14'; ctx.font = '400 40px ' + SERIF;
      center('of pizza, cheese, subject to availability', y);

      // fine print
      ctx.fillStyle = '#5b5040'; ctx.font = 'italic 400 24px ' + SERIF;
      var fine = wrap(occ.fine + ' Toppings are a stretch goal. Slice size at the discretion of whoever cuts it.', W - 380);
      y += 50;
      fine.forEach(function (l) { center(l, y); y += 32; });

      // signature + date
      var date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      ctx.textAlign = 'left';
      ctx.strokeStyle = '#1e1a14'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(190, H - 190); ctx.lineTo(650, H - 190); ctx.stroke();
      ctx.fillStyle = '#1e1a14'; ctx.font = 'italic 400 40px "Brush Script MT", "Segoe Script", cursive';
      ctx.fillText('for the committee', 220, H - 206);
      ctx.font = '400 22px ' + SERIF; ctx.fillStyle = '#5b5040';
      ctx.fillText(signer, 190, H - 154);
      ctx.beginPath(); ctx.moveTo(W - 650, H - 190); ctx.lineTo(W - 190, H - 190); ctx.stroke();
      ctx.fillStyle = '#1e1a14'; ctx.font = '400 32px ' + SERIF; ctx.fillText(date, W - 620, H - 206);
      ctx.fillStyle = '#5b5040'; ctx.font = '400 22px ' + SERIF; ctx.fillText('Date', W - 650, H - 154);

      // seal
      var sx = W / 2, sy = H - 196;
      ctx.beginPath(); ctx.arc(sx, sy, 68, 0, Math.PI * 2); ctx.fillStyle = '#8a1c14'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy, 57, 0, Math.PI * 2); ctx.strokeStyle = '#fbf5e4'; ctx.lineWidth = 3; ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillStyle = '#fbf5e4';
      ctx.font = '700 19px ' + SERIF; ctx.fillText('OFFICIAL', sx, sy - 6);
      ctx.font = '700 17px ' + SERIF; ctx.fillText('SATIRE', sx, sy + 15);

      ctx.fillStyle = '#7a6b52'; ctx.font = '400 21px ' + SERIF;
      center('Satire. Not redeemable for pizza. medicsmusings.com/break-room/pizza-party', H - 92);
    };

    var blobOf = function () { return new Promise(function (res) { canvas.toBlob(res, 'image/png'); }); };
    var fileName = function () { return 'pizza-party-certificate.png'; };
    pizza.addEventListener('input', draw);
    pizza.addEventListener('change', draw);
    pizza.addEventListener('submit', function (e) { e.preventDefault(); });
    draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

    $('[data-pizza-download]').addEventListener('click', function () {
      blobOf().then(function (b) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName();
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        track('download', { content_type: 'pizza_certificate' });
      });
    });
    var shareBtn = $('[data-pizza-share]');
    shareBtn.addEventListener('click', function () {
      blobOf().then(function (b) {
        var file = typeof File === 'function' ? new File([b], fileName(), { type: 'image/png' }) : null;
        var text = 'I have been awarded ONE (1) SLICE. Get yours: https://www.medicsmusings.com/break-room/pizza-party/';
        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && isMobile()) {
          navigator.share({ files: [file], text: text }).then(function () { track('share', { method: 'native-image', content_type: 'pizza_certificate' }); }, function () {});
          return;
        }
        shareText(text, 'https://www.medicsmusings.com/break-room/pizza-party/').then(function (r) {
          if (r) { track('share', { method: r, content_type: 'pizza_certificate' }); return; }
          copyText(text, shareBtn, 'Link copied!');
          track('share', { method: 'clipboard', content_type: 'pizza_certificate' });
        });
      });
    });
    $('[data-pizza-print]').addEventListener('click', function () {
      var old = document.getElementById('br-print'); if (old) old.remove();
      var box = document.createElement('div'); box.id = 'br-print';
      var img = new Image(); img.alt = 'Certificate'; img.src = canvas.toDataURL('image/png');
      box.appendChild(img); document.body.appendChild(box);
      var go = function () { window.print(); setTimeout(function () { box.remove(); }, 500); };
      if (img.complete) go(); else img.onload = go;
      track('print', { content_type: 'pizza_certificate' });
    });
  }

  // ------------------------------------------------------------ Memo translator
  var memoIn = $('[data-memo-in]');
  if (memoIn && data) {
    var out = $('[data-memo-out]'), plainEl = $('[data-memo-plain]'), listEl = $('[data-memo-list]'), noneEl = $('[data-memo-none]'), copyBtn = $('[data-memo-copy]');
    var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    // One matcher per phrase key; keys can be plural or hyphen/space variants.
    var matchers = [];
    data.phrases.forEach(function (p, pi) {
      p.k.forEach(function (k) {
        var src = esc(k.toLowerCase().replace(/[’]/g, "'")).replace(/(\\ |\s)+/g, '[\\s-]+');
        matchers.push({ re: new RegExp('(^|[^a-z0-9])(' + src + '(?:s|es)?)(?![a-z0-9])', 'gi'), p: pi, len: k.length });
      });
    });
    var translate = function (text) {
      var norm = text.replace(/[‘’]/g, "'");
      var hits = [];
      matchers.forEach(function (m) {
        m.re.lastIndex = 0;
        var r;
        while ((r = m.re.exec(norm))) {
          var start = r.index + r[1].length;
          hits.push({ start: start, end: start + r[2].length, p: m.p, len: m.len });
          if (r.index === m.re.lastIndex) m.re.lastIndex++;
        }
      });
      hits.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start) || a.start - b.start; });
      var taken = [];
      hits.forEach(function (h) {
        if (!taken.some(function (t) { return h.start < t.end && h.end > t.start; })) taken.push(h);
      });
      taken.sort(function (a, b) { return a.start - b.start; });
      return taken;
    };
    var plainText = '';
    var render = function () {
      var text = memoIn.value;
      var hits = text.trim() ? translate(text) : [];
      listEl.textContent = ''; plainEl.textContent = '';
      if (!text.trim()) { out.hidden = true; noneEl.hidden = true; copyBtn.hidden = true; return; }
      if (!hits.length) { out.hidden = true; noneEl.hidden = false; copyBtn.hidden = true; return; }
      noneEl.hidden = true; out.hidden = false; copyBtn.hidden = false;
      var pos = 0, plain = '';
      var seen = {};
      hits.forEach(function (h) {
        var before = text.slice(pos, h.start);
        plainEl.appendChild(document.createTextNode(before)); plain += before;
        var t = data.phrases[h.p].t;
        var mark = el('mark', 'br-memo-hit', t);
        plainEl.appendChild(mark); plain += '[' + t + ']';
        pos = h.end;
        if (!seen[h.p]) {
          seen[h.p] = 1;
          var li = el('li');
          li.appendChild(el('q', null, text.slice(h.start, h.end)));
          li.appendChild(el('span', 'br-memo-arrow', ' → '));
          li.appendChild(el('b', null, t));
          listEl.appendChild(li);
        }
      });
      var tail = text.slice(pos);
      plainEl.appendChild(document.createTextNode(tail)); plain += tail;
      plainText = plain;
    };
    var timer;
    memoIn.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { render(); }, 120); });
    var exIdx = 0;
    $('[data-memo-example]').addEventListener('click', function () {
      memoIn.value = data.examples[exIdx++ % data.examples.length];
      render(); track('memo_translate', { source: 'example' });
    });
    $('[data-memo-clear]').addEventListener('click', function () { memoIn.value = ''; render(); memoIn.focus(); });
    copyBtn.addEventListener('click', function () { copyText(plainText, copyBtn); });
    var counted = false;
    memoIn.addEventListener('blur', function () { if (!counted && memoIn.value.trim()) { counted = true; track('memo_translate', { source: 'typed' }); } });
  }

  // -------------------------------------------------------------- Burnout Bingo
  var bingo = document.getElementById('burnout-bingo');
  if (bingo && data) {
    var launch = bingo.getAttribute('data-launch').split('-');
    var now = new Date();
    var day = Math.max(1, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(+launch[0], +launch[1] - 1, +launch[2])) / 86400000) + 1);
    var rng = function (seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
    var rand = rng(day * 2654435761);
    var pool = data.squares.slice();
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    var cells = pool.slice(0, 24);
    cells.splice(12, 0, data.free);
    var KEY = 'mm-bingo-v1';
    var load = function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    var save = function (s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
    var st = load();
    if (st.day !== day) st = { day: day, marks: [12] };
    if (st.marks.indexOf(12) < 0) st.marks.push(12);

    var grid = $('[data-bingo-grid]'), winEl = $('[data-bingo-win]'), countEl = $('[data-bingo-count]');
    $('[data-bingo-num]').textContent = 'Card #' + day;
    var LINES = [];
    for (var r = 0; r < 5; r++) { LINES.push([0, 1, 2, 3, 4].map(function (c) { return r * 5 + c; })); LINES.push([0, 1, 2, 3, 4].map(function (c) { return c * 5 + r; })); }
    LINES.push([0, 6, 12, 18, 24]); LINES.push([4, 8, 12, 16, 20]);
    var buttons = cells.map(function (label, idx) {
      var b = el('button', 'br-bingo-cell', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      if (idx === 12) b.classList.add('is-free');
      b.addEventListener('click', function () {
        if (idx === 12) return;
        var at = st.marks.indexOf(idx);
        if (at < 0) st.marks.push(idx); else st.marks.splice(at, 1);
        save(st); paint(true);
      });
      grid.appendChild(b);
      return b;
    });
    var wonBefore = false;
    var paint = function (fromClick) {
      buttons.forEach(function (b, idx) {
        var on = st.marks.indexOf(idx) >= 0;
        b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.remove('is-win');
      });
      var wins = LINES.filter(function (l) { return l.every(function (i2) { return st.marks.indexOf(i2) >= 0; }); });
      wins.forEach(function (l) { l.forEach(function (i2) { buttons[i2].classList.add('is-win'); }); });
      countEl.textContent = (st.marks.length - 1) + ' of 24 squares' + (wins.length ? ' · ' + wins.length + (wins.length > 1 ? ' bingos' : ' bingo') : '');
      winEl.hidden = !wins.length;
      if (fromClick && wins.length && !wonBefore) track('bingo_win', { card: day });
      wonBefore = wins.length > 0;
    };
    paint(false);
    $('[data-bingo-clear]').addEventListener('click', function () { st = { day: day, marks: [12] }; save(st); paint(false); });
    var shareBtn2 = $('[data-bingo-share]');
    shareBtn2.addEventListener('click', function () {
      var rows = [];
      for (var r2 = 0; r2 < 5; r2++) rows.push([0, 1, 2, 3, 4].map(function (c) { return st.marks.indexOf(r2 * 5 + c) >= 0 ? '🟩' : '⬜'; }).join(''));
      var text = 'Burnout Bingo #' + day + ': ' + (st.marks.length - 1) + '/24' + (winEl.hidden ? '' : ' · BINGO') + '\n' + rows.join('\n') + '\nhttps://www.medicsmusings.com/break-room/burnout-bingo/';
      shareText(text).then(function (r3) {
        if (r3) { track('share', { method: r3, content_type: 'bingo' }); return; }
        copyText(text, shareBtn2, 'Copied!'); track('share', { method: 'clipboard', content_type: 'bingo' });
      });
    });
    var nextEl = $('[data-bingo-next]');
    var tick = function () {
      var d = new Date(), ms = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d;
      if (ms <= 0) { location.reload(); return; }
      var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
      nextEl.textContent = 'Next card in ' + h + 'h ' + (m < 10 ? '0' : '') + m + 'm.';
    };
    tick(); setInterval(tick, 30000);
  }

  // ------------------------------------------------------------------ By time
  var time = $('[data-time]');
  if (time && data) {
    var eps = data.episodes, head = $('[data-time-head]'), list = $('[data-time-list]');
    var moreBtn = $('[data-time-more]'), randBtn = $('[data-time-random]');
    var picks = [].slice.call(time.querySelectorAll('[data-mins]'));
    var current = 0, showAll = false, LIMIT = 5;
    var fits = function (n) { return eps.filter(function (e) { return e.m <= n; }).sort(function (a, b) { return b.m - a.m || (a.t < b.t ? -1 : 1); }); };
    var card = function (e) {
      var li = el('li', 'br-time-item');
      var a = el('a', 'br-time-title', e.t); a.href = '/episodes/' + e.s + '/';
      li.appendChild(el('span', 'br-time-min', e.m + ' min'));
      li.appendChild(a);
      if (e.d) li.appendChild(el('p', null, e.d));
      var play = el('a', 'btn btn-primary', 'Listen ▶'); play.href = '/episodes/' + e.s + '/';
      li.appendChild(play);
      return li;
    };
    var show = function (n) {
      current = n;
      picks.forEach(function (b) { var on = +b.getAttribute('data-mins') === n; b.classList.toggle('is-current', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      var all = fits(n);
      list.textContent = '';
      if (!all.length) {
        var shortest = eps.slice().sort(function (a, b) { return a.m - b.m; })[0];
        head.textContent = 'Nothing that short. Our shortest is ' + shortest.m + ' minutes:';
        list.appendChild(card(shortest)); moreBtn.hidden = true; randBtn.hidden = true; return;
      }
      head.textContent = all.length + ' ' + (all.length === 1 ? 'episode fits' : 'episodes fit') + ' in ' + n + ' minutes, longest first.';
      (showAll ? all : all.slice(0, LIMIT)).forEach(function (e) { list.appendChild(card(e)); });
      moreBtn.hidden = showAll || all.length <= LIMIT;
      moreBtn.textContent = 'Show all ' + all.length;
      randBtn.hidden = false;
    };
    picks.forEach(function (b) { b.addEventListener('click', function () { showAll = false; show(+b.getAttribute('data-mins')); try { history.replaceState(null, '', '#' + b.getAttribute('data-mins')); } catch (e) {} track('time_pick', { minutes: +b.getAttribute('data-mins') }); }); });
    moreBtn.addEventListener('click', function () { showAll = true; show(current); });
    randBtn.addEventListener('click', function () {
      var all = fits(current); var e = all[Math.floor(Math.random() * all.length)];
      list.textContent = ''; list.appendChild(card(e)); head.textContent = 'Your pick (' + e.m + ' min):'; moreBtn.hidden = false; moreBtn.textContent = 'Back to the list'; moreBtn.onclick = function () { moreBtn.onclick = null; showAll = false; show(current); };
    });
    var initial = parseInt((location.hash || '').replace('#', ''), 10);
    if ([3, 5, 10, 20].indexOf(initial) >= 0) show(initial);
  }

  // ------------------------------------------------------------ Out of office
  var ooo = $('[data-ooo]');
  if (ooo && data) {
    var textEl = $('[data-ooo-text]'), kind = 'all', last = -1;
    var chips = [].slice.call(ooo.querySelectorAll('[data-kind]'));
    var pick = function () {
      var pool2 = data.lines.filter(function (l) { return kind === 'all' || l.kind === kind; });
      var i3;
      do { i3 = Math.floor(Math.random() * pool2.length); } while (pool2.length > 1 && pool2[i3].text === last);
      last = pool2[i3].text; textEl.textContent = last;
    };
    chips.forEach(function (c) { c.addEventListener('click', function () { kind = c.getAttribute('data-kind'); chips.forEach(function (x) { x.classList.toggle('is-current', x === c); }); pick(); }); });
    $('[data-ooo-next]').addEventListener('click', pick);
    var cb = $('[data-ooo-copy]');
    cb.addEventListener('click', function () { copyText(textEl.textContent, cb); track('copy', { content_type: 'out_of_office' }); });
    pick();
  }

  // -------------------------------------------------------------------- Take Five
  var five = $('[data-five]');
  if (five) {
    var circle = $('[data-five-circle]'), cue = $('[data-five-cue]'), clock = $('[data-five-time]');
    var audio = $('[data-five-audio]');
    var bVoice = $('[data-five-voice]'), bSilent = $('[data-five-silent]'), bStop = $('[data-five-stop]');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var TOTAL = 66, START = 8, CYCLE = 10, IN = 4, CYCLES = 5;
    var raf = 0, t0 = 0, running = false;
    var ease = function (x) { return 0.5 - 0.5 * Math.cos(Math.PI * x); };
    var setScale = function (s) { if (!reduce) circle.style.transform = 'scale(' + s.toFixed(3) + ')'; };
    var phase = function (t) {
      if (t < START) return { text: t < 0.6 ? 'Let your shoulders drop.' : 'Let your shoulders drop.', s: 1 };
      var c = Math.floor((t - START) / CYCLE);
      if (c >= CYCLES) return { text: t >= TOTAL - 8 ? 'That is it. You had this minute.' : 'Rest.', s: 1 };
      var p = (t - START) - c * CYCLE;
      if (p < IN) return { text: 'Breathe in', s: 1 + 0.55 * ease(p / IN) };
      return { text: 'Breathe out', s: 1.55 - 0.55 * ease((p - IN) / (CYCLE - IN)) };
    };
    var stop = function (finished) {
      running = false; cancelAnimationFrame(raf);
      audio.pause(); try { audio.currentTime = 0; } catch (e) {}
      bStop.hidden = true; bVoice.hidden = false; bSilent.hidden = false;
      circle.style.transform = '';
      cue.textContent = finished ? 'Done. Whatever is next, you had this minute.' : 'Ready when you are.';
      clock.textContent = '';
      circle.classList.remove('is-running');
    };
    var loop = function () {
      if (!running) return;
      var t = (performance.now() - t0) / 1000;
      if (t >= TOTAL) { stop(true); return; }
      var ph = phase(t);
      cue.textContent = ph.text; setScale(ph.s);
      clock.textContent = Math.max(0, Math.ceil(TOTAL - t)) + ' s';
      raf = requestAnimationFrame(loop);
    };
    var begin = function (withVoice) {
      if (running) return;
      running = true;
      bVoice.hidden = true; bSilent.hidden = true; bStop.hidden = false; bStop.focus();
      circle.classList.add('is-running');
      var go = function () { t0 = performance.now(); loop(); };
      if (withVoice) {
        audio.currentTime = 0;
        var pr = audio.play();
        if (pr && pr.then) pr.then(go, function () { go(); }); else go();
      } else go();
      track('take_five_start', { voice: !!withVoice });
    };
    bVoice.addEventListener('click', function () { begin(true); });
    bSilent.addEventListener('click', function () { begin(false); });
    bStop.addEventListener('click', function () { stop(false); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && running) stop(false); });
  }
})();
