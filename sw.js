/* İngilizce Koçu — service worker.
   Uygulama kabuğu önbelleğe alınır (ağ önce, yoksa önbellek). data/ ve API çağrıları asla önbelleğe alınmaz.
   Google Fonts: önbellek önce, arkada tazele. */
const VERSION = 'ik3-3.0.0';
const SHELL_CACHE = VERSION + '-shell';
const FONT_CACHE = VERSION + '-fonts';
const SHELL = ['./', './index.html', './app.css', './app.js', './content.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== FONT_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => {
  if (e.data === 'clear-cache') e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  if (e.data === 'skip-waiting') self.skipWaiting();
});

const isShellPath = p => SHELL.some(u => p.endsWith(u.replace('./', '/')) || (u === './' && (p.endsWith('/') || p.endsWith('/index.html'))));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Harici: fontlar önbellek önce; diğer her şey (GitHub API, Claude API) dokunulmaz.
  if (url.origin !== self.location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      e.respondWith((async () => {
        const c = await caches.open(FONT_CACHE);
        const hit = await c.match(req);
        const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
        return hit || (await net) || new Response('', { status: 504 });
      })());
    }
    return;
  }
  // Veri dosyaları: yalnızca ağ.
  if (url.pathname.includes('/data/')) return;
  // Kabuk: ağ önce, olmazsa önbellek; gezinme için index.html'e düş.
  if (req.mode === 'navigate' || isShellPath(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL_CACHE);
      try {
        const r = await fetch(req);
        if (r && r.ok) c.put(req, r.clone());
        return r;
      } catch (err) {
        const hit = await c.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') { const idx = await c.match('./index.html'); if (idx) return idx; }
        return new Response('Çevrimdışı', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
  }
});
