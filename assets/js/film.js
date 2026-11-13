/* Film: the films run on one strip of 35mm wound round a drum. Each film starts with its poster
   frame and runs on through stills taken from it. Scrolling, dragging or the arrow keys wind the
   strip; the frame in the light is shown in colour, and the frosted panel beside it names its film,
   with the list of all of them below. Tapping that frame, or Play film, opens the film with its
   notes underneath (site.js). Without script the frames are simply a list. */
(function () {
  'use strict';
  var root = document.querySelector('[data-screening]');
  if (!root) return;
  var strip = root.querySelector('[data-strip]');
  var reel = strip && strip.querySelector('.strip__frames');
  var dataEl = document.getElementById('films-data');
  if (!reel || !dataEl) return;
  var films = JSON.parse(dataEl.textContent);
  var frames = Array.prototype.slice.call(reel.children);
  var N = frames.length;
  if (!N) return;
  var shades = frames.map(function (fr) { return fr.querySelector('.frame__shade'); });
  var filmOf = frames.map(function (fr) { return +fr.getAttribute('data-f'); });
  var hidden = new Uint8Array(N);
  var info = root.querySelector('[data-info]');
  var el = {
    no: info.querySelector('[data-no]'), title: info.querySelector('[data-title]'),
    meta: info.querySelector('[data-meta]'), text: info.querySelector('[data-excerpt]'),
    play: info.querySelector('[data-play]')
  };
  var gotos = Array.prototype.slice.call(info.querySelectorAll('[data-goto]'));
  var glows = Array.prototype.slice.call(root.querySelectorAll('.screening__glow img'));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var fh = 0, R = 0, STEP = 0;
  var p = 0, v = 0, target = 0, cur = -1, film = -1, raf = 0, last = 0, drag = false;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function measure() {
    fh = frames[0].offsetHeight || 300;
    R = fh * 2.05;                                     // the drum: frames meet edge to edge round it
    STEP = 2 * Math.atan(fh / 2 / R);
  }

  function render() {
    for (var i = 0; i < N; i++) {
      var d = i - p, th = d * STEP, fr = frames[i];
      if (Math.abs(th) > 1.52) {
        if (!hidden[i]) { fr.style.visibility = 'hidden'; hidden[i] = 1; }
        continue;
      }
      if (hidden[i]) { fr.style.visibility = ''; hidden[i] = 0; }
      fr.style.transform = 'translate3d(0,' + (R * Math.sin(th)).toFixed(2) + 'px,' + (R * Math.cos(th) - R).toFixed(2) +
        'px) rotateX(' + (-th).toFixed(4) + 'rad)';
      shades[i].style.opacity = Math.min(.84, Math.abs(d) * .36).toFixed(3);
    }
    var c = clamp(Math.round(p), 0, N - 1);
    if (c !== cur) setCurrent(c);
  }

  function setCurrent(c) {
    if (frames[cur]) frames[cur].classList.remove('is-current');
    cur = c;
    frames[c].classList.add('is-current');
    wake(c);
    if (filmOf[c] !== film) showFilm(filmOf[c]);
    glowSoon();
  }

  function showFilm(f) {
    var first = film === -1, d = films[f];
    film = f;
    el.no.textContent = pad(f + 1);
    el.title.textContent = d.title;
    el.meta.textContent = [d.date, d.duration].filter(Boolean).join(', ');
    el.text.textContent = d.excerpt;
    var a = el.play;
    a.href = '#' + d.id;
    a.setAttribute('data-film', d.id);
    a.setAttribute('data-video', d.video);
    a.setAttribute('data-poster', d.poster);
    a.setAttribute('data-title', d.title);
    a.setAttribute('data-date', d.date);
    a.setAttribute('aria-label', 'Play ' + d.title);
    gotos.forEach(function (b, i) {
      if (i === f) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    if (!first && !reduce && el.title.animate) {
      [el.no, el.title, el.meta, el.text].forEach(function (n, i) {
        n.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: i * 45, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'backwards' });
      });
    }
  }

  /* the room takes its colour from the frame in the light */
  var gt = 0, gi = 0, glowSrc = '';
  function glowSoon() { clearTimeout(gt); gt = setTimeout(glow, reduce ? 0 : 160); }
  function glow() {
    if (glows.length < 2) return;
    var img = frames[cur].querySelector('img'), src = img && (img.currentSrc || img.src);
    if (!src || src === glowSrc) return;
    glowSrc = src;
    var next = glows[1 - gi], prev = glows[gi];
    gi = 1 - gi;
    next.onload = function () { next.classList.add('is-on'); prev.classList.remove('is-on'); };
    next.src = src;
  }

  function wake(c) {                                   // load the frames about to come round
    for (var k = c - 4; k <= c + 4; k++) {
      var im = frames[k] && frames[k].querySelector('img');
      if (im && im.loading === 'lazy') im.loading = 'eager';
    }
  }

  function frame(now) {
    var dt = Math.min(.033, Math.max(.001, (now - last) / 1000));
    last = now;
    var busy = drag;
    if (!drag) {
      var K = 90, C = 2 * Math.sqrt(K);                 // critically damped: the drum turns and stops
      v += ((target - p) * K - v * C) * dt;
      p += v * dt;
      if (Math.abs(target - p) > .0005 || Math.abs(v) > .0005) busy = true;
      else { p = target; v = 0; }
    }
    render();
    raf = busy ? requestAnimationFrame(frame) : 0;
  }
  function kick() {
    if (reduce && !drag) { p = target; v = 0; render(); return; }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function go(i) { target = clamp(Math.round(i), 0, N - 1); kick(); }

  /* the wheel winds the strip: a notch is a frame, a trackpad runs it smoothly, then it settles */
  var snapT = 0;
  root.addEventListener('wheel', function (e) {
    if (e.ctrlKey || document.querySelector('.modal[data-open]')) return;
    e.preventDefault();
    var d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (e.deltaMode === 1) d *= 32; else if (e.deltaMode === 2) d *= 400;
    target = clamp(target + d / 100, -.3, N - 1 + .3);
    clearTimeout(snapT);
    snapT = setTimeout(function () { go(target); }, 150);
    kick();
  }, { passive: false });

  /* drag the strip up or down */
  var sy = 0, sp = 0, lastY = 0, lastT = 0, vy = 0, pid = null, moved = false, down = false;
  strip.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    down = true; moved = false; pid = e.pointerId;
    sy = lastY = e.clientY; sp = p; lastT = e.timeStamp; vy = 0;
  });
  strip.addEventListener('pointermove', function (e) {
    if (!down || e.pointerId !== pid) return;
    var dy = e.clientY - sy;
    if (!moved) {
      if (Math.abs(dy) < 6) return;
      moved = true; drag = true;
      try { strip.setPointerCapture(pid); } catch (er) {}
    }
    var dt = e.timeStamp - lastT;
    if (dt > 0) vy = .75 * ((e.clientY - lastY) / dt) + .25 * vy;
    lastY = e.clientY; lastT = e.timeStamp;
    var np = sp - dy / fh;
    if (np < 0) np *= .35;                              // the ends of the strip give a little, then hold
    if (np > N - 1) np = N - 1 + (np - (N - 1)) * .35;
    p = target = np; v = 0;
    kick();
  });
  function release(e) {
    if (!down || (e && e.pointerId !== pid)) return;
    down = false;
    if (moved) { drag = false; go(p - vy * 220 / fh); }
  }
  strip.addEventListener('pointerup', release);
  strip.addEventListener('pointercancel', release);

  /* a frame away from the light comes round first; the one in the light plays */
  reel.addEventListener('click', function (e) {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
    var fr = e.target.closest('.frame');
    if (!fr) return;
    var i = frames.indexOf(fr);
    if (i !== cur || Math.abs(p - cur) > .2) { e.preventDefault(); e.stopPropagation(); go(i); }
  }, true);

  gotos.forEach(function (b, i) { b.addEventListener('click', function () { go(films[i].first); }); });

  document.addEventListener('keydown', function (e) {
    if (document.querySelector('.modal[data-open]')) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
    else if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
    else if (k === 'PageDown') { e.preventDefault(); go(films[Math.min(films.length - 1, film + 1)].first); }
    else if (k === 'PageUp') { e.preventDefault(); go(films[cur === films[film].first ? Math.max(0, film - 1) : film].first); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(N - 1); }
  });

  var rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { measure(); render(); }, 80);
  });

  measure();
  var start = 0;
  if (location.hash) {
    films.forEach(function (d) { if ('#' + d.id === location.hash) start = d.first; });
  }
  target = start;
  p = reduce ? start : start - 1.6;                   // the strip winds into place on arrival
  render();
  strip.classList.add('is-on');
  kick();
})();
