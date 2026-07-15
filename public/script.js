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

/* 뉴스레터 구독 폼 — 더블 옵트인(확인 메일의 링크를 누르기 전까지는 발송되지 않는다) */
(function () {
  var form = document.getElementById("subscribeForm");
  if (!form) return;
  var ENDPOINT = "https://joycuxdxlqhztyomnimh.supabase.co/functions/v1/erp-subscribe";
  var msg = document.getElementById("subMsg");
  var btn = document.getElementById("subBtn");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("subEmail").value.trim();
    var consent = document.getElementById("subConsent").checked;
    if (!consent) {
      msg.textContent = "수신 동의 체크가 필요합니다.";
      msg.className = "subscribe-msg err";
      return;
    }
    btn.disabled = true;
    msg.textContent = "";
    msg.className = "subscribe-msg";
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email }),
    })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function () {
        msg.textContent = "확인 메일을 보내드렸습니다 — 메일함에서 링크를 눌러 구독을 완료해 주세요.";
        msg.className = "subscribe-msg ok";
        form.reset();
      })
      .catch(function () {
        msg.textContent = "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.";
        msg.className = "subscribe-msg err";
      })
      .then(function () { btn.disabled = false; });
  });
})();
