"use strict";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!reduceMotion.matches) {
  document.documentElement.classList.add("page-ready");

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname === window.location.pathname || url.hash) return;

    event.preventDefault();
    document.documentElement.classList.add("page-leaving");
    window.setTimeout(() => { window.location.href = link.href; }, 140);
  });
}
