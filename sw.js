/* Biblical Languages Trainer — keeps a copy of the trainer on the device so it opens offline.
   It opens the saved copy at once; meanwhile it reads only the first 8 KB of the published
   index.html to see its version (in the <title>), and downloads the whole file only when a
   newer version has been published. The page is then told, so it can offer a restart.
   Developed by Kletos Koinonia. This file rarely needs changing. */
const CACHE = "trainer-v1";
const PAGE = new URL("index.html", self.registration.scope).href;
const EXTRA = ["manifest.json", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"].map(p => new URL(p, self.registration.scope).href);
const META = new URL("__version", self.registration.scope).href;
const verOf = t => { const m = /·\s*v(\d+)\.(\d+)/.exec(t || ""); return m ? m[1] + "." + m[2] : ""; };
const num = v => { const [a, b] = String(v || "0").split(".").map(Number); return (a || 0) * 1000 + (b || 0); };

async function savePage(res, c) {
  const head = await res.clone().text().then(t => t.slice(0, 8192));
  await c.put(PAGE, res);
  await c.put(META, new Response(verOf(head)));
  return verOf(head);
}
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const r = await fetch(PAGE, {cache: "no-store"}); if (r.ok) await savePage(r, c);
    await Promise.all(EXTRA.map(u => fetch(u).then(x => x.ok && c.put(u, x)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

let checking = null;
async function checkForUpdate() {
  if (checking) return checking;
  checking = (async () => {
    try {
      const c = await caches.open(CACHE), m = await c.match(META), have = m ? await m.text() : "";
      const h = await fetch(PAGE, {headers: {Range: "bytes=0-8191"}, cache: "no-store"});
      if (!h.ok) return;
      const remote = verOf(await h.text()); if (!remote || num(remote) <= num(have)) return;
      const r = await fetch(PAGE, {cache: "no-store"}); if (!r.ok) return;
      const v = await savePage(r, c);
      (await self.clients.matchAll({type: "window"})).forEach(cl => cl.postMessage({type: "trainer-updated", version: v}));
    } catch (e) { /* offline — try again next time */ }
    finally { checking = null; }
  })();
  return checking;
}
self.addEventListener("message", e => { if (e.data === "check-update") e.waitUntil(checkForUpdate()); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isPage = req.mode === "navigate" || url.href === PAGE || url.href === self.registration.scope;
  if (isPage && url.origin === self.location.origin && !req.headers.get("range")) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), hit = await c.match(PAGE);
      if (hit) { e.waitUntil(checkForUpdate()); return hit; }
      const r = await fetch(req); if (r.ok) { const copy = r.clone(); e.waitUntil(savePage(copy, c)); } return r;
    })());
    return;
  }
  if (EXTRA.includes(url.href)) e.respondWith(caches.match(url.href).then(h => h || fetch(req)));
});
