/* About me: the note types itself onto the blue paper, quickly, with a pause at each comma and
   full stop; then the signature is written in and the postmark is stamped. A click, a tap or
   any key finishes it at once. Without script, or with reduced motion, the text is simply there. */
(function () {
  'use strict';
  var card = document.querySelector('.about__card');
  if (!card) return;
  var blocks = Array.prototype.slice.call(card.querySelectorAll('[data-type]'));
  if (!blocks.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var SPEED = { title: 32, lede: 17, body: 7 };
  var schedule = [], t = 120;

  blocks.forEach(function (el, b) {
    var text = el.textContent, per = SPEED[el.getAttribute('data-type')] || 10;
    el.textContent = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      el.appendChild(s);
      schedule.push({ el: s, block: el, at: t });
      t += per;
      if (ch === ',' || ch === '—') t += 55;
      else if (ch === '.' && i < text.length - 1) t += 140;
    }
    t += b === 0 ? 200 : 260;
  });

  var caret = document.createElement('span');
  caret.className = 'caret';
  caret.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.add('is-typing');

  var shown = 0, t0 = 0, raf = 0, done = false;
  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    for (; shown < schedule.length; shown++) schedule[shown].el.classList.add('on');
    if (caret.parentNode) caret.parentNode.removeChild(caret);
    card.classList.add('is-signed');
    window.removeEventListener('pointerdown', finish);
    window.removeEventListener('keydown', finish);
  }
  function tick(now) {
    if (!t0) t0 = now;
    var el = now - t0;
    while (shown < schedule.length && schedule[shown].at <= el) {
      var item = schedule[shown++];
      item.el.classList.add('on');
      item.el.parentNode.insertBefore(caret, item.el.nextSibling);
    }
    if (shown >= schedule.length) { setTimeout(finish, 260); return; }
    raf = requestAnimationFrame(tick);
  }
  window.addEventListener('pointerdown', finish);
  window.addEventListener('keydown', finish);
  var go = function () { raf = requestAnimationFrame(tick); };
  var start = function () { if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go(); };
  // opened ahead of time by a hover (prerender): wait until the visitor actually arrives
  if (document.prerendering) document.addEventListener('prerenderingchange', start, { once: true }); else start();
})();
