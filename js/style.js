// Copy e-mail address to clipboard and show a short notification
(() => {
  const btn = document.getElementById('email-button'); // Button element acquisition
  const emailEl = document.getElementById('email-text'); // text acquisition
  const toast = document.getElementById('toast');
  if (!btn || !emailEl) return;

  const email = emailEl.textContent.trim();
  let timer;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('is-visible'), 3000);
  };

  btn.addEventListener('click', async () => {
    // After clicking the button, write (=copy) the text to the clipboard
    try {
      await navigator.clipboard.writeText(email);
      showToast(`${btn.dataset.copied || 'Copied:'} ${email}`);
    } catch (e) {
      // e.g. clipboard API unavailable: show the address instead
      showToast(`${btn.dataset.failed || 'Email:'} ${email}`);
    }
  });
})();

// Top bar (tablets and phones): the menu button opens a drawer with the table
// of contents and the site links; the name appears in the bar once the name on
// the cover has scrolled under it. Without JavaScript the bar shows the name
// and no menu.
(() => {
  const bar = document.getElementById('topbar');
  if (!bar) return;
  const row = bar.querySelector('.topbar-bar');
  const toggle = bar.querySelector('.topbar-toggle');
  const menu = document.getElementById('topbar-menu');
  const scrim = document.querySelector('.topbar-scrim');
  const coverName = document.querySelector('.profile-name');
  if (!row || !toggle || !menu) return;

  const isOpen = () => bar.classList.contains('is-open');
  const setOpen = (open) => {
    bar.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    // the page does not scroll behind the open drawer
    document.documentElement.classList.toggle('menu-open', open);
  };
  toggle.hidden = false;
  toggle.addEventListener('click', () => setOpen(!isOpen()));
  // a link in the bar or the menu closes the menu (the page then scrolls)
  bar.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  if (scrim) scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });
  // keyboard: moving the focus out of the bar closes the menu
  bar.addEventListener('focusout', (e) => {
    if (isOpen() && e.relatedTarget && !bar.contains(e.relatedTarget)) setOpen(false);
  });
  // the desktop layout has no top bar
  const wide = window.matchMedia('(min-width: 961px)');
  const onWide = () => {
    if (wide.matches) setOpen(false);
  };
  if (wide.addEventListener) wide.addEventListener('change', onWide);
  else if (wide.addListener) wide.addListener(onWide);

  // .is-scrolled: a hairline below the bar; .has-title: the name in the bar
  const update = () => {
    if (wide.matches) return; // the bar is hidden
    bar.classList.toggle('is-scrolled', window.scrollY > 2);
    const below = row.getBoundingClientRect().bottom;
    bar.classList.toggle('has-title', !coverName || coverName.getBoundingClientRect().bottom <= below);
  };
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();

// Light and dark themes: the theme button (in the corner of the sidebar on
// desktop, in the top bar on tablets and phones) switches from one to the
// other and keeps the choice in localStorage, where the script in <head>
// finds it on the next visit (window.setTheme there puts data-theme on
// <html>). Until a choice is made the theme follows the OS setting. The page
// fades from one theme to the other where the browser can (View Transitions),
// at once with reduced motion.
(() => {
  const buttons = Array.from(document.querySelectorAll('.theme-toggle'));
  if (!buttons.length || !window.setTheme) return;
  const root = document.documentElement;
  // the theme in use, from the style sheet (--dark: 1 in the dark theme)
  const isDark = () => getComputedStyle(root).getPropertyValue('--dark').trim() === '1';
  // the label says what a click does
  const label = () => {
    const dark = isDark();
    buttons.forEach((b) => {
      const text = (dark ? b.dataset.labelLight : b.dataset.labelDark) || '';
      b.setAttribute('aria-label', text);
      b.title = text;
    });
  };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  // the theme asked for by a click whose change has not been made yet (a
  // fade starts on the next frame): a quick second click goes back
  let asked = null;
  buttons.forEach((b) => {
    b.hidden = false;
    b.addEventListener('click', () => {
      const next = (asked || (isDark() ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark';
      asked = next;
      try {
        localStorage.setItem('portfolio-theme', next);
      } catch (e) {
        // no storage (blocked): the choice lasts until the page is left
      }
      const go = () => {
        window.setTheme(next);
        if (asked === next) asked = null;
        label();
      };
      if (document.startViewTransition && !reduce.matches) document.startViewTransition(go);
      else go();
    });
  });
  // the OS setting changed (it decides until a choice is made)
  const os = window.matchMedia('(prefers-color-scheme: dark)');
  if (os.addEventListener) os.addEventListener('change', label);
  else if (os.addListener) os.addListener(label);
  label();
})();

// Highlight the section currently being read in the table of contents
// (in the sidebar on desktop, in the menu of the top bar on tablets and phones)
(() => {
  const links = Array.from(document.querySelectorAll('.toc-list a[href^="#"]'));
  if (!links.length) return;
  // one entry per section, with its links in every table of contents
  const items = [];
  links.forEach((a) => {
    const id = a.getAttribute('href').slice(1);
    let item = items.find((x) => x.id === id);
    if (!item) {
      const section = document.getElementById(id);
      if (!section) return;
      item = { id, section, links: [] };
      items.push(item);
    }
    item.links.push(a);
  });
  if (!items.length) return;

  let active = null;
  const setActive = (item) => {
    if (item === active) return;
    if (active) {
      active.links.forEach((a) => {
        a.classList.remove('is-active');
        a.removeAttribute('aria-current');
      });
    }
    active = item;
    if (active) {
      active.links.forEach((a) => {
        a.classList.add('is-active');
        a.setAttribute('aria-current', 'true');
      });
    }
  };

  // While the page scrolls to a clicked entry, keep that entry highlighted
  let locked = false;
  let lockTimer;
  const unlock = () => {
    locked = false;
    clearTimeout(lockTimer);
  };
  items.forEach((item) => {
    item.links.forEach((a) => {
      a.addEventListener('click', () => {
        setActive(item);
        locked = true;
        clearTimeout(lockTimer);
        lockTimer = setTimeout(unlock, 1200);
      });
    });
  });
  window.addEventListener('scrollend', () => {
    if (locked) unlock();
  });

  const update = () => {
    if (locked) return;
    const threshold = 120; // px from the top of the window
    const atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let current = null;
    if (atBottom) {
      current = items[items.length - 1];
    } else {
      for (const item of items) {
        if (item.section.getBoundingClientRect().top <= threshold) current = item;
        else break;
      }
    }
    setActive(current);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();

// Publications: filter buttons (show one kind only) and a search box for
// titles and authors. Without JavaScript the tools stay hidden and every
// publication is shown.
(() => {
  const tools = document.getElementById('pub-tools');
  const input = document.getElementById('pub-search');
  const status = document.getElementById('pub-status');
  const empty = document.getElementById('pub-empty');
  if (!tools || !input || !status || !empty) return;
  const buttons = Array.from(tools.querySelectorAll('.filter-btn'));
  const clearButton = tools.querySelector('.search-clear');
  const resetButton = empty.querySelector('.pub-reset');
  const groups = Array.from(document.querySelectorAll('.pub-group')).map((el) => ({
    el,
    id: el.dataset.group,
    count: el.querySelector('.subsection-title .count'),
  }));

  // NFKC: full-width letters and digits match their ASCII forms
  const normalize = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const pubs = [];
  groups.forEach((group) => {
    group.el.querySelectorAll('.pub').forEach((el) => {
      const text = normalize(
        ['.pub-tag', '.pub-title', '.pub-authors']
          .map((sel) => el.querySelector(sel))
          .filter(Boolean)
          .map((x) => x.textContent)
          .join(' ')
      );
      // `compact` lets "塩野大輝" match "塩野 大輝"
      pubs.push({ el, group, text, compact: text.replace(/ /g, '') });
    });
  });
  const total = pubs.length;
  let filter = 'all';

  const apply = () => {
    const query = normalize(input.value);
    const terms = query ? query.split(' ') : [];
    const hits = { all: 0 };
    groups.forEach((group) => {
      hits[group.id] = 0;
    });
    pubs.forEach((pub) => {
      // every word of the query has to appear in the venue, title or authors
      pub.match = terms.every((t) => pub.text.includes(t) || pub.compact.includes(t));
      if (pub.match) {
        hits.all += 1;
        hits[pub.group.id] += 1;
      }
    });
    // a kind or a paper that comes back rises in briefly (css: .is-entering)
    groups.forEach((group) => {
      const show = (filter === 'all' || filter === group.id) && hits[group.id] > 0;
      group.entering = show && group.el.hidden;
      if (group.entering) group.el.classList.add('is-entering');
      group.el.hidden = !show;
      if (group.count) group.count.textContent = hits[group.id];
    });
    let shown = 0;
    pubs.forEach((pub) => {
      const visible = pub.match && (filter === 'all' || filter === pub.group.id);
      if (visible && pub.el.hidden && !pub.group.entering) pub.el.classList.add('is-entering');
      pub.el.hidden = !visible;
      if (visible) shown += 1;
    });
    buttons.forEach((button) => {
      const id = button.dataset.filter;
      button.setAttribute('aria-pressed', String(id === filter));
      const count = button.querySelector('.filter-count');
      if (count) count.textContent = hits[id];
      button.classList.toggle('is-empty', hits[id] === 0);
    });
    if (clearButton) clearButton.hidden = !input.value;
    empty.hidden = shown > 0;
    const filtered = terms.length > 0 || filter !== 'all';
    status.textContent = filtered
      ? (tools.dataset.status || '{shown} / {total}')
          .replace('{shown}', shown)
          .replace('{total}', total)
      : '';
  };

  tools.closest('section').addEventListener('animationend', (e) => {
    e.target.classList.remove('is-entering');
  });

  const reset = () => {
    input.value = '';
    filter = 'all';
    apply();
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.filter;
      apply();
    });
  });
  input.addEventListener('input', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      input.value = '';
      apply();
    }
  });
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      input.value = '';
      apply();
      input.focus();
    });
  }
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      reset();
      input.focus();
    });
  }
  // a link to a publication heading that is hidden by the filter shows everything again
  window.addEventListener('hashchange', () => {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target && target.closest('.pub-group[hidden], .pub[hidden]')) {
      reset();
      target.scrollIntoView();
    }
  });

  tools.hidden = false;
  apply(); // the browser may have restored a query
})();
