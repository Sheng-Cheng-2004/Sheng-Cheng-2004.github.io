"use strict";

(() => {
  const hero = document.querySelector('.about-page .hero, .research-page #research');
  const about = document.querySelector('#about, #projects');
  const panel = document.querySelector('.about-panel, #projects');
  const navbar = document.querySelector('.navbar');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!hero || !about || !panel || motion.matches || !('IntersectionObserver' in window)) return;
  const motionClass = document.body.classList.contains('research-page') ? 'research-motion' : 'home-motion';

  const timeline = about.querySelector('.education-timeline');
  const education = [...about.querySelectorAll('.education-item')];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      if (entry.target === timeline) {
        education.forEach((item, index) => {
          item.style.transitionDelay = `${180 + index * 280}ms`;
          item.classList.add('is-visible');
        });
      }
      observer.unobserve(entry.target);
    });
  }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });

  document.body.classList.add(motionClass);
  observer.observe(about);
  if (timeline) observer.observe(timeline);

  let scheduled = false;
  const updateIntro = () => {
    const navHeight = navbar ? navbar.offsetHeight : 65;
    document.body.style.setProperty('--nav-height', `${navHeight}px`);
    const viewport = Math.max(1, window.innerHeight - navHeight);
    const panelTop = panel.getBoundingClientRect().top - navHeight;
    const progress = Math.max(0, Math.min(1, (viewport - panelTop) / (viewport * 0.75)));
    hero.style.setProperty('--intro-opacity', String(1 - progress));
    panel.style.setProperty('--panel-opacity', String(Math.min(1, progress * 1.5)));
    hero.inert = progress === 1;
    scheduled = false;
  };
  const scheduleUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateIntro);
  };
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('pageshow', scheduleUpdate);
  motion.addEventListener('change', () => {
    if (motion.matches) {
      document.body.classList.remove(motionClass);
      hero.inert = false;
      observer.disconnect();
    }
  });
  updateIntro();
})();
