// Result cards for the daily games: a 1200x630 image of a player's result,
// drawn in the browser (the site is static, so there's no server to render
// it). Used by games.js and wordsearch.js for "Share" and "Download image".
// Never draws the answer, only the score.
(function () {
  var W = 1200, H = 630, PAD = 72;
  var C = { bg: '#0b0f14', surface: '#131a22', text: '#f4f1ea', muted: '#8892a0', accent: '#ff5a3c', pulse: '#35d399', border: '#24303b' };

  function ready() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('800 100px "Big Shoulders Display"'),
      document.fonts.load('600 30px "IBM Plex Mono"'),
      document.fonts.load('400 30px "IBM Plex Sans"'),
    ]).catch(function () {});
  }

  // Emoji glyphs (🟥🟩✅) don't reliably render on <canvas> across browsers, so
  // draw the result as plain colored shapes instead: a row of squares for a
  // grid result (🟥/🟩), or a single check mark for a "found them all" result.
  function drawResult(ctx, result, x, y) {
    var squares = result.match(/./gu) || [];
    if (result === '✅' || !squares.length) {
      ctx.strokeStyle = C.pulse; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 34); ctx.lineTo(x + 26, y + 58); ctx.lineTo(x + 66, y + 6);
      ctx.stroke();
      return;
    }
    var size = 44, gap = 12;
    squares.forEach(function (ch, i) {
      ctx.fillStyle = ch === '🟩' ? C.pulse : C.accent;
      var rx = x + i * (size + gap);
      roundRect(ctx, rx, y, size, size, 8);
      ctx.fill();
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function pulse(ctx, x, y, w) {
    var pts = [[0, 20], [200, 20], [215, 4], [228, 36], [242, 20], [260, 20], [272, 12], [284, 28], [296, 20], [640, 20]];
    var s = w / 640;
    ctx.strokeStyle = C.pulse; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(function (p, i) { var px = x + p[0] * s, py = y + (p[1] - 20) * s * 1.2; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.stroke();
  }

  // opts: { game, number, result, detail, url }
  function draw(opts) {
    return ready().then(function () {
      var canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = 'top';

      ctx.font = '800 44px "Big Shoulders Display", "Arial Narrow", sans-serif';
      ctx.fillStyle = C.text; ctx.fillText('MEDICS', PAD, 56);
      var w1 = ctx.measureText('MEDICS').width;
      ctx.fillStyle = C.accent; ctx.fillText('MUSINGS', PAD + w1, 56);

      ctx.font = '600 26px "IBM Plex Mono", monospace';
      ctx.fillStyle = C.pulse;
      ctx.fillText(('DAILY GAME · #' + opts.number).toUpperCase(), PAD, 150);

      ctx.font = '800 96px "Big Shoulders Display", "Arial Narrow", sans-serif';
      ctx.fillStyle = C.text;
      ctx.fillText(opts.game.toUpperCase(), PAD, 190);

      drawResult(ctx, opts.result, PAD, 300);

      ctx.font = '400 34px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = C.muted;
      ctx.fillText(opts.detail, PAD, 414);

      pulse(ctx, PAD, H - 62, 200);
      ctx.font = '600 28px "IBM Plex Mono", monospace';
      ctx.fillStyle = C.text;
      ctx.fillText('Can you beat it? ' + opts.url, PAD + 220, H - 80);

      ctx.fillStyle = C.accent; ctx.fillRect(0, H - 8, W, 8);
      return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
    });
  }

  // Share the image with the text where the browser supports files (phones);
  // otherwise copy the text. Returns 'native-image', 'native' or 'clipboard'.
  function share(opts, text, fileName) {
    return draw(opts).then(function (blob) {
      var file = blob && typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Mobi|Android/i.test(navigator.userAgent)) {
        return navigator.share({ files: [file], text: text }).then(function () { return 'native-image'; }, function () { return 'cancelled'; });
      }
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        return navigator.share({ text: text }).then(function () { return 'native'; }, function () { return 'cancelled'; });
      }
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return 'clipboard'; });
      window.prompt('Copy your result:', text);
      return 'clipboard';
    });
  }

  function download(opts, fileName) {
    return draw(opts).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  }

  window.MMResultCard = { draw: draw, share: share, download: download };
})();
