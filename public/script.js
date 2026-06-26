const header = document.querySelector("[data-header]");

const setHeaderState = () => {
  if (!header) return;
  header.dataset.scrolled = String(window.scrollY > 8);
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });
