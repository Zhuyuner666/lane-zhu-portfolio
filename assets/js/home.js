/* Home: the bead curtain. A lighter rewrite in the spirit of version B's curtain:
   each strand is a Verlet chain hanging from an anchor on the rod; opening the curtain slides the
   anchors to the two sides and the beads follow; a hand passing through pushes them aside.
   Physics runs on a fixed 60 Hz step; drawing uses pre-rendered bead sprites. Paused while the
   tab is hidden; drawn once, already open, when reduced motion is requested. */
(function () {
  'use strict';
  var canvas = document.getElementById('beads');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var css = getComputedStyle(document.documentElement);
  function v(name) { return css.getPropertyValue(name).trim(); }
  var PALETTE = ['--bead-rose', '--bead-plum', '--bead-pearl', '--bead-gold', '--bead-cream'].map(v);

  var STEP = 1000 / 60, POINTS = 36, OPEN_AFTER = 950, OPEN_MS = 1500;
  var pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, t: -1e4 };
  var W = 0, H = 0, gap = 20, radius = 3.4, strands = [], sprites = [];
  var raf = 0, last = 0, acc = 0, start = performance.now(), partAt = 0, open = motion.matches ? 1 : 0;

  function build() {
    W = innerWidth; H = innerHeight;
    var phone = W < 720, dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = phone ? 2.5 : 3.4;
    gap = H / (POINTS - 2);
    var count = phone ? 20 : 40, half = count / 2, side = W * (phone ? 0.04 : 0.045);   // gathered close to the edges, clear of the page
    strands = [];
    for (var i = 0; i < count; i++) {
      var x0 = (i + 0.5) / count * W;
      var edge = i < half ? 4 + i / half * side : W - 4 - (count - i - 1) / half * side;
      var x = x0 + (edge - x0) * open, pts = [];
      for (var j = 0; j < POINTS; j++) pts.push({ x: x, y: j * gap, px: x, py: j * gap });
      strands.push({ x0: x0, edge: edge, phase: i * 2.399, color: i % PALETTE.length, pts: pts });
    }
    sprites = PALETTE.map(function (color) {
      var s = document.createElement('canvas'); s.width = s.height = 24;
      var c = s.getContext('2d'), g = c.createRadialGradient(8, 7, 1, 12, 12, 11);
      g.addColorStop(0, v('--bead-white')); g.addColorStop(0.2, color);
      g.addColorStop(0.72, color); g.addColorStop(1, v('--bead-shade'));
      c.fillStyle = g; c.beginPath(); c.arc(12, 12, 10, 0, Math.PI * 2); c.fill();
      return s;
    });
    draw();
  }

  function part() { if (!partAt) partAt = performance.now(); }

  function simulate(now) {
    var push = Math.max(0, 1 - (now - pointer.t) / 180);
    for (var s = 0; s < strands.length; s++) {
      var st = strands[s], p = st.pts, anchor = st.x0 + (st.edge - st.x0) * open, j, a, b;
      p[0].x = anchor; p[0].y = 0;
      for (j = 1; j < POINTS; j++) {
        var q = p[j], vx = (q.x - q.px) * 0.982, vy = (q.y - q.py) * 0.982;
        q.px = q.x; q.py = q.y;
        q.x += vx + Math.sin(now * 0.0007 + st.phase + j * 0.12) * 0.013;
        q.y += vy + 0.18;
        if (push) {
          var dx = q.x - pointer.x, dy = q.y - pointer.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 85 && d > 0) {
            var f = (1 - d / 85) * push;
            q.x += (dx / d * 1.6 + pointer.vx * 0.055) * f;
            q.y += (dy / d * 0.5 + pointer.vy * 0.025) * f;
          }
        }
      }
      for (var pass = 0; pass < 4; pass++) {
        for (var n = 1; n < POINTS; n++) {
          j = pass % 2 ? POINTS - n : n; a = p[j - 1]; b = p[j];
          var ex = b.x - a.x, ey = b.y - a.y, len = Math.sqrt(ex * ex + ey * ey) || 1, c = (len - gap) / len;
          if (j === 1) { b.x -= ex * c; b.y -= ey * c; }
          else { a.x += ex * c * 0.5; a.y += ey * c * 0.5; b.x -= ex * c * 0.5; b.y -= ey * c * 0.5; }
        }
        p[0].x = anchor; p[0].y = 0;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 0.55; ctx.strokeStyle = v('--bead-thread');
    var d = radius * 2;
    for (var s = 0; s < strands.length; s++) {
      var p = strands[s].pts, img = sprites[strands[s].color], j;
      ctx.globalAlpha = 0.65; ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
      for (j = 1; j < POINTS; j++) ctx.lineTo(p[j].x, p[j].y);
      ctx.stroke();
      ctx.globalAlpha = 0.84;
      for (j = 1; j < POINTS; j++) ctx.drawImage(img, p[j].x - radius, p[j].y - radius, d, d);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    var dt = last ? now - last : STEP; last = now;
    if (!partAt && now - start > OPEN_AFTER) part();
    if (partAt) { var t = Math.min(1, (now - partAt) / OPEN_MS); open = 1 - Math.pow(1 - t, 3); }
    acc += Math.min(dt, 50);
    while (acc >= STEP) { simulate(now); acc -= STEP; }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function run() {
    cancelAnimationFrame(raf); last = 0; acc = 0;
    if (motion.matches) { open = 1; build(); return; }
    build();
    raf = requestAnimationFrame(frame);
  }

  function interact(e) {
    pointer.vx = Math.max(-35, Math.min(35, e.clientX - pointer.x));
    pointer.vy = Math.max(-35, Math.min(35, e.clientY - pointer.y));
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = performance.now();
    part();
  }

  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 120); }, { passive: true });
  window.addEventListener('pointermove', interact, { passive: true });
  window.addEventListener('pointerdown', interact, { passive: true });
  document.addEventListener('visibilitychange', function () {
    cancelAnimationFrame(raf); last = 0; acc = 0;
    if (!document.hidden && !motion.matches) raf = requestAnimationFrame(frame);
  });
  if (motion.addEventListener) motion.addEventListener('change', run);
  window.__beads = { get strands() { return strands; }, get open() { return open; } };
  // a page loaded ahead of the click waits for the visitor before it starts the pause
  if (document.prerendering) document.addEventListener('prerenderingchange', function () { start = performance.now(); }, { once: true });
  run();
})();
