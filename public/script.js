(function () {
  "use strict";

  var nav = document.querySelector(".site-nav");
  var menuButton = document.querySelector(".menu-toggle");
  var menu = document.querySelector(".nav-menu");
  var menuLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-menu a"));
  var revealItems = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function updateNav() {
    if (!nav) return;
    nav.classList.toggle("scrolled", window.scrollY > 24);
  }

  function closeMenu() {
    if (!menu || !menuButton) return;
    menu.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "메뉴 열기");
    nav.classList.remove("open");
    document.body.classList.remove("menu-open");
  }

  function toggleMenu() {
    if (!menu || !menuButton) return;
    var shouldOpen = menuButton.getAttribute("aria-expanded") !== "true";
    menu.classList.toggle("open", shouldOpen);
    menuButton.setAttribute("aria-expanded", String(shouldOpen));
    menuButton.setAttribute("aria-label", shouldOpen ? "메뉴 닫기" : "메뉴 열기");
    nav.classList.toggle("open", shouldOpen);
    document.body.classList.toggle("menu-open", shouldOpen);
  }

  updateNav();
  window.addEventListener("scroll", updateNav, { passive: true });

  if (menuButton) {
    menuButton.addEventListener("click", toggleMenu);
  }

  menuLinks.forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 820) closeMenu();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeMenu();
  });

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(function (item) {
      item.classList.add("show");
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var siblings = Array.prototype.slice.call(
            entry.target.parentElement.querySelectorAll(":scope > [data-reveal]")
          );
          var index = siblings.indexOf(entry.target);
          entry.target.style.animationDelay = Math.min(Math.max(index, 0) * 70, 280) + "ms";
          entry.target.classList.add("show");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  }

  if ("IntersectionObserver" in window) {
    var trackedSections = Array.prototype.slice.call(
      document.querySelectorAll("#products, #erp, #approach, #contact")
    );
    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          menuLinks.forEach(function (link) {
            link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
          });
        });
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 }
    );

    trackedSections.forEach(function (section) {
      sectionObserver.observe(section);
    });
  }

  document.querySelectorAll("[data-year]").forEach(function (element) {
    element.textContent = String(new Date().getFullYear());
  });
})();
