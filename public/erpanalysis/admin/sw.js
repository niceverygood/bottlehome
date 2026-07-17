/* 관리자 PWA 서비스워커 — 설치형 요건 충족용.
   셸(HTML·아이콘)은 네트워크 우선 + 캐시 폴백, API(수파베이스)는 건드리지 않는다. */
const CACHE = "bottle-admin-v1";
const SHELL = [
  "/erpanalysis/admin/",
  "/erpanalysis/admin/chat/",
  "/erpanalysis/admin/manifest.webmanifest",
  "/erpanalysis/admin/icon-192.png",
  "/erpanalysis/admin/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; /* API 요청은 그대로 통과 */
  e.respondWith(
    fetch(e.request).then(r => {
      const cp = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
