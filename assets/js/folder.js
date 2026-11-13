/* Works: Lane's archive folder. It opens once by itself so the three cards fan out;
   the frosted front closes and reopens it. The cards and their tabs are ordinary links. */
(function () {
  'use strict';
  var folder = document.querySelector('[data-folder]');
  if (!folder) return;
  var front = folder.querySelector('[data-folder-toggle]');
  function set(open) {
    folder.classList.toggle('is-open', open);
    front.setAttribute('aria-expanded', String(open));
  }
  front.addEventListener('click', function () { set(!folder.classList.contains('is-open')); });
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function begin() { setTimeout(function () { set(true); }, reduce ? 0 : 650); }
  // a page loaded ahead of the click opens its folder only once the visitor is looking
  if (document.prerendering) document.addEventListener('prerenderingchange', begin, { once: true }); else begin();
})();
