(function () {
  "use strict";

  var nav = document.querySelector(".nav");
  var menuButton = document.querySelector(".menu-toggle");
  var menu = document.querySelector(".menu");
  var menuLinks = Array.prototype.slice.call(document.querySelectorAll(".menu a"));
  var revealItems = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;

  function updateNav() {
    if (!nav) return;
    nav.classList.toggle("scrolled", window.scrollY > 24);
    document.documentElement.style.setProperty(
      "--scroll-width",
      (Math.min(window.scrollY / Math.max(document.documentElement.scrollHeight - innerHeight, 1), 1) * 100) + "%"
    );
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
  if (menuButton) menuButton.addEventListener("click", toggleMenu);
  menuLinks.forEach(function (link) { link.addEventListener("click", closeMenu); });
  window.addEventListener("resize", function () { if (innerWidth > 720) closeMenu(); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") closeMenu(); });

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(function (item) { item.classList.add("show"); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var siblings = Array.prototype.slice.call(entry.target.parentElement.querySelectorAll(":scope > [data-reveal]"));
        entry.target.style.transitionDelay = Math.min(Math.max(siblings.indexOf(entry.target), 0) * 70, 280) + "ms";
        entry.target.classList.add("show");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    revealItems.forEach(function (item) { revealObserver.observe(item); });
  }

  if ("IntersectionObserver" in window) {
    var sections = Array.prototype.slice.call(document.querySelectorAll("#products, #capability, #process, #contact"));
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        menuLinks.forEach(function (link) { link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id); });
      });
    }, { rootMargin: "-35% 0px -55% 0px", threshold: 0 });
    sections.forEach(function (section) { sectionObserver.observe(section); });
  }

  document.querySelectorAll("[data-year]").forEach(function (element) {
    element.textContent = String(new Date().getFullYear());
  });

  if (!reducedMotion) {
    var core = document.querySelector(".ai-core");
    var stage = document.querySelector(".core-stage");
    if (stage) {
      for (var p = 0; p < 28; p += 1) {
        var particle = document.createElement("i");
        particle.className = "data-particle";
        particle.style.setProperty("--x", (8 + Math.random() * 84) + "%");
        particle.style.setProperty("--y", (8 + Math.random() * 84) + "%");
        particle.style.setProperty("--delay", (-Math.random() * 6) + "s");
        particle.style.setProperty("--speed", (3 + Math.random() * 5) + "s");
        stage.appendChild(particle);
      }
    }

    function depthMove(element, event, amount) {
      var box = element.getBoundingClientRect();
      var x = (event.clientX - box.left) / box.width - 0.5;
      var y = (event.clientY - box.top) / box.height - 0.5;
      element.style.setProperty("--rx", (-y * amount) + "deg");
      element.style.setProperty("--ry", (x * amount) + "deg");
      element.style.setProperty("--mx", (x + 0.5) * 100 + "%");
      element.style.setProperty("--my", (y + 0.5) * 100 + "%");
    }

    if (core && finePointer) {
      core.addEventListener("pointermove", function (event) { depthMove(core, event, 7); });
      core.addEventListener("pointerleave", function () { core.style.setProperty("--rx", "0deg"); core.style.setProperty("--ry", "0deg"); });
    }

    document.querySelectorAll(".product, .cap-grid article").forEach(function (card) {
      if (!finePointer) return;
      card.addEventListener("pointermove", function (event) { depthMove(card, event, 3.5); });
      card.addEventListener("pointerleave", function () { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
    });

    document.querySelectorAll(".btn, .nav-cta, .contact .shell>a").forEach(function (button) {
      if (!finePointer) return;
      button.classList.add("magnetic");
      button.addEventListener("pointermove", function (event) {
        var box = button.getBoundingClientRect();
        button.style.transform = "translate(" + (event.clientX - box.left - box.width / 2) * 0.1 + "px," + (event.clientY - box.top - box.height / 2) * 0.16 + "px)";
      });
      button.addEventListener("pointerleave", function () { button.style.transform = ""; });
    });

    if (finePointer) {
      var cursor = document.createElement("div");
      cursor.className = "cursor-glow";
      document.body.appendChild(cursor);
      window.addEventListener("pointermove", function (event) {
        cursor.style.transform = "translate3d(" + event.clientX + "px," + event.clientY + "px,0)";
      }, { passive: true });
      document.querySelectorAll("a, button, .product, .cap-grid article").forEach(function (target) {
        target.addEventListener("pointerenter", function () { cursor.classList.add("is-active"); });
        target.addEventListener("pointerleave", function () { cursor.classList.remove("is-active"); });
      });
    }
  }
})();
