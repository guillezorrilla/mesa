(() => {
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nav = $('#nav');
  addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), {
    passive: true,
  });

  // hero viewer: auto-advancing tabs
  const viewer = $('#viewer'),
    imgs = $$('#vstage img'),
    tabs = $$('.vtab'),
    DUR = 7000;
  let cur = 0,
    timer;
  viewer.style.setProperty('--dur', `${DUR}ms`);
  function show(i, focus) {
    cur = i;
    imgs.forEach((im, j) => {
      im.classList.toggle('on', j === i);
    });
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', j === i);
      t.tabIndex = j === i ? 0 : -1;
      const b = t.querySelector('i');
      b.replaceWith(b.cloneNode());
    });
    if (focus) tabs[i].focus();
    clearTimeout(timer);
    if (!reduce) timer = setTimeout(() => show((cur + 1) % imgs.length), DUR);
  }
  for (const [i, t] of tabs.entries()) t.addEventListener('click', () => show(i));
  $('.vtabs').addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (d) {
      e.preventDefault();
      show((cur + d + tabs.length) % tabs.length, true);
    }
  });
  viewer.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    viewer.classList.add('paused');
  });
  viewer.addEventListener('mouseleave', () => {
    viewer.classList.remove('paused');
    show(cur);
  });
  show(0);

  // workday list
  const items = $$('.witem'),
    wimg = $('#wimg');
  function pick(i, focus) {
    items.forEach((b, j) => {
      b.setAttribute('aria-selected', j === i);
      b.tabIndex = j === i ? 0 : -1;
    });
    wimg.style.opacity = 0;
    setTimeout(
      () => {
        wimg.src = items[i].dataset.img;
        wimg.alt = items[i].dataset.alt;
        wimg.style.opacity = 1;
      },
      reduce ? 0 : 180,
    );
    if (focus) items[i].focus();
  }
  wimg.style.transition = 'opacity .25s ease';
  for (const [i, b] of items.entries()) b.addEventListener('click', () => pick(i));
  $('.wlist').addEventListener('keydown', (e) => {
    const d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = items.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    pick((i + d + items.length) % items.length, true);
  });
  items.forEach((b, i) => {
    b.tabIndex = i === 0 ? 0 : -1;
  });

  // reveal on scroll, bars fill
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
        if (e.target.hasAttribute('data-bars'))
          $$('.track i', e.target).forEach((i) => {
            i.style.width = `${i.dataset.w}%`;
          });
      }),
    { threshold: 0, rootMargin: '0px 0px -40px 0px' },
  );
  $$('.rv').forEach((el) => {
    io.observe(el);
  });

  $('#copy').addEventListener('click', async (e) => {
    const b = e.currentTarget,
      el = $('#cmd');
    try {
      await navigator.clipboard.writeText(el.textContent);
      b.textContent = 'Copied';
    } catch {
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      b.textContent = 'Press Cmd+C';
    }
    setTimeout(() => {
      b.textContent = 'Copy';
    }, 1800);
  });
})();
