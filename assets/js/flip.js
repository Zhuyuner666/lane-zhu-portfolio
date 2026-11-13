/* The project books: their pages turn like paper (StPageFlip, MIT, vendored in assets/vendor).
   The page text lives once in the HTML, in reading order, as blocks (.flip-src). On load this
   script measures those blocks into pages of the exact size that fits the screen:
     data-page   a page of its own (covers, title pages, plates, album pages)
     data-float  a picture page that waits for the end of the current text page
     data-flow   running text; paragraphs split across pages, headings stay with what follows
   then hands the pages to StPageFlip: two-page spreads on a desk, single pages on a phone.
   A book may also carry its author's own spreads (data-flip-wide: every picture and text box placed
   in Canva units, a page being 960 x 1080). Where the screen has room for two such pages large
   enough to read, those are the pages; each text box is set as large as its box allows.
   Without script, or if anything fails, the blocks simply read as one long page. */
(function () {
  'use strict';
  var root = document.querySelector('[data-flip]');
  if (!root) return;
  if (!window.St || !window.St.PageFlip) { document.documentElement.classList.add('flip-failed'); return; }
  var src = root.querySelector('[data-flip-src]');
  var wideSrc = root.querySelector('[data-flip-wide]');
  var WRATIO = 1080 / 960;
  var skin = (root.className.match(/flipbook--(\w+)/) || [])[1] || '';
  var nav = root.querySelector('.flipbook__nav');
  var hint = root.querySelector('.flipbook__hint');
  var seal = root.querySelector('.lang-seal');
  var stage = root.querySelector('[data-flip-stage]');
  var curEl = root.querySelector('[data-flip-cur]');
  var prevBtn = root.querySelector('[data-flip-prev]');
  var nextBtn = root.querySelector('[data-flip-next]');
  var RATIO = parseFloat(root.getAttribute('data-ratio')) || 1.4;
  var MAXH = parseFloat(root.getAttribute('data-max-h')) || 820;
  function lang() { return doc.lang === 'zh-CN' ? 'zh' : 'en'; }
  function bookTitle() { return (lang() === 'zh' && root.getAttribute('data-title-zh')) || root.getAttribute('data-title') || ''; }
  function runOf(block) { return block.getAttribute('data-run-' + lang()) || block.getAttribute('data-run') || ''; }
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var doc = document.documentElement;

  var flip = null, host = null, geo = null, total = 0, anchors = {}, current = 0;
  var measure = document.createElement('div');
  measure.className = 'flip-measure ' + (root.getAttribute('data-skin') || '');
  measure.setAttribute('aria-hidden', 'true');
  root.appendChild(measure);

  /* ---------------- geometry: the largest page that fits ---------------- */
  function geometry() {
    var vw = window.innerWidth, vh = window.innerHeight, phone = vw < 760;
    if (wideSrc && !phone) {
      // her spreads, as large as the screen allows: the arrows stand beside the book, the count below it
      var wpw = Math.min((Math.min(vw, 2400) - 136) / 2, (vh - 112) / WRATIO);
      if (wpw >= 470) return { pw: Math.floor(wpw), ph: Math.floor(wpw * WRATIO), phone: false, wide: true };
    }
    var availH = Math.max(340, vh - (phone ? 150 : 176));
    var availW = phone ? vw - 28 : (Math.min(vw, 1560) - 150) / 2;
    var ph = Math.min(availH, MAXH), pw = ph / RATIO;
    if (pw > availW) { pw = availW; ph = pw * RATIO; }
    return { pw: Math.floor(pw), ph: Math.floor(ph), phone: phone, wide: false };
  }

  /* ---------------- cloning blocks into pages ---------------- */
  var STRIP = ['data-en', 'data-zh', 'data-flow', 'data-float', 'data-page', 'data-break', 'data-keep', 'data-split', 'data-run', 'data-run-en', 'data-run-zh', 'data-anchor', 'id'];
  function clean(node) {
    if (node.nodeType !== 1) return node;
    STRIP.forEach(function (a) { node.removeAttribute(a); });
    node.querySelectorAll('[data-en],[id]').forEach(function (n) { n.removeAttribute('data-en'); n.removeAttribute('data-zh'); n.removeAttribute('id'); });
    // pictures become buttons, so a tap enlarges them instead of turning the page
    node.querySelectorAll('img[data-lightbox]').forEach(function (img) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'zoom'; b.setAttribute('aria-label', 'Enlarge photograph');
      ['data-lightbox', 'data-full', 'data-caption'].forEach(function (a) {
        if (img.hasAttribute(a)) { b.setAttribute(a, img.getAttribute(a)); img.removeAttribute(a); }
      });
      img.parentNode.insertBefore(b, img); b.appendChild(img);
    });
    return node;
  }
  function overflowing(el) { return el.scrollHeight - el.clientHeight > 1; }

  /* Until a photograph has loaded the browser cannot size it, so the pages are measured with blank
     stand-ins of exactly the size each photograph will take (a srcset image is as wide as its `sizes`
     slot), then the real pictures go back in, lazily. */
  function slot(sizes) {
    var parts = (sizes || '').split(/,(?![^(]*\))/);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim(), m = part.match(/^(\(.*\))\s+(\S+)$/), len = part;
      if (m) { if (!window.matchMedia(m[1]).matches) continue; len = m[2]; }
      var n = parseFloat(len);
      if (/vw$/.test(len)) return n * window.innerWidth / 100;
      if (/px$/.test(len)) return n;
    }
    return 0;
  }
  function standIn(w, h) {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='" + w.toFixed(2) + "' height='" + h.toFixed(2) + "'%3E%3C/svg%3E";
  }
  function prepare(source) {
    var copy = source.cloneNode(true), waits = [];
    copy.querySelectorAll('img').forEach(function (img) {
      var w = +img.getAttribute('width'), h = +img.getAttribute('height');
      if (!w || !h) return;
      var nw = (img.hasAttribute('srcset') && slot(img.getAttribute('sizes'))) || w;
      img.setAttribute('data-src', img.getAttribute('src'));
      if (img.hasAttribute('srcset')) { img.setAttribute('data-srcset', img.getAttribute('srcset')); img.removeAttribute('srcset'); }
      img.removeAttribute('loading');
      img.src = standIn(nw, nw * h / w);
      if (img.decode) waits.push(img.decode().catch(function () {}));
    });
    return Promise.all(waits).then(function () { return copy; });
  }
  function restore(page) {
    page.querySelectorAll('img[data-src]').forEach(function (img) {
      img.loading = 'lazy';
      if (img.hasAttribute('data-srcset')) {
        // ask for the file that fits the picture as it is laid out on this page, not the slot in the HTML
        var w = Math.ceil(img.getBoundingClientRect().width);
        if (w > 0) img.sizes = w + 'px';
        img.srcset = img.getAttribute('data-srcset'); img.removeAttribute('data-srcset');
      }
      img.src = img.getAttribute('data-src');
      img.removeAttribute('data-src');
    });
  }

  function pageFrom(block) {
    // StPageFlip owns the page element's inline style (display, size, transforms), so the
    // layout lives on an inner box that fills it
    var el = document.createElement('div');
    el.className = 'pg';
    if (block.classList.contains('pg-cover')) el.classList.add('pg--cover');
    if (block.hasAttribute('data-nonum')) el.setAttribute('data-nonum', '');
    if (block.getAttribute('data-page') === 'hard') el.setAttribute('data-density', 'hard');
    var inner = clean(block.cloneNode(true));
    inner.removeAttribute('data-nonum');
    inner.classList.add('pg__in');
    el.appendChild(inner);
    measure.appendChild(el);
    // squeeze pictures a little if a composed page is too full (her own pages are placed, not composed)
    var f = 1;
    while (!block.classList.contains('pg-cv') && overflowing(inner) && f > 0.5) { f -= 0.06; inner.style.setProperty('--fit', f.toFixed(2)); }
    return el;
  }

  function paginate(source) {
    measure.innerHTML = '';
    measure.style.setProperty('--pw', geo.pw + 'px');
    measure.style.setProperty('--ph', geo.ph + 'px');
    measure.style.setProperty('--cvk', (geo.pw / 960).toFixed(4));
    var out = [], floats = [], cur = null, run = '';
    anchors = {};

    function open() {
      var el = document.createElement('div');
      el.className = 'pg pg--flow';
      el.innerHTML = '<div class="pg__in"><p class="pg__run"></p><div class="pg__body"></div><p class="pg__no"></p></div>';
      el.setAttribute('data-run', run);
      measure.appendChild(el);
      cur = { el: el, body: el.querySelector('.pg__body') };
    }
    function close() {
      if (cur) {
        if (cur.body.childNodes.length) out.push(cur.el); else cur.el.remove();
        cur = null;
      }
      while (floats.length) out.push(pageFrom(floats.shift()));
    }
    function used(body) {
      var last = body.lastElementChild;
      return last ? last.offsetTop + last.offsetHeight : 0;
    }
    function splitInto(block, text, isCont) {
      // place the largest head of the paragraph that still fits on this page; return the rest
      var cjk = !/\s/.test(text.trim());
      var tokens = cjk ? Array.from(text) : text.split(/(\s+)/);
      var probe = clean(block.cloneNode(false));
      if (isCont) probe.classList.add('is-cont');
      probe.classList.add('is-cut');
      cur.body.appendChild(probe);
      var lo = 1, hi = tokens.length, best = 0;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        probe.textContent = tokens.slice(0, mid).join('');
        if (overflowing(cur.body)) hi = mid - 1; else { best = mid; lo = mid + 1; }
      }
      if (best < (cjk ? 12 : 6)) { probe.remove(); return text; }
      probe.textContent = tokens.slice(0, best).join('').replace(/\s+$/, '');
      return tokens.slice(best).join('').replace(/^\s+/, '');
    }
    function place(block, isCont, text) {
      if (!cur) open();
      var el = clean(block.cloneNode(true));
      if (text != null) el.textContent = text;
      if (isCont) el.classList.add('is-cont');
      cur.body.appendChild(el);
      if (!overflowing(cur.body)) {
        if (block.hasAttribute('data-keep') && cur.body.childNodes.length > 1 &&
            cur.body.clientHeight - used(cur.body) < cur.body.clientHeight * 0.24) {
          // a heading (and the byline under it) goes over with the text it introduces
          var carry = [el], prev = el.previousElementSibling;
          while (prev && prev.__keep && prev.previousElementSibling) { carry.unshift(prev); prev = prev.previousElementSibling; }
          carry.forEach(function (n) { n.remove(); });
          close(); open();
          carry.forEach(function (n) { cur.body.appendChild(n); });
        }
        el.__keep = block.hasAttribute('data-keep');
        return;
      }
      el.remove();
      if (block.hasAttribute('data-split')) {
        var full = text != null ? text : block.textContent;
        var rest = splitInto(block, full, isCont);
        if (rest === full && !cur.body.childNodes.length) { cur.body.appendChild(el); return; }
        close(); open();
        if (rest) place(block, true, rest);
        return;
      }
      if (cur.body.childNodes.length) { close(); open(); }
      cur.body.appendChild(el);
    }

    Array.prototype.forEach.call(source.children, function (block) {
      // one page at a time on a phone: the plain endpapers would only be empty taps
      if (geo.phone && block.classList.contains('pg-endpaper')) return;
      var anchor = block.getAttribute('data-anchor');
      if (block.hasAttribute('data-page')) {
        close();
        if (anchor) anchors[anchor] = out.length;
        out.push(pageFrom(block));
        return;
      }
      if (block.hasAttribute('data-float')) {
        if (cur && cur.body.childNodes.length) floats.push(block);
        else { close(); out.push(pageFrom(block)); }
        return;
      }
      if (block.hasAttribute('data-run')) run = runOf(block);
      if (block.hasAttribute('data-break') && cur && cur.body.childNodes.length) close();
      if (!cur) open();
      if (block.hasAttribute('data-run')) cur.el.setAttribute('data-run', run);
      if (anchor) anchors[anchor] = out.length;
      place(block, false, null);
    });
    close();

    // a spread needs an even number of pages: the back cover must land on a left page
    if (out.length % 2 && !geo.phone) {
      var blank = document.createElement('div');
      blank.className = 'pg pg--blank';
      blank.innerHTML = '<div class="pg__in"></div>';
      out.splice(out.length - 1, 0, blank);
    }
    var TITLE = bookTitle();
    out.forEach(function (el, i) {
      var last = i === out.length - 1;
      el.classList.add(i === 0 || last ? 'pg--outside' : i % 2 ? 'pg--l' : 'pg--r');
      var no = el.querySelector('.pg__no');
      if (no && !el.hasAttribute('data-nonum')) no.textContent = String(i);
      var head = el.querySelector('.pg__run');
      if (head) head.textContent = i % 2 ? TITLE : (el.getAttribute('data-run') || TITLE);
    });
    if (geo.wide) fitText(out);
    return out;
  }

  /* ---------------- her text boxes ---------------- */
  /* Each box is set a little larger than her size, then eased down until the words fit inside it.
     Text of one size on one spread stays one size. Where the page is small enough that the words
     come out small, a tap on a passage opens it in a reading view. */
  var FIT0 = 1.08, FITMIN = 0.66, READ_BELOW = 13;
  function fitText(pages) {
    var boxes = [], least = {};
    pages.forEach(function (page, i) {
      page.querySelectorAll('.cv-txt').forEach(function (t) {
        if (t.offsetParent === null) return;            // the other language
        var f = FIT0;
        t.style.setProperty('--fit', f);
        while ((t.scrollHeight - t.clientHeight > 1 || t.scrollWidth - t.clientWidth > 1) && f > FITMIN) {
          f = Math.round((f - 0.02) * 100) / 100;
          t.style.setProperty('--fit', f);
        }
        var key = Math.floor((i + 1) / 2) + '|' + t.style.getPropertyValue('--s');
        least[key] = Math.min(key in least ? least[key] : 9, f);
        boxes.push({ t: t, key: key });
      });
    });
    boxes.forEach(function (b) {
      var t = b.t;
      t.style.setProperty('--fit', least[b.key]);
      if (parseFloat(getComputedStyle(t).fontSize) < READ_BELOW && t.textContent.length > 80) {
        var r = document.createElement('button');
        r.type = 'button'; r.className = 'cv-read'; r.setAttribute('aria-label', 'Read this passage in larger type');
        t.appendChild(r);
        root.classList.add('has-reader');
      }
    });
  }
  var reader = null;
  function openReader(t) {
    if (!window.LZ) return;
    if (!reader) {
      reader = document.createElement('div');
      reader.className = 'modal reader';
      reader.setAttribute('role', 'dialog');
      reader.setAttribute('aria-label', 'Reading view');
      reader.innerHTML = '<div class="reader__panel modal__panel"><div class="reader__text"></div></div>' +
        '<button class="modal__close" type="button" data-close aria-label="Close">×</button>';
      document.body.appendChild(reader);
    }
    var box = reader.querySelector('.reader__text');
    box.innerHTML = '';
    Array.prototype.forEach.call(t.children, function (c) {
      if (c.classList.contains('cv-read') || c.classList.contains('cv-gap') || c.offsetParent === null) return;
      box.appendChild(c.cloneNode(true));
    });
    reader.setAttribute('data-skin', skin);
    reader.querySelector('.reader__panel').scrollTop = 0;
    window.LZ.openModal(reader);
  }

  /* ---------------- the book itself ---------------- */
  function label(i) {
    if (i <= 0) return 'Cover';
    if (i >= total - 1) return 'Back cover';
    if (geo.phone) return i + ' / ' + (total - 2);
    var l = i % 2 ? i : i - 1;
    return l + '–' + Math.min(l + 1, total - 2) + ' / ' + (total - 2);
  }
  function wake(i) {
    if (!host) return;
    var pages = host.querySelectorAll('.pg');
    for (var k = Math.max(0, i - 2); k < Math.min(pages.length, i + 6); k++) {
      pages[k].querySelectorAll('img[loading="lazy"]').forEach(function (im) { im.loading = 'eager'; });
    }
  }
  function sync(i) {
    current = i;
    wake(i);
    if (curEl) curEl.textContent = label(i);
    if (prevBtn) prevBtn.disabled = i <= 0;
    if (nextBtn) nextBtn.disabled = i >= total - (geo.phone ? 1 : 2);
    var state = i <= 0 ? 'front' : (!geo.phone && i >= total - 1) || (geo.phone && i >= total - 1) ? 'back' : 'open';
    root.setAttribute('data-state', state);
    root.dispatchEvent(new CustomEvent('flip:page', { detail: { index: i, total: total } }));
  }

  var buildNo = 0;
  function build(keepRatio) {
    var no = ++buildNo, g = geometry();
    return prepare(g.wide ? wideSrc : src).then(function (copy) { if (no === buildNo) mount(copy, keepRatio, g); });
  }
  /* the arrows stand beside a wide book and under a narrow one; the language seal sits at the book's
     top right corner, or in the row of buttons under it on a phone */
  function arrange() {
    if (!nav) return;
    if (geo.wide) { stage.appendChild(prevBtn); stage.appendChild(nextBtn); }
    else { nav.insertBefore(prevBtn, curEl); nav.appendChild(nextBtn); }
    if (seal) { if (geo.phone) nav.appendChild(seal); else stage.appendChild(seal); }
    if (hint) hint.textContent = geo.wide
      ? (root.classList.contains('has-reader') ? 'Tap a photograph or a passage to see it larger' : 'Tap a photograph to see it larger')
      : geo.phone ? 'Swipe or tap the page to turn it' : 'Drag a corner or tap a page to turn it';
  }
  function mount(copy, keepRatio, g) {
    geo = g;
    root.style.setProperty('--pw', geo.pw + 'px');
    root.style.setProperty('--ph', geo.ph + 'px');
    root.style.setProperty('--cvk', (geo.pw / 960).toFixed(4));
    root.classList.toggle('is-phone', geo.phone);
    root.classList.toggle('is-wide', geo.wide);
    root.classList.remove('has-reader');
    var start = keepRatio != null ? keepRatio : 0;
    var pages = paginate(copy);
    arrange();
    pages.forEach(restore);
    total = pages.length;
    if (flip) { try { flip.destroy(); } catch (e) {} flip = null; }
    if (host) host.remove();
    host = document.createElement('div');
    host.className = 'flip-book';
    stage.appendChild(host);
    pages.forEach(function (p) { host.appendChild(p); });
    measure.innerHTML = '';
    var startPage = Math.max(0, Math.min(total - 1, Math.round(start * (total - 1))));
    if (!geo.phone && startPage > 0 && startPage < total - 1 && startPage % 2 === 0) startPage -= 1;
    flip = new window.St.PageFlip(host, {
      width: geo.pw, height: geo.ph, size: 'fixed', autoSize: true,
      showCover: true, usePortrait: geo.phone, startPage: startPage,
      drawShadow: true, maxShadowOpacity: 0.38, flippingTime: reduce ? 300 : 900,
      mobileScrollSupport: true, swipeDistance: 24, showPageCorners: !geo.phone, disableFlipByClick: false
    });
    flip.on('flip', function (e) { sync(e.data); });
    flip.on('changeState', function (e) { root.classList.toggle('is-turning', e.data === 'flipping' || e.data === 'user_fold'); });
    flip.loadFromHTML(pages);
    doc.classList.remove('flip-failed');
    doc.classList.add('flip-on');
    sync(startPage);
  }

  function go(anchor) {
    if (!(anchor in anchors) || !flip) return;
    var i = anchors[anchor];
    if (!geo.phone && i % 2 === 0 && i > 0) i -= 1;
    flip.flip(i);
  }

  if (prevBtn) prevBtn.addEventListener('click', function () { if (flip) flip.flipPrev(); });
  if (nextBtn) nextBtn.addEventListener('click', function () { if (flip) flip.flipNext(); });
  document.addEventListener('keydown', function (e) {
    if (!flip || document.querySelector('.modal[data-open]') || doc.classList.contains('intro-on')) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); flip.flipNext(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); flip.flipPrev(); }
  });
  root.addEventListener('click', function (e) {
    var a = e.target.closest('[data-flip-go]');
    if (a) { e.preventDefault(); go(a.getAttribute('data-flip-go')); return; }
    var r = e.target.closest('.cv-read');
    if (r) { e.preventDefault(); openReader(r.parentNode); }
  });
  function fail(err) {
    // leave the readable long page in place
    doc.classList.remove('flip-on');
    doc.classList.add('flip-failed');
    if (window.console) console.error(err);
  }
  document.addEventListener('lz:lang', function () { build(total > 1 ? current / (total - 1) : 0).catch(fail); });

  var rt = 0, lastW = window.innerWidth, lastH = window.innerHeight;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var g = geometry();
      if (Math.abs(g.pw - geo.pw) < 6 && Math.abs(g.ph - geo.ph) < 6 && g.phone === geo.phone && g.wide === geo.wide) return;
      if (Math.abs(window.innerWidth - lastW) < 2 && Math.abs(window.innerHeight - lastH) < 90) return;  // phone toolbars
      lastW = window.innerWidth; lastH = window.innerHeight;
      build(total > 1 ? current / (total - 1) : 0).catch(fail);
    }, 250);
  });

  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () { return build(0); }).catch(fail);
  window.__flip = { get book() { return flip; }, get total() { return total; }, get anchors() { return anchors; } };
})();
