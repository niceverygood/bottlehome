/* Scroll-reveal for [data-reveal] elements.
   Elements start hidden (via `html.js [data-reveal]` in CSS) and reveal
   when they scroll into view. If IntersectionObserver is unavailable,
   everything is revealed immediately so nothing stays stuck-hidden. */
(function () {
  var els = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  if (!els.length) return;

  var revealAll = function () {
    els.forEach(function (el) { el.classList.add("revealed"); });
  };

  if (!("IntersectionObserver" in window)) {
    revealAll();
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
  );

  els.forEach(function (el) { io.observe(el); });
})();
