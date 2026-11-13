/* Shared behaviour: modals, the lightbox, the language seal, year tabs and the film player. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- modal shell ---------- */
  let lastFocus = null;
  function openModal(el) {
    lastFocus = document.activeElement;
    el.setAttribute('data-open', '');
    document.documentElement.style.overflow = 'hidden';
    const f = $('[data-close], button, [href]', el);
    if (f) f.focus({ preventScroll: true });
  }
  function closeModal(el) {
    if (!el || !el.hasAttribute('data-open')) return;
    el.removeAttribute('data-open');
    document.documentElement.style.overflow = '';
    $$('video', el).forEach(v => v.pause());
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) { closeModal(closer.closest('.modal')); return; }
    const m = e.target.closest('.modal');
    if (m && (e.target === m || e.target.classList.contains('lightbox__panel'))) closeModal(m);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.modal[data-open]').forEach(closeModal);
  });
  window.LZ = { openModal, closeModal };

  /* ---------- lightbox (delegated, so pictures inside turned pages work too) ---------- */
  if ($('[data-lightbox]')) {
    const lb = document.createElement('div');
    lb.className = 'modal lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-label', 'Photograph');
    lb.innerHTML = '<figure class="lightbox__panel modal__panel"><img class="lightbox__img" alt=""><figcaption class="lightbox__cap"></figcaption></figure>' +
      '<button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="Previous photograph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg></button>' +
      '<button class="lightbox__nav lightbox__nav--next" type="button" aria-label="Next photograph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg></button>' +
      '<div class="lightbox__foot"><p class="lightbox__count" aria-live="polite"></p><div class="lightbox__dots" aria-hidden="true"></div></div>' +
      '<button class="modal__close" type="button" data-close aria-label="Close">×</button>';
    document.body.appendChild(lb);
    const img = $('.lightbox__img', lb), cap = $('.lightbox__cap', lb), count = $('.lightbox__count', lb);
    const prev = $('.lightbox__nav--prev', lb), next = $('.lightbox__nav--next', lb), dots = $('.lightbox__dots', lb);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let group = [], idx = 0;
    const full = el => el.getAttribute('data-full') || el.currentSrc || el.src;
    const gather = (g) => {
      const flipOn = document.documentElement.classList.contains('flip-on'), seen = new Set(), list = [];
      $$('[data-lightbox]').forEach(x => {
        if (x.getAttribute('data-lightbox') !== g) return;
        if (flipOn && x.closest('[data-flip-src], [data-flip-wide]')) return;
        const u = full(x);
        if (!u || seen.has(u)) return;
        seen.add(u); list.push(x);
      });
      return list;
    };
    /* dir: 1 when moving on, -1 when going back; the new photograph slides in from that side */
    function show(i, dir) {
      idx = (i + group.length) % group.length;
      const el = group[idx];
      img.src = full(el);
      img.alt = el.alt || (el.querySelector('img') ? el.querySelector('img').alt : '') || '';
      cap.textContent = el.getAttribute('data-caption') || '';
      cap.hidden = !cap.textContent;
      const many = group.length > 1;
      prev.hidden = next.hidden = count.hidden = !many;
      count.textContent = (idx + 1) + ' / ' + group.length;
      dots.hidden = !many || group.length > 15;
      if (!dots.hidden) dots.innerHTML = group.map((_, k) => k === idx ? '<span class="is-on"></span>' : '<span></span>').join('');
      if (many) [idx + 1, idx - 1].forEach(j => { const p = new Image(); p.src = full(group[(j + group.length) % group.length]); });
      if (dir && !still.matches && img.animate) {
        img.animate([{ transform: 'translateX(' + (dir * 56) + 'px)', opacity: .3 }, { transform: 'none', opacity: 1 }],
          { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      }
    }
    function openFrom(el) {
      group = gather(el.getAttribute('data-lightbox'));
      const u = full(el);
      show(Math.max(0, group.findIndex(x => full(x) === u)));
      openModal(lb);
    }
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-lightbox]');
      if (!el || lb.contains(el)) return;
      e.preventDefault();
      openFrom(el);
    });
    $$('img[data-lightbox]').forEach(el => {
      if (el.closest('button, a')) return;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFrom(el); } });
    });
    prev.addEventListener('click', () => show(idx - 1, -1));
    next.addEventListener('click', () => show(idx + 1, 1));
    document.addEventListener('keydown', (e) => {
      if (!lb.hasAttribute('data-open') || group.length < 2) return;
      if (e.key === 'ArrowLeft') show(idx - 1, -1);
      if (e.key === 'ArrowRight') show(idx + 1, 1);
    });
    /* the photograph follows the finger; let go past a short distance and the next one slides in */
    let sx = 0, sy = 0, dx = 0, drag = false, axis = '';
    lb.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || group.length < 2) { drag = false; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; axis = ''; drag = true;
    }, { passive: true });
    lb.addEventListener('touchmove', e => {
      if (!drag || e.touches.length !== 1) return;
      const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
      if (!axis && (Math.abs(mx) > 8 || Math.abs(my) > 8)) axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (axis !== 'x') return;
      dx = mx;
      img.style.transform = 'translateX(' + dx + 'px)';
    }, { passive: true });
    lb.addEventListener('touchend', () => {
      if (!drag) return;
      drag = false;
      img.style.transform = '';
      if (axis !== 'x') return;
      if (Math.abs(dx) > 50) show(dx < 0 ? idx + 1 : idx - 1, dx < 0 ? 1 : -1);
      else if (dx && img.animate) img.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }, { passive: true });
  }

  /* ---------- language seal (elements carry data-en / data-zh) ---------- */
  const langBtn = $('[data-lang-toggle]');
  if (langBtn) {
    const seal = $('[data-seal]', langBtn);
    let lang = 'en';
    try { lang = localStorage.getItem('lz-lang') || 'en'; } catch (e) {}
    const apply = () => {
      $$('[data-en]').forEach(el => { const v = el.getAttribute('data-' + lang); if (v) el.textContent = v; });
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      langBtn.setAttribute('aria-pressed', String(lang === 'zh'));
      langBtn.setAttribute('aria-label', lang === 'zh' ? 'Read in English' : 'Read in Chinese');
      if (seal) seal.textContent = lang === 'zh' ? 'EN' : '中';
    };
    langBtn.addEventListener('click', () => {
      lang = lang === 'en' ? 'zh' : 'en';
      try { localStorage.setItem('lz-lang', lang); } catch (e) {}
      document.body.classList.add('is-switching');
      setTimeout(() => {
        apply();
        document.body.classList.remove('is-switching');
        document.dispatchEvent(new CustomEvent('lz:lang', { detail: { lang } }));
      }, 180);
    });
    apply();
  }

  /* ---------- tabs (photography years) ---------- */
  $$('[role="tablist"]').forEach(list => {
    const tabs = $$('[role="tab"]', list);
    const select = (t) => tabs.forEach(x => {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(x.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    tabs.forEach((t, i) => {
      t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1;
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        select(n); n.focus();
      });
    });
  });

  /* ---------- diary ribbons: the bookmark for the stage of life in view stands out ---------- */
  const ribbons = $$('.ribbon');
  if (ribbons.length && 'IntersectionObserver' in window) {
    const byId = {};
    ribbons.forEach(r => { byId[r.getAttribute('href').slice(1)] = r; });
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        ribbons.forEach(r => r.removeAttribute('aria-current'));
        const r = byId[en.target.id];
        if (!r) return;
        r.setAttribute('aria-current', 'true');
        // in the row of bookmarks on a narrow screen, keep the current one in sight
        const row = r.parentElement;
        if (row && row.scrollWidth > row.clientWidth + 2) row.scrollTo({ left: r.offsetLeft - 24, behavior: 'smooth' });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(id => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- film player: anything carrying data-film plays that film, its notes below ---------- */
  const player = $('.modal--film');
  if (player) {
    const video = $('video', player), title = $('.film-player__title', player), meta = $('.film-player__meta', player), text = $('.film-player__text', player);
    const play = (el) => {
      const d = el.dataset;
      video.src = d.video; video.poster = d.poster;
      title.textContent = d.title; meta.textContent = d.date || '';
      const tpl = document.getElementById('film-text-' + d.film) || $('template', el);
      text.innerHTML = tpl ? tpl.innerHTML : '';
      openModal(player);
      video.play().catch(() => {});
      history.replaceState(null, '', '#' + d.film);
    };
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-film]');
      if (!el || player.contains(el)) return;
      e.preventDefault();
      play(el);
    });
    const clearHash = () => { if (location.hash) history.replaceState(null, '', location.pathname + location.search); };
    player.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === player) clearHash(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearHash(); });
    if (location.hash) { const r = $('[data-film="' + location.hash.slice(1) + '"]'); if (r) play(r); }
  }
})();
