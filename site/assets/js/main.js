/**
 * Northbeam — main.js
 * Vanilla JS, ES2020+, no dependencies.
 * Progressive enhancement over the data-component renderers in components.js.
 */

(() => {
  'use strict';

  const doc = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ready = (fn) => {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  };

  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  // ---------- Mobile Navigation ----------
  const initMobileNav = () => {
    const toggle = $('[data-nav-toggle]');
    const drawer = $('[data-nav-drawer]');
    if (!toggle || !drawer) return;

    const close = () => {
      toggle.setAttribute('aria-expanded', 'false');
      drawer.setAttribute('data-open', 'false');
      doc.style.overflow = '';
      toggle.focus();
    };
    const open = () => {
      toggle.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('data-open', 'true');
      doc.style.overflow = 'hidden';
      const first = $('a, button', drawer);
      if (first) first.focus();
    };

    on(toggle, 'click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      expanded ? close() : open();
    });

    on(drawer, 'click', (e) => {
      if (e.target.matches('a')) close();
    });

    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') close();
    });

    // Close on resize to desktop
    on(window, 'resize', () => {
      if (window.innerWidth > 860 && toggle.getAttribute('aria-expanded') === 'true') close();
    }, { passive: true });
  };

  // ---------- Sticky Header ----------
  const initStickyHeader = () => {
    const header = $('[data-component="header"]');
    if (!header) return;
    let lastY = 0;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      if (y > 8) header.setAttribute('data-scrolled', 'true');
      else header.removeAttribute('data-scrolled');
      lastY = y;
      ticking = false;
    };

    on(window, 'scroll', () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  };

  // ---------- Smooth Scrolling ----------
  const initSmoothScroll = () => {
    on(document, 'click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const headerH = ($('[data-component="header"]')?.offsetHeight) || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerH - 12;
      window.scrollTo({
        top,
        behavior: reduceMotion ? 'auto' : 'smooth'
      });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  };

  // ---------- FAQ Accordion (native <details>, enhanced) ----------
  const initFAQ = () => {
    const items = $$('.faq-item');
    if (!items.length) return;

    items.forEach((item) => {
      const summary = $('summary', item);
      if (!summary) return;

      on(summary, 'click', (e) => {
        // Native <details> handles open/close; we just add analytics + animation hint.
        if (!reduceMotion) {
          const answer = $('.faq-answer', item);
          if (answer && !item.open) {
            answer.style.opacity = '0';
            requestAnimationFrame(() => {
              answer.style.transition = 'opacity .25s ease';
              answer.style.opacity = '1';
              setTimeout(() => { answer.style.transition = ''; }, 300);
            });
          }
        }
      });
    });
  };

  // ---------- Scroll Reveal ----------
  const initScrollReveal = () => {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      $$('[data-reveal]').forEach((el) => el.removeAttribute('data-reveal'));
      return;
    }

    const targets = $$('[data-reveal]');
    if (!targets.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    targets.forEach((el) => io.observe(el));
  };

  // ---------- Lazy Loading (images + iframes) ----------
  const initLazyLoad = () => {
    if (!('IntersectionObserver' in window)) {
      $$('img[data-src], iframe[data-src]').forEach((el) => {
        if (el.dataset.src) el.src = el.dataset.src;
      });
      return;
    }

    const setSrc = (el) => {
      const src = el.dataset.src;
      const srcset = el.dataset.srcset;
      if (src) el.src = src;
      if (srcset) el.srcset = srcset;
      el.removeAttribute('data-src');
      el.removeAttribute('data-srcset');
      el.classList.add('is-loaded');
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setSrc(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '200px 0px' });

    $$('img[data-src], iframe[data-src]').forEach((el) => io.observe(el));
  };

  // ---------- CTA Interactions ----------
  const initCTA = () => {
    // Soft "active" press state for buttons (visual only)
    on(document, 'pointerdown', (e) => {
      const btn = e.target.closest('.btn');
      if (btn) btn.classList.add('is-pressed');
    }, { passive: true });

    on(document, 'pointerup', () => {
      $$('.btn.is-pressed').forEach((b) => b.classList.remove('is-pressed'));
    });
    on(document, 'pointercancel', () => {
      $$('.btn.is-pressed').forEach((b) => b.classList.remove('is-pressed'));
    });

    // Lightweight, anonymous interaction tracking for primary CTAs
    $$('[data-cta]').forEach((btn) => {
      on(btn, 'click', () => {
        const data = {
          id: btn.dataset.cta,
          label: (btn.textContent || '').trim().slice(0, 60),
          href: btn.getAttribute('href') || '',
          ts: Date.now()
        };
        try {
          const q = (window.northbeamQueue = window.northbeamQueue || []);
          q.push(['ctaClick', data]);
        } catch (_) { /* no-op */ }
      });
    });
  };

  // ---------- Accessibility Enhancements ----------
  const initA11y = () => {
    // Auto-label icon-only buttons if no aria-label
    $$('button, a').forEach((el) => {
      if (!el.hasAttribute('aria-label') && !el.textContent.trim()) {
        const icon = el.querySelector('[data-icon-name]');
        if (icon) el.setAttribute('aria-label', icon.dataset.iconName);
      }
    });

    // External link safety
    $$('a[href^="http"]').forEach((a) => {
      if (a.host !== location.host) {
        a.setAttribute('rel', (a.getAttribute('rel') || '') + ' noopener noreferrer'.trim());
        a.setAttribute('target', '_blank');
      }
    });

    // Focus-visible polyfill helper (class-based)
    on(document, 'keydown', (e) => {
      if (e.key === 'Tab') doc.classList.add('using-keyboard');
    });
    on(document, 'mousedown', () => doc.classList.remove('using-keyboard'));
  };

  // ---------- Bootstrap ----------
  ready(() => {
    initMobileNav();
    initStickyHeader();
    initSmoothScroll();
    initFAQ();
    initScrollReveal();
    initLazyLoad();
    initCTA();
    initA11y();
  });
})();
