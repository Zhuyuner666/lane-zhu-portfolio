/* Projects wall: the glass over each picture follows the pointer and the frame tilts a little. */
(function () {
  'use strict';
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('a.frame__link').forEach(function (link) {
    var body = link.querySelector('.frame__body');
    if (!body) return;
    var raf = 0, u = .5, v = .5;
    function apply() {
      raf = 0;
      body.style.setProperty('--ry', ((u - .5) * 8).toFixed(2) + 'deg');
      body.style.setProperty('--rx', ((.5 - v) * 6).toFixed(2) + 'deg');
      body.style.setProperty('--gx', (u * 100).toFixed(1) + '%');
      body.style.setProperty('--gy', (v * 100).toFixed(1) + '%');
    }
    link.addEventListener('pointermove', function (e) {
      var r = body.getBoundingClientRect();
      u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      body.classList.add('is-tilting');
      if (!raf) raf = requestAnimationFrame(apply);
    });
    link.addEventListener('pointerleave', function () {
      body.classList.remove('is-tilting');
      body.style.setProperty('--rx', '0deg');
      body.style.setProperty('--ry', '0deg');
    });
  });
})();
