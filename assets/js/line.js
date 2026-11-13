/* Styling: two washing lines strung across the sky, one near and one far, crossing each other.
   The looks hang from them on pink and purple clips. One line is looked at, sharp and close;
   the other is out of focus. Tapping the other line (or one of its looks, or the switch below)
   moves the eye to it: the far line comes into focus, the near one drops away below, blurred.
   On the line in focus the looks slide along the rope one at a time and the middle one opens
   its set of photographs. Wheel, arrow keys, a swipe or the buttons move along the line;
   up and down (or a vertical swipe) change lines. Nothing swings: the looks glide and stop. */
(function () {
  'use strict';
  var line = document.querySelector('[data-line]');
  if (!line) return;
  var rowEls = Array.prototype.slice.call(line.querySelectorAll('[data-row]'));
  if (rowEls.length < 2) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var curEl = line.querySelector('[data-cur]'), ofEl = line.querySelector('[data-of]');
  var prevBtn = line.querySelector('[data-step="-1"]'), nextBtn = line.querySelector('[data-step="1"]');
  var switches = Array.prototype.slice.call(line.querySelectorAll('[data-row-go]'));

  var rows = rowEls.map(function (el, r) {
    var looks = Array.prototype.slice.call(el.querySelectorAll('[data-look]'));
    return {
      el: el, r: r, looks: looks, n: looks.length,
      clips: looks.map(function (li) { return li.querySelector('.clip'); }),
      tilt: looks.map(function (li, i) { return ((i * 7 + r * 3) % 5 - 2) * 0.35; }),   // each look hangs a little its own way
      svg: el.querySelector('.rope'), paths: el.querySelectorAll('.rope path'),
      p: 0, v: 0, target: 0, cur: 0, shown: new Uint8Array(looks.length), ropeKey: ''
    };
  });

  /* where each line sits, as fractions of the screen, when it is looked at (on) and when it is not (off):
     yl / yr where the rope meets the left and right edges, sag how far it dips, s its scale */
  var GEO = {
    desk: [
      { on: { yl: .15, yr: .31, sag: .05, s: 1, blur: 0, o: 1 }, off: { yl: .71, yr: .9, sag: .07, s: 1.36, blur: 7, o: .9 } },
      { on: { yl: .29, yr: .13, sag: .05, s: 1, blur: 0, o: 1 }, off: { yl: .33, yr: .07, sag: .03, s: .56, blur: 2.4, o: .92 } }
    ],
    phone: [
      { on: { yl: .17, yr: .26, sag: .04, s: 1, blur: 0, o: 1 }, off: { yl: .83, yr: .93, sag: .05, s: 1.3, blur: 6, o: .88 } },
      { on: { yl: .26, yr: .16, sag: .04, s: 1, blur: 0, o: 1 }, off: { yl: .28, yr: .11, sag: .025, s: .56, blur: 2, o: .92 } }
    ]
  };
  var A = 2.1, COSH = Math.cosh(A) - 1;
  var W = 0, H = 0, cx = 0, lw = 300, gap = 30, phone = false;
  var focus = 0, f = 0, tw = null;          // f: 0 the front line in focus, 1 the back line
  var raf = 0, last = 0;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function mix(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function geoOf(R) {
    var g = GEO[phone ? 'phone' : 'desk'][R.r], a = R.r === 0 ? 1 - f : f, o = {};
    for (var k in g.on) o[k] = mix(g.off[k], g.on[k], a);
    o.a = a;
    return o;
  }
  function sag01(u) { return (Math.cosh(A * u) - 1) / COSH; }
  function ropeY(g, x) { var t = x / W; return H * (g.yl + (g.yr - g.yl) * t + g.sag * (1 - sag01(2 * t - 1))); }
  function ropeAngle(g, x) {
    var t = x / W, dy = (g.yr - g.yl) - g.sag * A * Math.sinh(A * (2 * t - 1)) * 2 / COSH;
    return Math.atan(dy * H / W) * 180 / Math.PI;
  }
  // in focus the middle look comes forward; out of focus they are all much the same size
  function scaleAt(d, a) { return mix(.86 + .14 * Math.exp(-d * d), .62 + .38 * Math.exp(-1.8 * d * d), a); }
  function xAt(d, a) {
    var s = d < 0 ? -1 : 1, ad = Math.abs(d), x = 0;
    for (var k = 1; k <= 9; k++) {
      var step = lw * scaleAt(k - 1, a) / 2 + gap + lw * scaleAt(k, a) / 2;
      if (ad <= k) return s * (x + step * (ad - k + 1));
      x += step;
    }
    return s * (x + (ad - 9) * (lw * .62 + gap));
  }

  function measure() {
    W = line.clientWidth; H = line.clientHeight;
    phone = W < 720;
    cx = W / 2;
    lw = rows[0].looks[0].offsetWidth || 300;
    gap = phone ? 16 : Math.max(30, W * .024);
    rows.forEach(function (R) { R.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); R.ropeKey = ''; });
  }

  function drawRope(R, g) {
    var key = [g.yl, g.yr, g.sag].map(function (n) { return n.toFixed(4); }).join() + W + 'x' + H;
    if (key === R.ropeKey) return;
    R.ropeKey = key;
    var d = '', du = '';
    for (var x = -W * .06; x <= W * 1.06 + 8; x += 8) {
      var y = ropeY(g, x);
      d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      du += (du ? 'L' : 'M') + x.toFixed(1) + ' ' + (y + 1.3 * g.s).toFixed(1);
    }
    R.paths[0].setAttribute('d', du);
    for (var i = 1; i < R.paths.length; i++) R.paths[i].setAttribute('d', d);
    R.svg.style.setProperty('--rw', g.s.toFixed(3));
  }

  function render() {
    rows.forEach(function (R) {
      var g = geoOf(R);
      drawRope(R, g);
      R.el.style.filter = g.blur > .15 ? 'blur(' + g.blur.toFixed(2) + 'px) saturate(' + (1 - g.blur * .025).toFixed(3) + ')' : '';
      R.el.style.opacity = g.o.toFixed(3);
      for (var i = 0; i < R.n; i++) {
        var d = i - R.p, el = R.looks[i];
        if (Math.abs(d) > 4.6) {
          if (R.shown[i]) { el.classList.remove('is-shown'); R.shown[i] = 0; }
          continue;
        }
        if (!R.shown[i]) { el.classList.add('is-shown'); R.shown[i] = 1; }
        var x = cx + xAt(d, g.a) * g.s, y = ropeY(g, x), sc = scaleAt(d, g.a) * g.s;
        el.style.transform = 'translate(' + (x - lw / 2).toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + sc.toFixed(4) + ') rotate(' + R.tilt[i] + 'deg)';
        el.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
        if (R.clips[i]) R.clips[i].style.rotate = (ropeAngle(g, x) - R.tilt[i]).toFixed(2) + 'deg';
      }
    });
  }

  function frame(now) {
    var dt = Math.min(.033, Math.max(.001, (now - last) / 1000));
    last = now;
    var busy = false;
    if (tw) {
      var k = Math.min(1, (now - tw.t0) / tw.dur);
      f = tw.from + (tw.to - tw.from) * ease(k);
      if (k >= 1) tw = null; else busy = true;
    }
    rows.forEach(function (R) {
      if (R.drag) { busy = true; return; }
      var K = 120, C = 2 * Math.sqrt(K);                 // critically damped: it arrives and stops, no swing
      R.v += ((R.target - R.p) * K - R.v * C) * dt;
      R.p += R.v * dt;
      if (Math.abs(R.target - R.p) > .0006 || Math.abs(R.v) > .0006) busy = true;
      else { R.p = R.target; R.v = 0; }
    });
    render();
    raf = busy ? requestAnimationFrame(frame) : 0;
  }
  function kick() {
    if (reduce) { if (tw) { f = tw.to; tw = null; } rows.forEach(function (R) { R.p = R.target; R.v = 0; }); render(); return; }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function wake(R, i) {                                  // start loading the looks about to come into view
    for (var k = i - 3; k <= i + 3; k++) {
      var im = R.looks[k] && R.looks[k].querySelector('.look__photo img');
      if (im && im.loading === 'lazy') im.loading = 'eager';
    }
  }
  function updateUI() {
    var R = rows[focus];
    if (curEl) curEl.textContent = String(R.cur + 1);
    if (ofEl) ofEl.textContent = String(R.n);
    if (prevBtn) prevBtn.disabled = R.cur === 0;
    if (nextBtn) nextBtn.disabled = R.cur === R.n - 1;
    switches.forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-row-go') === focus)); });
  }
  function go(i, R) {
    R = R || rows[focus];
    i = clamp(Math.round(i), 0, R.n - 1);
    if (R.looks[R.cur]) R.looks[R.cur].classList.remove('is-current');
    R.cur = i;
    R.looks[i].classList.add('is-current');
    R.target = i;
    wake(R, i);
    updateUI();
    kick();
  }
  function look(r) {                                     // move the eye to the other line
    r = clamp(r, 0, rows.length - 1);
    if (r === focus) return;
    focus = r;
    rows.forEach(function (R) { R.el.classList.toggle('is-focus', R.r === focus); });
    line.setAttribute('data-focus', String(focus));
    wake(rows[focus], rows[focus].cur);
    tw = { from: f, to: focus, t0: performance.now(), dur: 760 };
    updateUI();
    kick();
  }

  /* wheel: one notch, one look; a trackpad gesture steps every few hundred milliseconds */
  var acc = 0, lockUntil = 0, idle = 0;
  line.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 32;
    e.preventDefault();
    clearTimeout(idle);
    idle = setTimeout(function () { acc = 0; }, 180);
    var now = performance.now();
    if (now < lockUntil) return;
    acc += d;
    if (Math.abs(acc) >= 36) {
      go(rows[focus].cur + (acc > 0 ? 1 : -1));
      acc = 0;
      lockUntil = now + 300;
    }
  }, { passive: false });

  /* drag along the line in focus; a clear vertical swipe changes lines */
  var sx = 0, sy = 0, sp = 0, moved = false, lastX = 0, lastT = 0, vx = 0, pid = null, axis = '', down = false;
  line.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.target.closest('.line__bar, .line__back, .line__switch, .topbar')) return;
    down = true; moved = false; axis = ''; pid = e.pointerId;
    sx = lastX = e.clientX; sy = e.clientY; sp = rows[focus].p; lastT = e.timeStamp; vx = 0;
  });
  line.addEventListener('pointermove', function (e) {
    if (!down || e.pointerId !== pid) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      moved = true;
      try { line.setPointerCapture(pid); } catch (er) {}
    }
    if (axis === 'y') return;
    var R = rows[focus];
    R.drag = true;
    var dt = e.timeStamp - lastT;
    if (dt > 0) vx = .75 * ((e.clientX - lastX) / dt) + .25 * vx;
    lastX = e.clientX; lastT = e.timeStamp;
    var unit = Math.abs(xAt(1, 1)) || 240, np = sp - dx / unit;
    if (np < 0) np *= .35;                              // the posts hold the line: it gives, then resists
    if (np > R.n - 1) np = R.n - 1 + (np - (R.n - 1)) * .35;
    R.p = np; R.v = 0;
    kick();
  });
  function release(e) {
    if (!down || (e && e.pointerId !== pid)) return;
    down = false;
    var R = rows[focus];
    if (axis === 'x') { R.drag = false; go(R.p - vx * 200 / (Math.abs(xAt(1, 1)) || 240)); }
    else if (axis === 'y' && e && e.type === 'pointerup') {
      var dy = e.clientY - sy;
      if (Math.abs(dy) > 44) look(dy < 0 ? 1 : 0);      // swipe up to the far line, down to the near one
    }
  }
  line.addEventListener('pointerup', release);
  line.addEventListener('pointercancel', release);

  /* a tap on the other line, or on one of its looks, moves the eye there; on the line in focus a look at
     the side comes to the middle first, and only the middle look opens */
  line.addEventListener('click', function (e) {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
    var rope = e.target.closest('[data-rope]');
    if (rope) { look(+rope.closest('[data-row]').getAttribute('data-row')); return; }
    var li = e.target.closest('[data-look]');
    if (!li) return;
    var R = rows[+li.closest('[data-row]').getAttribute('data-row')], i = R.looks.indexOf(li);
    if (R.r !== focus) { e.preventDefault(); e.stopPropagation(); go(i, R); look(R.r); return; }
    if (i !== R.cur) { e.preventDefault(); e.stopPropagation(); go(i, R); }
  }, true);

  rows.forEach(function (R) {
    R.looks.forEach(function (li, i) {
      var b = li.querySelector('.look__photo');
      if (b) b.addEventListener('focus', function () {
        if (!b.matches(':focus-visible')) return;
        go(i, R);
        look(R.r);
      });
    });
  });
  switches.forEach(function (b) { b.addEventListener('click', function () { look(+b.getAttribute('data-row-go')); }); });
  line.addEventListener('scroll', function () { line.scrollLeft = 0; line.scrollTop = 0; });

  if (prevBtn) prevBtn.addEventListener('click', function () { go(rows[focus].cur - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { go(rows[focus].cur + 1); });
  document.addEventListener('keydown', function (e) {
    if (document.querySelector('.modal[data-open]')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(rows[focus].cur + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(rows[focus].cur - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); look(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); look(0); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(rows[focus].n - 1);
  });

  var rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { measure(); render(); }, 80);
  });

  measure();
  rows[0].el.classList.add('is-focus');
  line.setAttribute('data-focus', '0');
  if (!reduce) { rows[0].p = -2.6; rows[1].p = Math.floor((rows[1].n - 1) / 2) - 3.4; }  // drawn in from the right on arrival
  go(Math.floor((rows[1].n - 1) / 2), rows[1]);         // the far line shows its middle, so it spans the sky behind
  go(0, rows[0]);
  render();
})();
