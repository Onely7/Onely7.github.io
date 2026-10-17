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

// Highlight the section currently being read in the sidebar table of contents
(() => {
  const links = Array.from(document.querySelectorAll('.toc-list a[href^="#"]'));
  if (!links.length) return;
  const items = links
    .map((a) => ({ link: a, section: document.getElementById(a.getAttribute('href').slice(1)) }))
    .filter((x) => x.section);
  if (!items.length) return;

  let active = null;
  const setActive = (item) => {
    if (item === active) return;
    if (active) {
      active.link.classList.remove('is-active');
      active.link.removeAttribute('aria-current');
    }
    active = item;
    if (active) {
      active.link.classList.add('is-active');
      active.link.setAttribute('aria-current', 'true');
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
    item.link.addEventListener('click', () => {
      setActive(item);
      locked = true;
      clearTimeout(lockTimer);
      lockTimer = setTimeout(unlock, 1200);
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
