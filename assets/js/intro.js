/* The envelope at the start of a project page.
   It slides onto the page once per visit; a tap on the seal lifts the flap, the folded letter
   rises out of the pocket, comes forward and unfolds in thirds. "Read on" puts it away and the
   envelope button on the page brings it back. */
(function () {
  'use strict';
  var intro = document.querySelector('[data-intro]');
  if (!intro) return;

  var root = document.documentElement;
  var stage = intro.querySelector('[data-stage]');
  var env = intro.querySelector('[data-env]');
  var letter = intro.querySelector('[data-letter]');
  var seal = intro.querySelector('[data-intro-open]');
  var done = intro.querySelector('.intro__done');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'lz-letter:' + location.pathname;
  var EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
  var STATES = ['is-open', 'is-flapped', 'is-lifted', 'is-out', 'is-done', 'is-leaving'];

  var timers = [], anims = [], state = 'hidden', returnTo = null, g = null;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function stopTimers() { timers.forEach(clearTimeout); timers = []; }
  function stopAnims() { anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); anims = []; }
  function T(ty, s) { return 'translate(0px, ' + ty.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')'; }
  function move(from, to, ms, ease) {
    if (!letter.animate) { letter.style.transform = to; return; }
    anims.push(letter.animate([{ transform: from }, { transform: to }], { duration: ms, easing: ease, fill: 'forwards' }));
  }

  /* Where the letter sits at each step, measured from layout (offsets ignore running transforms). */
  function geometry() {
    var lw = letter.offsetWidth, lh = letter.offsetHeight, top = letter.offsetTop;
    var s0 = Math.min(1, env.offsetWidth * 0.84 / lw);
    var folded = lh / 3 * s0;
    return {
      s0: s0,
      inside: env.offsetTop + env.offsetHeight * 0.13 - top,
      risen: env.offsetTop - folded * 0.8 - top,
      centred: lh / 3,
      lh: lh
    };
  }

  function reset() {
    stopTimers(); stopAnims();
    STATES.forEach(function (c) { intro.classList.remove(c); });
    letter.classList.add('is-folded');
    letter.style.transform = '';
  }

  function show(from) {
    returnTo = from || null;
    reset();
    intro.hidden = false;
    root.classList.add('intro-on');
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    if (reduce) {                                   // no travel: the letter is simply there, open
      letter.classList.remove('is-folded');
      intro.classList.add('is-open', 'is-flapped', 'is-lifted', 'is-out', 'is-done');
      state = 'open';
      done.focus({ preventScroll: true });
      return;
    }
    g = geometry();
    letter.style.transform = T(g.inside, g.s0);
    state = 'closed';
    if (stage.animate) {                            // the envelope slides onto the table
      stage.animate([
        { transform: 'translateY(72vh) rotate(-7deg)' },
        { transform: 'none' }
      ], { duration: 900, easing: EASE_OUT });
    }
    later(function () { seal.focus({ preventScroll: true }); }, 400);
  }

  function open() {
    if (state !== 'closed') return;
    state = 'opening';
    g = geometry();
    intro.classList.add('is-open');                 // flap swings up over the top
    later(function () { intro.classList.add('is-flapped'); }, 360);
    var t = 520;
    later(function () {                             // the folded letter rises out of the pocket
      move(T(g.inside, g.s0), T(g.risen, g.s0), 640, EASE_OUT);
    }, t);
    t += 640;
    later(function () {                             // ...comes forward; the envelope drops away
      intro.classList.add('is-lifted', 'is-out');
      move(T(g.risen, g.s0), T(g.centred, 1), 720, EASE_IN_OUT);
    }, t);
    t += 760;
    later(function () {                             // ...and unfolds, keeping itself centred
      letter.classList.remove('is-folded');
      move(T(g.centred, 1), T(0, 1), 940, EASE_IN_OUT);
    }, t);
    t += 960;
    later(function () {
      intro.classList.add('is-done');
      state = 'open';
      done.focus({ preventScroll: true });
    }, t);
  }

  function close() {
    if (intro.hidden || state === 'leaving') return;
    state = 'leaving';
    stopTimers();
    intro.classList.add('is-leaving');
    later(function () {
      intro.hidden = true;
      root.classList.remove('intro-on');
      reset();
      state = 'hidden';
      if (returnTo) returnTo.focus({ preventScroll: true });
    }, reduce ? 0 : 320);
  }

  env.addEventListener('click', open);
  intro.addEventListener('click', function (e) {
    if (e.target.closest('[data-intro-close]')) close();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-intro-replay]');
    if (b) show(b);
  });
  document.addEventListener('keydown', function (e) {
    if (intro.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {                          // keep focus inside the dialog
      e.preventDefault();
      (state === 'open' ? done : seal).focus();
    }
  });

  var seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  function begin() { if (!seen) setTimeout(function () { show(null); }, reduce ? 0 : 450); }
  // a page loaded ahead of the click keeps its envelope until the visitor arrives
  if (document.prerendering) document.addEventListener('prerenderingchange', begin, { once: true }); else begin();
})();
