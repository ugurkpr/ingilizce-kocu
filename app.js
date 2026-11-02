/* İngilizce Koçu v3 — GitHub Pages sürümü (gerçek mikrofon + PWA)
   Depolama: GitHub Contents API (data/*.json). Claude: doğrudan Messages API. Anahtarlar yalnızca localStorage'da. */
(() => {
'use strict';
const VERSION = '3.0.0';
const CFG = { owner: 'ugurkpr', repo: 'ingilizce-kocu', branch: 'main', api: 'https://api.github.com' };

/* ============================================================
   Yardımcılar
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = (() => { let n = 0; return p => (p || 'c') + (++n); })();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function todayStr() {
  if (window.__IK_TODAY) return window.__IK_TODAY; // test için sabit tarih
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (e) { return new Date().toISOString().slice(0, 10); }
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekday(ymd) { // 0=Pazar … 6=Cumartesi
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
const DAY_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
function fmtDate(ymd, withYear = false) {
  try {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  } catch (e) { return ymd; }
}
function fmtTime(iso) { try { return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(iso)); } catch (e) { return iso || ''; } }
function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function similarity(said, target) {
  const a = normalize(said).split(' ').filter(Boolean);
  const b = normalize(target).split(' ').filter(Boolean);
  if (!a.length || !b.length) return 0;
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const sa = new Set(a), sb = new Set(b);
  let inter = 0; sa.forEach(w => { if (sb.has(w)) inter++; });
  const jac = inter / new Set([...a, ...b]).size;
  const charLev = 1 - levenshtein(normalize(said), normalize(target)) / Math.max(normalize(said).length, normalize(target).length);
  return Math.round(Math.max(0, (lev * .5 + jac * .2 + charLev * .3)) * 100);
}
function sameAnswer(given, answer, alts) {
  const g = normalize(given);
  if (!g) return false;
  const expand = s => { const n = normalize(s); return [n, n.replace(/\bi'm\b/g, 'i am').replace(/\b(\w+)'s\b/g, '$1 is').replace(/\b(\w+)'re\b/g, '$1 are').replace(/n't\b/g, ' not')]; };
  const gs = expand(given);
  const cands = [answer, ...(alts || [])].flatMap(expand);
  return gs.some(x => cands.includes(x));
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sentenceCount = t => String(t || '').split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 1).length;
const wordCount = t => normalize(t).split(' ').filter(Boolean).length;
const PRAISE = ['Harika!', 'Doğru!', 'Çok iyi!', 'Aynen öyle.', 'Süper.'];

const LS = {
  get(k) { try { const v = localStorage.getItem('ik3:' + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('ik3:' + k, JSON.stringify(v)); } catch (e) { /* dolu ya da kapalı */ } },
  del(k) { try { localStorage.removeItem('ik3:' + k); } catch (e) { /* yoksay */ } },
  keys() { try { return Object.keys(localStorage).filter(k => k.startsWith('ik3:')).map(k => k.slice(4)); } catch (e) { return []; } },
};

/* Ayarlar (sadece bu cihazda) */
const DEFAULTS = { autoSpeak: true, autoListen: true, micMode: 'tap', slow: false, voice: '', installHintDismissed: false, theme: 'auto' };
const Settings = {
  data: { ...DEFAULTS, ...(LS.get('settings') || {}) },
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; LS.set('settings', this.data); },
};
const Keys = {
  claude() { return String(LS.get('claude_key') || '').trim(); },
  github() { return String(LS.get('gh_token') || '').trim(); },
  setClaude(v) { v = String(v || '').trim(); if (v) LS.set('claude_key', v); else LS.del('claude_key'); },
  setGithub(v) { v = String(v || '').trim(); if (v) LS.set('gh_token', v); else LS.del('gh_token'); },
};

let toastTimer = null;
function toast(msg, ms = 2800) {
  if (!msg) return;
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}
window.addEventListener('error', e => { console.error(e.error || e.message); toast('Bir şeyler ters gitti; sayfayı yenilemek gerekebilir.'); });
window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast('Bir işlem tamamlanamadı.'); });

/* ============================================================
   İkon seti — tek stil, inline SVG
   ============================================================ */
const ICONS = {
  speaker: '<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="M16 9.2a4 4 0 0 1 0 5.6"/><path d="M18.6 6.6a7.5 7.5 0 0 1 0 10.8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21M9 21h6"/>',
  flame: '<path d="M12 3c.5 3.5 4 5 4 9a4 4 0 0 1-8 0c0-1.5.6-2.6 1.4-3.5.3 1.3 1 2 1.9 2.3C10.6 8.5 11 5.5 12 3z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  warn: '<path d="M12 4 2.8 20h18.4z"/><path d="M12 10v4M12 17.2v.3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  pen: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13 7l4 4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3.3 3.9M6.6 6.6C4 8.4 2.5 12 2.5 12S6 18 12 18c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  share: '<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
};
const ico = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const sayBtn = (text, extra = '') => `<button class="iconbtn ${extra}" data-say="${esc(text)}" aria-label="Dinle">${ico('speaker')}</button>`;

/* ============================================================
   Küçük markdown çizici
   ============================================================ */
function inlineMd(s) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, '<code lang="en">$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return h;
}
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let para = [], list = null;
  const flushP = () => { if (para.length) { out.push(`<p>${inlineMd(para.join(' '))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inlineMd(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushP(); flushL(); continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushP(); flushL(); const lv = Math.max(2, m[1].length); out.push(`<h${lv}>${inlineMd(m[2])}</h${lv}>`); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushP(); flushL(); out.push(`<blockquote>${inlineMd(m[1])}</blockquote>`); continue; }
    if ((m = line.match(/^[-*]\s+(.*)$/))) { flushP(); if (!list || list.tag !== 'ul') { flushL(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.tag !== 'ol') { flushL(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushP(); flushL(); continue; }
    flushL(); para.push(line.trim());
  }
  flushP(); flushL();
  return `<div class="md">${out.join('')}</div>`;
}

/* ============================================================
   Durum
   ============================================================ */
const C = window.CONTENT || null;
const S = {
  main: { startedAt: null, streak: 0, lastActiveDate: null, current: null, completed: {}, log: {}, weak: {} },
  vocab: {},
  speaking: {},
  usage: {},
  lessons: {},     // id → ders belgesi
  homework: {},    // lessonId → ödev belgesi
  grades: {},      // lessonId → not
  exams: {},       // examId → sonuç
  plan: null,      // course/plan (depo) ya da content.plan
  dbState: 'loading',      // loading | ok | stale | local | offline
  lessonsState: 'loading', // loading | ok | empty | local
  tab: 'bugun', sub: null,
  route: null,     // {kind:'lesson'|'exam', id}
  page: null,      // açık ders/sınav oturumu
  stepStart: Date.now(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
};
const grammarById = id => (C?.grammar || []).find(g => g.id === id);
const poolById = id => (C?.vocab_pool || []).find(v => v.id === id);

/* ============================================================
   Store — GitHub deposu (Contents API) + Pages fallback + localStorage önbelleği
   Yollar v2 gibi: 'progress/main' → data/progress/main.json
   ============================================================ */
const b64enc = str => { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64dec = b64 => { const bin = atob(String(b64).replace(/\s/g, '')); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); };
function httpErr(r, body) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; e.body = body; return e; }

const Store = {
  mem: {}, sha: {}, locks: {}, pending: {}, warned: false, lastError: null,
  queue: LS.get('queue') || {},            // path → zaman (depoya yazılamamış belgeler)
  lastWrite: LS.get('lastWrite') || null,
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); },
  hasToken() { return !!Keys.github(); },
  file(path) { return 'data/' + path + '.json'; },
  apiUrl(p) { return `${CFG.api}/repos/${CFG.owner}/${CFG.repo}/contents/${p}`; },
  headers(raw = false) {
    const h = { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const t = Keys.github(); if (t) h.Authorization = 'Bearer ' + t;
    return h;
  },
  cached(path) { if (Object.prototype.hasOwnProperty.call(this.mem, path)) return this.mem[path]; const v = LS.get('doc:' + path); if (v !== null) this.mem[path] = v; return v; },
  put(path, obj) { this.mem[path] = obj; LS.set('doc:' + path, obj); },
  queued(path) { return !!this.queue[path]; },
  queueCount() { return Object.keys(this.queue).length; },
  markQueued(path) { this.queue[path] = Date.now(); LS.set('queue', this.queue); },
  unqueue(path) { if (this.queue[path]) { delete this.queue[path]; LS.set('queue', this.queue); } },
  /** Depodan oku. 404 → null. Ağ hatasında fırlatır. */
  async fetchDoc(path) {
    const file = this.file(path);
    if (this.hasToken()) {
      const r = await fetch(this.apiUrl(file) + '?ref=' + CFG.branch, { headers: this.headers(false), cache: 'no-store' });
      if (r.status === 404) { delete this.sha[path]; return null; }
      if (!r.ok) throw httpErr(r, await r.text().catch(() => ''));
      const j = await r.json();
      this.sha[path] = j.sha;
      if (j.content) return JSON.parse(b64dec(j.content));
      if (j.download_url) { const r2 = await fetch(j.download_url, { cache: 'no-store' }); if (!r2.ok) throw httpErr(r2); return await r2.json(); }
      return null;
    }
    const r = await fetch(`./${file}?v=${Date.now()}`, { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw httpErr(r);
    return await r.json();
  },
  /** get(path, {fresh}) — önce önbellek; fresh ise ağdan tazele (kuyruktaki yerel sürüm ezilmez). */
  async get(path, opts = {}) {
    const c = this.cached(path);
    if (!opts.fresh && c !== null && c !== undefined) return c;
    try {
      const doc = await this.fetchDoc(path);
      this.lastError = null;
      if (this.queued(path) && c) return c;           // yerel, henüz yazılmamış sürüm kazanır
      if (doc === null) { if (opts.fresh) return c ?? null; return null; }
      this.put(path, doc);
      return doc;
    } catch (e) {
      this.lastError = e; console.warn('store get', path, e.message || e);
      if (e.status === 401 || e.status === 403) this.authError = e.status;
      return c ?? null;
    }
  },
  /** set(path, obj) — hemen önbelleğe; token varsa depoya PUT (yol başına tek yazma kilidi). */
  async set(path, obj) {
    this.put(path, obj);
    this.markQueued(path);
    if (!this.hasToken()) { this.emit(); return { queued: true }; }
    if (this.locks[path]) { this.pending[path] = true; return { pending: true }; }
    this.locks[path] = true;
    try {
      await this.putRemote(path);
      this.unqueue(path);
      this.lastWrite = new Date().toISOString(); LS.set('lastWrite', this.lastWrite);
      this.lastError = null;
      return { ok: true };
    } catch (e) {
      this.lastError = e; console.warn('store set', path, e.message || e);
      if (e.status === 401 || e.status === 403) this.authError = e.status;
      if (!this.warned) { this.warned = true; toast(e.status === 401 ? 'GitHub anahtarı geçersiz; ilerleme bu cihazda saklandı.' : 'GitHub\'a yazılamadı; bu cihazda saklandı, sonra tekrar denenecek.'); }
      return { error: e };
    } finally {
      this.locks[path] = false;
      if (this.pending[path]) { this.pending[path] = false; this.set(path, this.mem[path]); }
      this.emit();
    }
  },
  async putRemote(path, retry = true) {
    const file = this.file(path);
    const body = { message: 'app: ' + file, content: b64enc(JSON.stringify(this.mem[path], null, 2) + '\n'), branch: CFG.branch };
    if (this.sha[path]) body.sha = this.sha[path];
    const r = await fetch(this.apiUrl(file), { method: 'PUT', headers: { ...this.headers(false), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { const j = await r.json().catch(() => ({})); if (j.content?.sha) this.sha[path] = j.content.sha; return; }
    const txt = await r.text().catch(() => '');
    if ((r.status === 409 || r.status === 422) && retry) { // sha çakışması: bir kez yeniden oku, tekrar dene
      await this.refreshSha(path);
      return this.putRemote(path, false);
    }
    throw httpErr(r, txt);
  },
  async refreshSha(path) {
    const r = await fetch(this.apiUrl(this.file(path)) + '?ref=' + CFG.branch, { headers: this.headers(false), cache: 'no-store' });
    if (r.status === 404) { delete this.sha[path]; return; }
    if (!r.ok) throw httpErr(r);
    const j = await r.json(); this.sha[path] = j.sha;
  },
  /** Dizin listesi: ['a1-u1-l1', …]. Başarısızlıkta null. (Depo herkese açık; anahtarsız da çalışır, saatte 60 istek.) */
  async list(dir) {
    try {
      const r = await fetch(this.apiUrl('data/' + dir) + '?ref=' + CFG.branch, { headers: this.headers(false), cache: 'no-store' });
      if (r.status === 404) return [];
      if (!r.ok) throw httpErr(r);
      const j = await r.json();
      return (Array.isArray(j) ? j : []).filter(f => f.type === 'file' && /\.json$/.test(f.name)).map(f => f.name.slice(0, -5));
    } catch (e) { console.warn('store list', dir, e.message || e); return null; }
  },
  /** Kuyruktaki belgeleri depoya yaz (token girilince). */
  async flush() {
    if (!this.hasToken()) return 0;
    let n = 0;
    for (const path of Object.keys(this.queue)) {
      if (!Object.prototype.hasOwnProperty.call(this.mem, path) && this.cached(path) === null) { this.unqueue(path); continue; }
      const r = await this.set(path, this.mem[path]);
      if (r.ok) n++;
    }
    return n;
  },
  clearCache() {
    this.mem = {}; this.sha = {};
    LS.keys().forEach(k => { if (k.startsWith('doc:')) LS.del(k); });
  },
  /** Bağlantı testi: plan.json okur; {ok, remaining, lastWrite} */
  async test() {
    const r = await fetch(this.apiUrl('data/course/plan.json') + '?ref=' + CFG.branch, { headers: this.headers(false), cache: 'no-store' });
    if (!r.ok) throw httpErr(r, await r.text().catch(() => ''));
    const j = await r.json();
    return { ok: true, remaining: r.headers.get('x-ratelimit-remaining'), size: j.size, lastWrite: this.lastWrite };
  },
};

/* ============================================================
   AI — Claude Messages API (akış + JSON)
   ============================================================ */
const AI_MSG = {
  nokey: 'Ayarlar\'dan Claude anahtarını gir.',
  auth: 'Claude anahtarı geçersiz, Ayarlar\'dan kontrol et.',
  rate: 'Claude şu an yoğun, biraz bekle.',
  network: 'İnternet yok.',
  bad: 'İstek reddedildi; tekrar dene.',
  http: 'Claude\'a ulaşılamadı; tekrar dene.',
  overloaded: 'Claude şu an yoğun, biraz bekle.',
  invalid_json: 'Yanıt çözülemedi; tekrar dene.',
  empty: 'Boş yanıt geldi; tekrar dene.',
  cancelled: '',
};
function aiErr(code, detail, status) { const e = new Error(AI_MSG[code] ?? AI_MSG.http); e.code = code; e.detail = detail || ''; e.status = status; return e; }
function aiMessage(e) { if (!e) return AI_MSG.http; if (e.code && e.code in AI_MSG) return AI_MSG[e.code]; return e.message || AI_MSG.http; }
function parseJsonLoose(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw aiErr('invalid_json', s.slice(0, 200));
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {
    // sondaki virgül gibi küçük kusurları dene
    try { return JSON.parse(s.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1')); } catch (e2) { throw aiErr('invalid_json', s.slice(0, 200)); }
  }
}
const AI = {
  MODELS: { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5' },
  endpoint: 'https://api.anthropic.com/v1/messages',
  ready() { return !!Keys.claude(); },
  headers() { return { 'x-api-key': Keys.claude(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' }; },
  /** Mesaj listesini API'nin istediği biçime sok: user ile başla, roller dönüşümlü. */
  shape(messages) {
    const out = [];
    for (const m of messages) {
      if (!m || !m.content) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + m.content;
      else out.push({ role, content: String(m.content) });
    }
    if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '[The conversation starts now.]' });
    if (out[out.length - 1].role !== 'user') out.push({ role: 'user', content: '[Continue.]' });
    return out;
  },
  /** chat(messages, {system, onText, signal, tier, maxTokens}) → {text, usage, model} */
  async chat(messages, opts = {}) {
    if (!this.ready()) throw aiErr('nokey');
    if (!S.online) throw aiErr('network');
    const model = this.MODELS[opts.tier || 'quick'] || opts.tier;
    const stream = typeof opts.onText === 'function';
    const body = { model, max_tokens: opts.maxTokens || 200, messages: this.shape(messages), stream };
    if (opts.system) body.system = opts.system;
    if (opts.temperature != null) body.temperature = opts.temperature;
    let r;
    try { r = await fetch(this.endpoint, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal: opts.signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw aiErr('cancelled'); throw aiErr('network', String(e && e.message)); }
    if (!r.ok) {
      let detail = ''; try { const j = await r.json(); detail = j?.error?.message || j?.error?.type || ''; } catch (e) { /* yoksay */ }
      const code = r.status === 401 || r.status === 403 ? 'auth' : r.status === 429 ? 'rate' : r.status === 529 ? 'overloaded' : r.status === 400 ? 'bad' : 'http';
      throw aiErr(code, detail, r.status);
    }
    if (!stream || !r.body || typeof r.body.getReader !== 'function') {
      const j = stream ? this.parseSseText(await r.text()) : await r.json();
      const text = stream ? j.text : (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      const usage = stream ? j.usage : (j.usage || {});
      if (!text) throw aiErr('empty');
      Usage.add(model, usage);
      if (stream) opts.onText({ text, delta: text });
      return { text, usage, model: j.model || model };
    }
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = '', text = ''; const usage = { input_tokens: 0, output_tokens: 0 };
    const handle = ev => {
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { text += ev.delta.text; opts.onText({ text, delta: ev.delta.text }); }
      else if (ev.type === 'message_start' && ev.message && ev.message.usage) usage.input_tokens = ev.message.usage.input_tokens || 0;
      else if (ev.type === 'message_delta' && ev.usage) usage.output_tokens = ev.usage.output_tokens || usage.output_tokens;
      else if (ev.type === 'error') { const code = /overloaded/i.test(ev.error?.type || '') ? 'overloaded' : 'http'; throw aiErr(code, ev.error?.message); }
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim(); if (!data || data === '[DONE]') continue;
            let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
            handle(ev);
          }
        }
      }
    } catch (e) {
      if ((e && e.name === 'AbortError') || (opts.signal && opts.signal.aborted)) { Usage.add(model, usage); const err = aiErr('cancelled'); err.text = text; throw err; }
      throw e;
    }
    Usage.add(model, usage);
    if (!text) throw aiErr('empty');
    return { text, usage, model };
  },
  parseSseText(txt) {
    let text = ''; const usage = { input_tokens: 0, output_tokens: 0 };
    for (const line of String(txt).split('\n')) {
      if (!line.startsWith('data:')) continue;
      try { const ev = JSON.parse(line.slice(5).trim());
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text;
        else if (ev.type === 'message_start' && ev.message?.usage) usage.input_tokens = ev.message.usage.input_tokens || 0;
        else if (ev.type === 'message_delta' && ev.usage) usage.output_tokens = ev.usage.output_tokens || 0;
      } catch (e) { /* yoksay */ }
    }
    return { text, usage };
  },
  /** json(prompt, {system, tier, maxTokens}) → nesne (ilk { … son } arası) */
  async json(prompt, opts = {}) {
    const system = (opts.system ? opts.system + '\n' : '') + 'Reply with only one JSON object. No prose, no markdown fences.';
    const { text } = await this.chat([{ role: 'user', content: prompt }], { system, tier: opts.tier || 'default', maxTokens: opts.maxTokens || 800, signal: opts.signal });
    return parseJsonLoose(text);
  },
  /** Bağlantı testi: {ms, model} */
  async test() {
    const t0 = Date.now();
    const r = await this.chat([{ role: 'user', content: 'Reply with the single word: ready' }], { tier: 'quick', maxTokens: 10 });
    return { ms: Date.now() - t0, model: r.model, text: r.text };
  },
};
const aiReady = () => AI.ready();

/* Maliyet sayacı → progress/usage.json {date:{model:{in,out,calls}}} */
const PRICE = { 'claude-haiku-5-5': [1, 5], 'claude-sonnet-5-5': [3, 15] }; // $ / 1M token (yaklaşık)
const Usage = {
  dirty: false, timer: null,
  add(model, usage) {
    if (!usage) return;
    const d = todayStr();
    const day = S.usage[d] = S.usage[d] || {};
    const m = day[model] = day[model] || { in: 0, out: 0, calls: 0 };
    m.in += Number(usage.input_tokens) || 0; m.out += Number(usage.output_tokens) || 0; m.calls++;
    this.dirty = true;
    LS.set('doc:progress/usage', S.usage);
    clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 45000);
  },
  flush() { if (!this.dirty) return; this.dirty = false; Store.set('progress/usage', clone(S.usage)); },
  cost(model, inTok, outTok) { const p = PRICE[model] || PRICE['claude-sonnet-5-5']; return (inTok * p[0] + outTok * p[1]) / 1e6; },
  month(prefix = todayStr().slice(0, 7)) {
    let cost = 0, calls = 0, tokens = 0;
    for (const [d, day] of Object.entries(S.usage || {})) { if (!d.startsWith(prefix)) continue; for (const [m, v] of Object.entries(day)) { cost += this.cost(m, v.in || 0, v.out || 0); calls += v.calls || 0; tokens += (v.in || 0) + (v.out || 0); } }
    return { cost, calls, tokens };
  },
};

/* ============================================================
   Ses: okuma (TTS) ve tanıma (STT)
   iOS Safari / Android Chrome kalıbı: start() kullanıcı dokunuşunda; interim → kutu; onend → final.
   ============================================================ */
const Sound = {
  voices: [], voice: null, unlocked: false, speakingBtn: null, queue: null, recognizer: null, listening: false,
  get slow() { return !!Settings.get('slow'); }, set slow(v) { Settings.set('slow', !!v); },
  init() {
    if (!('speechSynthesis' in window)) return;
    const load = () => {
      try {
        this.voices = speechSynthesis.getVoices() || [];
        const en = this.enVoices();
        const wanted = Settings.get('voice');
        const chosen = wanted && en.find(v => v.name === wanted);
        const pref = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex', 'Ava', 'Allison', 'Nicky'];
        this.voice = chosen || pref.map(n => en.find(v => v.name.includes(n))).find(Boolean) || en.find(v => !/compact/i.test(v.name)) || en[0] || this.voices.find(v => /^en/i.test(v.lang)) || null;
      } catch (e) { /* yoksay */ }
    };
    load();
    try { speechSynthesis.onvoiceschanged = load; } catch (e) { /* yoksay */ }
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); speechSynthesis.resume(); } catch (e) { /* yoksay */ }
    };
    document.addEventListener('pointerdown', unlock, { once: true, passive: true });
    document.addEventListener('keydown', unlock, { once: true });
  },
  enVoices() { return this.voices.filter(v => /^en([-_]|$)/i.test(v.lang)).sort((a, b) => (/US/i.test(b.lang) - /US/i.test(a.lang)) || a.name.localeCompare(b.name)); },
  speak(text, btn, rate, onEnd) {
    if (!('speechSynthesis' in window)) { toast('Bu tarayıcı sesli okumayı desteklemiyor.'); onEnd && onEnd(); return; }
    try {
      speechSynthesis.cancel();
      this.queue = null;
      if (this.speakingBtn) this.speakingBtn.classList.remove('speaking');
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = rate || (this.slow ? 0.7 : 0.92); u.pitch = 1;
      if (this.voice) u.voice = this.voice;
      if (btn) { btn.classList.add('speaking'); this.speakingBtn = btn; }
      let ended = false;
      const fin = () => { if (ended) return; ended = true; if (btn) btn.classList.remove('speaking'); if (this.speakingBtn === btn) this.speakingBtn = null; onEnd && onEnd(); };
      u.onend = fin; u.onerror = fin;
      this.current = u; // GC'ye karşı tut (Safari)
      speechSynthesis.speak(u);
      setTimeout(() => { if (!ended && !speechSynthesis.speaking) fin(); }, Math.max(1500, text.length * 120)); // onend gelmezse
    } catch (e) { console.warn(e); toast('Ses çalınamadı.'); onEnd && onEnd(); }
  },
  speakSeq(items, onEach, onDone) {
    const token = {}; this.queue = token;
    let i = 0;
    const next = () => {
      if (this.queue !== token) return;
      if (i >= items.length) { this.queue = null; onDone && onDone(); return; }
      const it = items[i++];
      onEach && onEach(it, i - 1);
      this.speak(it.text, it.btn, undefined, () => { if (this.queue === token) next(); });
      this.queue = token;
    };
    next();
  },
  stop() { this.queue = null; try { speechSynthesis.cancel(); } catch (e) { /* yoksay */ } if (this.speakingBtn) { this.speakingBtn.classList.remove('speaking'); this.speakingBtn = null; } },
  canListen() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  /** listen({onInterim, onFinal, onError, onEnd}) → recognizer | null */
  listen({ onInterim, onFinal, onError, onEnd }) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) { onError && onError('unsupported'); return null; }
    try { if (this.recognizer) { this.recognizer.onend = null; this.recognizer.abort(); } } catch (e) { /* yoksay */ }
    this.stop(); // TTS çalarken mikrofon açılmaz (iOS)
    const rec = new Rec();
    rec.lang = 'en-US'; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
    let finalText = '', lastInterim = '', gotFinal = false, errored = false;
    rec.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
      if (interim) { lastInterim = interim; onInterim && onInterim(interim); }
      if (finalText) { gotFinal = true; onFinal && onFinal(finalText.trim()); finalText = ''; }
    };
    rec.onerror = ev => { errored = true; const code = ev.error || 'error'; if (code !== 'aborted') onError && onError(code); };
    rec.onend = () => {
      if (this.recognizer === rec) { this.recognizer = null; this.listening = false; }
      // iOS Safari bazen final göndermeden biter: son ara metni final say
      if (!gotFinal && !errored && lastInterim.trim()) { gotFinal = true; onFinal && onFinal(lastInterim.trim()); }
      onEnd && onEnd(gotFinal);
    };
    this.recognizer = rec; this.listening = true;
    try { rec.start(); } catch (e) { this.recognizer = null; this.listening = false; onError && onError('start'); return null; }
    return rec;
  },
  stopListening() { try { if (this.recognizer) this.recognizer.stop(); } catch (e) { /* yoksay */ } },
  abortListening() { try { if (this.recognizer) { const r = this.recognizer; this.recognizer = null; this.listening = false; r.onend = null; r.abort(); } } catch (e) { /* yoksay */ } },
};
const MIC_MSG = {
  unsupported: 'Bu tarayıcıda ses tanıma yok; yazarak devam edebilirsin.',
  'not-allowed': 'Mikrofon izni verilmedi; tarayıcı ayarlarından aç.',
  'service-not-allowed': 'Mikrofon izni verilmedi; tarayıcı ayarlarından aç.',
  'audio-capture': 'Mikrofon bulunamadı; yazarak devam edebilirsin.',
  'no-speech': 'Ses algılanmadı, tekrar dene.',
  network: 'Ses tanıma için bağlantı kurulamadı.',
  'language-not-supported': 'Bu cihazda İngilizce tanıma yok.',
  aborted: '',
  start: 'Mikrofon başlatılamadı; bir daha dene ya da yaz.',
};
const micMsg = code => MIC_MSG[code] ?? 'Mikrofon hatası; yazarak devam edebilirsin.';
const rateToggleHtml = () => `<span class="rate" role="group" aria-label="Okuma hızı"><button type="button" data-act="rate-normal" class="${Sound.slow ? '' : 'on'}">Normal</button><button type="button" data-act="rate-slow" class="${Sound.slow ? 'on' : ''}">Yavaş</button></span>`;

/* Büyük mikrofon düğmesi: dokun (aç/kapa) ya da bas-konuş. key → handlers[key+'-micstart'] / handlers[key+'-micstop'] */
function micBigHtml(key, st, opts = {}) {
  // st: {listening, msg, interim, can}
  const can = st.can !== false && Sound.canListen();
  const hold = Settings.get('micMode') === 'hold';
  const label = st.listening ? (hold ? 'Dinliyorum… bırakınca gönderilir' : 'Dinliyorum… bitince dokun') : (can ? (hold ? 'Basılı tut ve konuş' : 'Dokun ve konuş') : MIC_MSG.unsupported);
  return `<div class="micwrap" id="${key}-micwrap">
    <button type="button" class="micbig ${st.listening ? 'live' : ''} ${can ? '' : 'off'}" id="${key}-mic" data-mic="${key}" aria-pressed="${st.listening ? 'true' : 'false'}" aria-label="Mikrofon" ${can && !st.disabled ? '' : 'disabled'}>${st.listening ? '<span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>' : ico('mic')}</button>
    <div class="interim" id="${key}-interim">${esc(st.interim || '')}</div>
    <div class="micstate ${st.msg ? 'err' : ''}" id="${key}-micstate">${esc(st.msg || label)}</div>
    ${opts.extra || ''}
  </div>`;
}
/** Dinleme sırasında tam yeniden çizim yapmadan düğmeyi/yazıyı güncelle (bas-konuş'ta pointerup kaybolmasın). */
function micPatch(key, st) {
  const b = $(`#${key}-mic`); if (b) { b.classList.toggle('live', !!st.listening); b.setAttribute('aria-pressed', st.listening ? 'true' : 'false'); b.innerHTML = st.listening ? '<span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>' : ico('mic'); }
  const i = $(`#${key}-interim`); if (i && st.interim != null) i.textContent = st.interim;
  const m = $(`#${key}-micstate`); if (m) { const hold = Settings.get('micMode') === 'hold'; m.textContent = st.msg || (st.listening ? (hold ? 'Dinliyorum… bırakınca gönderilir' : 'Dinliyorum… bitince dokun') : (hold ? 'Basılı tut ve konuş' : 'Dokun ve konuş')); m.classList.toggle('err', !!st.msg); }
}
/* data-mic düğmeleri: dokun modunda click aç/kapa; bas-konuş modunda pointerdown başlat, pointerup durdur */
let micHeld = null;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-mic]'); if (!b || b.disabled) return;
  if (Settings.get('micMode') !== 'hold') return;
  e.preventDefault();
  try { b.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
  micHeld = b.dataset.mic;
  const fn = handlers[micHeld + '-micstart']; if (fn) fn(b, e);
});
const micRelease = e => {
  if (!micHeld) return;
  const key = micHeld; micHeld = null;
  const fn = handlers[key + '-micstop']; if (fn) fn(e); else Sound.stopListening();
};
document.addEventListener('pointerup', micRelease);
document.addEventListener('pointercancel', micRelease);
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-mic]')) e.preventDefault(); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-mic]'); if (!b || b.disabled) return;
  if (Settings.get('micMode') === 'hold') return;
  const key = b.dataset.mic;
  if (Sound.listening && b.classList.contains('live')) { const fs = handlers[key + '-micstop']; if (fs) fs(e); else Sound.stopListening(); return; }
  const fn = handlers[key + '-micstart']; if (fn) fn(b, e);
});

/* ============================================================
   Claude kuralları (system) ve TR düzeltme ayrıştırma
   ============================================================ */
function chatRules(cfg) {
  return [
    'You are an English speaking tutor talking with a Turkish beginner (A1 level, age 30, a graphic and motion designer in Samsun). The learner may be speaking through a microphone, so transcripts can contain small recognition mistakes; be tolerant.',
    'Rules you must follow in EVERY reply:',
    '- Reply in English with 1-2 short, simple sentences. Use very basic words.',
    '- End every reply with ONE simple question to keep the conversation going.',
    cfg.exam
      ? '- This is a speaking EXAM. Never correct the learner, never explain grammar, never add Turkish. Just react naturally and ask the next question.'
      : '- If the learner makes a grammar or word mistake, put ONE line of Turkish correction at the very START of your reply, exactly in this format: [TR: "I am go" yerine "I go" demelisin.] Then continue in English. If there is no mistake, do not add this.',
    '- If the learner writes in Turkish, give the English version of what they said and ask them to repeat it in English.',
    '- Never write long explanations. Never use lists. Never translate your English into Turkish.',
    cfg.topic ? '- Today\'s lesson topic: ' + cfg.topic : '',
    cfg.targets && cfg.targets.length ? '- Steer the conversation naturally so the learner gets to use these patterns: ' + cfg.targets.join(' | ') : '',
    cfg.questions && cfg.questions.length ? '- Ask these questions one at a time, in order: ' + cfg.questions.join(' | ') : '',
    cfg.role ? 'Your role: ' + cfg.role : '',
    cfg.scenario ? 'Scenario (in Turkish, for context): ' + cfg.scenario : '',
  ].filter(Boolean).join('\n');
}
function splitTR(text) {
  const m = String(text || '').match(/^\s*\[TR:\s*([\s\S]*?)\]\s*/);
  if (!m) return { tr: '', en: String(text || '').trim() };
  return { tr: m[1].trim(), en: String(text).slice(m[0].length).trim() };
}

/* ============================================================
   DB — Store üzerinde belge mantığı (ilerleme belgeleri birleştirilir, yazmalar ertelenir)
   ============================================================ */
const DOCS = { main: 'progress/main', vocab: 'progress/vocab', speaking: 'progress/speaking', usage: 'progress/usage' };
function mergeDoc(kind, base, over) {
  base = base || {}; over = over || {};
  if (kind === 'main') {
    const log = { ...(base.log || {}) };
    for (const [d, arr] of Object.entries(over.log || {})) {
      const prev = Array.isArray(log[d]) ? log[d] : [];
      const next = Array.isArray(arr) ? arr : [];
      const byLesson = {};
      [...prev, ...next].forEach(e => { if (!e) return; const cur = byLesson[e.lesson]; byLesson[e.lesson] = cur ? { ...cur, ...e, steps: { ...(cur.steps || {}), ...(e.steps || {}) }, minutes: Math.max(cur.minutes || 0, e.minutes || 0), done: !!(cur.done || e.done) } : e; });
      log[d] = Object.values(byLesson);
    }
    return { ...base, ...over, completed: { ...(base.completed || {}), ...(over.completed || {}) }, weak: { ...(base.weak || {}), ...(over.weak || {}) }, log };
  }
  if (kind === 'speaking') { const o = { ...base }; for (const [d, arr] of Object.entries(over)) { o[d] = Array.isArray(arr) ? arr : o[d]; } return o; }
  if (kind === 'usage') {
    const o = clone(base);
    for (const [d, day] of Object.entries(over)) { o[d] = o[d] || {}; for (const [m, v] of Object.entries(day || {})) { const b = o[d][m] || { in: 0, out: 0, calls: 0 }; o[d][m] = { in: Math.max(b.in || 0, v.in || 0), out: Math.max(b.out || 0, v.out || 0), calls: Math.max(b.calls || 0, v.calls || 0) }; } }
    return o;
  }
  return { ...base, ...over };
}
function withTimeout(p, ms, fallback) {
  return new Promise(resolve => { let done = false; const t = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms); Promise.resolve(p).then(v => { if (!done) { done = true; clearTimeout(t); resolve(v); } }, () => { if (!done) { done = true; clearTimeout(t); resolve(fallback); } }); });
}
/** Dizin listesi alınamazsa plan ve tarihlerden aday kimlikler üret. */
function candidateIds(dir) {
  const ids = new Set();
  const p = plan();
  for (const c of p.courses || []) for (const u of c.units || []) { (u.lessons || []).forEach(l => ids.add(l.id)); if (u.exam_id) ids.add(u.exam_id); }
  if (dir === 'lessons' || dir === 'exams') {
    const start = (p.courses?.[0]?.start_date) || S.main.startedAt || todayStr();
    let d = start; const end = addDays(todayStr(), 8); let guard = 0;
    while (d <= end && guard++ < 400) { const wd = weekday(d); if (wd === 6) ids.add('spk-' + d); if (wd === 0) ids.add('rev-' + d); d = addDays(d, 1); }
  }
  return [...ids];
}
const DB = {
  timers: {}, warned: false,
  loadLocal() {
    for (const k of Object.keys(DOCS)) { const v = Store.cached(DOCS[k]); if (v) S[k] = mergeDoc(k, S[k], v); }
    const pl = Store.cached('course/plan'); if (pl && pl.courses) S.plan = pl;
    const idx = LS.get('index') || {};
    for (const [coll, ids] of Object.entries(idx)) { const o = {}; (ids || []).forEach(id => { const d = Store.cached(coll + '/' + id); if (d) o[id] = d; }); if (Object.keys(o).length) S[coll] = o; }
    if (Object.keys(S.lessons).length) S.lessonsState = 'local';
  },
  saveIndex() { LS.set('index', { lessons: Object.keys(S.lessons), homework: Object.keys(S.homework), grades: Object.keys(S.grades), exams: Object.keys(S.exams) }); },
  async loadColl(coll, fresh) {
    let ids = await Store.list(coll);
    let listed = true;
    if (ids === null) { ids = candidateIds(coll); listed = false; }
    const known = new Set(ids);
    const results = await Promise.all(ids.map(async id => [id, await Store.get(coll + '/' + id, { fresh })]));
    const o = {};
    results.forEach(([id, d]) => { if (d) o[id] = d; });
    // listelemede olmayan ama yerelde duran belgeler (ör. kuyruktaki ödev) kaybolmasın
    for (const [id, d] of Object.entries(S[coll] || {})) if (!known.has(id) && Store.queued(coll + '/' + id)) o[id] = d;
    S[coll] = o;
    return listed;
  },
  async init(fresh = true) {
    this.loadLocal();
    S.dbState = 'loading';
    const t0 = Date.now();
    const progress = Promise.all(Object.keys(DOCS).map(async k => {
      const v = await Store.get(DOCS[k], { fresh });
      if (v) S[k] = mergeDoc(k, v, Store.queued(DOCS[k]) ? S[k] : {}); // uzak + yerel (kuyruk) birleşimi
    }));
    const planP = Store.get('course/plan', { fresh }).then(p => { if (p && p.courses) S.plan = p; });
    const lessonsP = this.loadColl('lessons', fresh).then(ok => { S.lessonsState = Object.keys(S.lessons).length ? (ok ? 'ok' : 'local') : 'empty'; });
    await withTimeout(Promise.all([progress, planP, lessonsP, this.loadColl('homework', fresh), this.loadColl('grades', fresh), this.loadColl('exams', fresh)]), 20000, null);
    this.saveIndex();
    if (Store.lastError && Date.now() - t0 >= 0) S.dbState = (S.online ? 'stale' : 'offline'); else S.dbState = Store.hasToken() ? 'ok' : 'pages';
    S.main.streak = computeStreak();
    // kuyrukta kalan yazmalar
    if (Store.hasToken() && Store.queueCount()) Store.flush().then(n => { if (n) toast(`${n} bekleyen kayıt GitHub'a yazıldı.`); });
  },
  async loadLesson(id) {
    if (S.lessons[id]) return S.lessons[id];
    const d = await Store.get('lessons/' + id, { fresh: true });
    if (d) { S.lessons[id] = d; this.saveIndex(); }
    return d;
  },
  /** İlerleme belgesi: önbelleğe hemen, depoya 2.5 sn sonra (ardışık cevaplar tek commit olur). */
  save(k, immediate = false) {
    const path = DOCS[k];
    Store.put(path, S[k]); Store.markQueued(path);
    clearTimeout(this.timers[k]);
    const go = () => Store.set(path, clone(S[k]));
    if (immediate) return go();
    this.timers[k] = setTimeout(go, 2500);
    return Promise.resolve();
  },
  flushAll() { for (const k of Object.keys(DOCS)) { if (this.timers[k]) { clearTimeout(this.timers[k]); this.timers[k] = null; if (Store.queued(DOCS[k])) Store.set(DOCS[k], clone(S[k])); } } Usage.flush(); },
  async writeDoc(path, data, into) {
    const id = path.split('/')[1];
    S[into][id] = data; this.saveIndex();
    const r = await Store.set(path, clone(data));
    return !!r.ok;
  },
};
Store.onChange(() => { if (S.tab === 'ayarlar' && !S.route) render(); });
window.addEventListener('online', () => { S.online = true; if (Store.hasToken() && Store.queueCount()) Store.flush(); });
window.addEventListener('offline', () => { S.online = false; });
window.addEventListener('pagehide', () => DB.flushAll());
document.addEventListener('visibilitychange', () => { if (document.hidden) { Sound.stop(); Sound.stopListening(); DB.flushAll(); } });

/* ============================================================
   Plan ve ders durumu
   ============================================================ */
function plan() { return S.plan || C?.plan || { courses: [], weekly: { mon_fri: 'lesson', sat: 'speaking_test', sun: 'review' } }; }
function flatLessons() {
  const out = [];
  for (const c of plan().courses || []) for (const u of c.units || []) for (const l of u.lessons || []) out.push({ ...l, unit: u, course: c, kind: 'lesson' });
  return out;
}
function planLesson(id) { return flatLessons().find(l => l.id === id) || null; }
function unitOf(courseId, unitN) { for (const c of plan().courses || []) if (c.id === courseId) return (c.units || []).find(u => u.n === unitN) || null; return null; }
const lessonDoc = id => S.lessons[id] || null;
function lessonsByType(type) { return Object.values(S.lessons).filter(l => l && l.type === type).sort((a, b) => String(a.date).localeCompare(String(b.date))); }
function docForToday() { const t = todayStr(); return Object.values(S.lessons).find(l => l && l.date === t && l.type === 'lesson') || null; }
function docsForDate(d) { return Object.values(S.lessons).filter(l => l && l.date === d); }
function latestLogFor(lessonId) {
  let best = null;
  for (const [date, arr] of Object.entries(S.main.log || {})) for (const e of (Array.isArray(arr) ? arr : [])) if (e && e.lesson === lessonId && (!best || date >= best.date)) best = { date, entry: e };
  return best;
}
function stepsFor(lessonId) { const l = latestLogFor(lessonId); return (l && l.entry.steps) || {}; }
function exCount(doc) { return (doc?.exercises || []).length; }
function stepDone(doc, stepId, steps) {
  steps = steps || stepsFor(doc.id);
  if (stepId === 'exercises') return exCount(doc) ? (steps.exercises || 0) >= exCount(doc) : !!steps.exercises;
  if (stepId === 'homework') return !!steps.homework || !!S.homework[doc.id];
  return !!steps[stepId];
}
const LESSON_STEPS = [
  { id: 'prev', label: 'Kontrol' }, { id: 'read', label: 'Konu' }, { id: 'vocab', label: 'Kelimeler' }, { id: 'listening', label: 'Dinleme' },
  { id: 'exercises', label: 'Alıştırma' }, { id: 'speaking', label: 'Konuşma' }, { id: 'homework', label: 'Ödev' }, { id: 'summary', label: 'Özet' },
];
function lessonProgress(doc) { const steps = stepsFor(doc.id); const ids = LESSON_STEPS.map(s => s.id); return { done: ids.filter(id => stepDone(doc, id, steps)).length, total: ids.length, steps }; }
function isLessonDone(doc, steps) { steps = steps || stepsFor(doc.id); return !!steps.read && stepDone(doc, 'exercises', steps) && !!steps.speaking && stepDone(doc, 'homework', steps); }
function homeworkSubmitted(id) { return !!S.homework[id]; }
function lessonStatus(pl) {
  const all = flatLessons();
  const i = all.findIndex(l => l.id === pl.id);
  const doc = lessonDoc(pl.id);
  if (S.main.completed[pl.id]) return 'done';
  if (!doc) return 'missing';
  const t = todayStr();
  const prev = i > 0 ? all[i - 1] : null;
  const prevOk = !prev || homeworkSubmitted(prev.id) || S.main.completed[prev.id];
  if (doc.date && doc.date > t) return 'locked';
  if (!prevOk) return 'locked';
  return doc.date === t ? 'today' : 'open';
}
function canOpenLesson(id) { const pl = planLesson(id); if (!pl) return !!lessonDoc(id); const st = lessonStatus(pl); return st === 'done' || st === 'today' || st === 'open'; }
function currentLessonId() {
  if (S.main.current && lessonDoc(S.main.current) && !S.main.completed[S.main.current]) return S.main.current;
  const open = flatLessons().filter(l => ['today', 'open'].includes(lessonStatus(l)));
  if (open.length) return open[0].id;
  const docs = lessonsByType('lesson').filter(l => !S.main.completed[l.id]);
  return docs.length ? docs[0].id : null;
}
function ensureLogEntry(lessonId) {
  const today = todayStr();
  if (!S.main.log) S.main.log = {};
  if (!Array.isArray(S.main.log[today])) S.main.log[today] = [];
  let e = S.main.log[today].find(x => x && x.lesson === lessonId);
  if (!e) {
    const prev = latestLogFor(lessonId);
    e = { lesson: lessonId, steps: prev && !prev.entry.done ? clone(prev.entry.steps || {}) : {}, minutes: 0, done: false };
    S.main.log[today].push(e);
  }
  if (!S.main.startedAt) S.main.startedAt = today;
  S.main.lastActiveDate = today;
  return e;
}
function computeStreak() {
  const set = new Set();
  Object.entries(S.main.log || {}).forEach(([d, arr]) => { if ((arr || []).some(e => e && e.done)) set.add(d); });
  Object.values(S.main.completed || {}).forEach(c => { if (c && c.date) set.add(c.date); });
  Object.values(S.exams || {}).forEach(x => { if (x && x.date) set.add(x.date); });
  const today = todayStr();
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
function bumpMinutes(entry) { const mins = Math.min(30, Math.round((Date.now() - S.stepStart) / 60000)); S.stepStart = Date.now(); entry.minutes = (entry.minutes || 0) + mins; }
function markStep(doc, stepId, value) {
  const e = ensureLogEntry(doc.id);
  const prev = e.steps[stepId];
  if (typeof value === 'number') e.steps[stepId] = Math.max(prev || 0, value); else e.steps[stepId] = value;
  bumpMinutes(e);
  if (doc.type === 'lesson') {
    S.main.current = doc.id;
    if (!e.done && isLessonDone(doc, e.steps)) {
      e.done = true;
      const pg = S.page && S.page.id === doc.id ? S.page : null;
      S.main.completed[doc.id] = {
        date: todayStr(), exercise_score: pg ? pg.scores.exercises : (e.steps.exercises_ok || 0), exercise_max: exCount(doc),
        prev_quiz: pg ? pg.scores.prev : 0, speaking_turns: pg ? pg.scores.speakingTurns : 0, minutes: e.minutes || 0,
      };
      const all = flatLessons(); const i = all.findIndex(l => l.id === doc.id);
      if (i >= 0 && all[i + 1]) S.main.current = all[i + 1].id;
    }
  }
  S.main.streak = computeStreak();
  DB.save('main');
  renderTabs();
}
function markWeak(topicIds, n = 1) { (topicIds || []).forEach(t => { if (t) S.main.weak[t] = (S.main.weak[t] || 0) + n; }); }

/* Kelime SRS (Leitner 1-5: 1,3,7,14,30 gün) */
const INTERVALS = [1, 3, 7, 14, 30];
function vocabEntry(id) { return S.vocab[id] || { box: 0, due: todayStr(), seen: 0, wrong: 0 }; }
function addVocab(ids, src) {
  let changed = false;
  ids.forEach(id => { if (!S.vocab[id]) { S.vocab[id] = { box: 1, due: addDays(todayStr(), 1), seen: 0, wrong: 0, src }; changed = true; } });
  if (changed) DB.save('vocab');
  return changed;
}
function gradeVocab(id, known) {
  const e = { ...vocabEntry(id) };
  e.seen = (e.seen || 0) + 1;
  if (known) e.box = Math.min(5, (e.box || 0) + 1); else { e.box = 1; e.wrong = (e.wrong || 0) + 1; }
  e.due = addDays(todayStr(), INTERVALS[e.box - 1] || 1);
  S.vocab[id] = e;
  DB.save('vocab');
}
function wordInfo(id) {
  const p = poolById(id); if (p) return p;
  for (const l of Object.values(S.lessons)) { const w = (l?.vocab || []).find(v => v.id === id); if (w) return w; }
  return null;
}
function dueVocab() { const t = todayStr(); return Object.entries(S.vocab).filter(([id, e]) => wordInfo(id) && e.box > 0 && e.due <= t).map(([id]) => id); }
function vocabStatus(id) { const b = S.vocab[id]?.box || 0; return b >= 4 ? 'known' : b >= 1 ? 'learn' : 'new'; }

/* ============================================================
   Yönlendirme ve kabuk
   ============================================================ */
const TABS = [
  { id: 'bugun', label: 'Bugün', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' },
  { id: 'dersler', label: 'Dersler', icon: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/><path d="M9 8h7M9 11.5h5"/></svg>' },
  { id: 'konus', label: 'Konuş', icon: '<svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 4v-4H6a2 2 0 0 1-2-2z"/></svg>' },
  { id: 'kaynaklar', label: 'Kaynaklar', icon: '<svg viewBox="0 0 24 24"><path d="M4 4h5v16H4zM10 4h5v16h-5zM16.5 5l4 1-3.5 14-4-1z"/></svg>' },
  { id: 'karne', label: 'Karne', icon: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>' },
];
const ALL_TABS = [...TABS.map(t => t.id), 'ayarlar'];
let handlers = {};
function setHash(h) { try { if (location.hash !== '#' + h) history.replaceState(null, '', '#' + h); } catch (e) { /* yoksay */ } }
function go(tab, sub = null) {
  Chat.stopAll(); Sound.stop(); Sound.abortListening();
  S.tab = tab; S.sub = sub; S.route = null; S.page = null;
  if (tab !== 'ayarlar') LS.set('tab', tab);
  setHash('tab-' + tab);
  render();
  window.scrollTo({ top: 0 });
}
function openRoute(kind, id) {
  Chat.stopAll(); Sound.stop(); Sound.abortListening();
  S.route = { kind, id }; S.page = null; S.tab = 'dersler';
  setHash(kind + '-' + id);
  render();
  window.scrollTo({ top: 0 });
}
function applyHash() {
  const h = location.hash.replace('#', '');
  let m;
  if ((m = h.match(/^tab-([a-z]+)$/)) && ALL_TABS.includes(m[1])) { if (S.route || S.tab !== m[1]) go(m[1]); return true; }
  if ((m = h.match(/^(lesson|exam)-([a-z0-9-]+)$/))) { if (!S.route || S.route.id !== m[2]) openRoute(m[1], m[2]); return true; }
  return false;
}
window.addEventListener('hashchange', applyHash);
function renderTabs() {
  const due = dueVocab().length;
  const el = $('#tabs'); if (!el) return;
  el.innerHTML = TABS.map(t => `<button class="tab ${S.tab === t.id ? 'on' : ''}" data-tab="${t.id}" aria-label="${t.label}" ${S.tab === t.id ? 'aria-current="page"' : ''}>${t.icon}<span>${t.label}</span>${t.id === 'kaynaklar' && due ? '<i class="dot" aria-hidden="true"></i>' : ''}</button>`).join('');
}
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { go(tab.dataset.tab); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = handlers[el.dataset.act];
  if (typeof fn === 'function') {
    try { const r = fn(el, e); if (r && r.catch) r.catch(err => { console.error(err); toast('İşlem tamamlanamadı.'); }); }
    catch (err) { console.error(err); toast('İşlem tamamlanamadı.'); }
  }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-say]');
  if (b && !b.closest('[data-act]')) Sound.speak(b.dataset.say, b, b.dataset.slow ? 0.65 : undefined);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  if (handlers[f.dataset.form]) handlers[f.dataset.form](f);
});
function commonHandlers() {
  handlers['rate-normal'] = () => { Sound.slow = false; $$('.rate').forEach(r => { r.children[0].classList.add('on'); r.children[1].classList.remove('on'); }); };
  handlers['rate-slow'] = () => { Sound.slow = true; $$('.rate').forEach(r => { r.children[1].classList.add('on'); r.children[0].classList.remove('on'); }); };
  handlers['open-lesson'] = el => openRoute('lesson', el.dataset.id);
  handlers['open-exam'] = el => openRoute('exam', el.dataset.id);
  handlers['to-tab'] = el => go(el.dataset.tab, el.dataset.sub || null);
  handlers['go-review'] = () => go('kaynaklar', 'srs');
  handlers['go-settings'] = () => go('ayarlar');
  handlers['dismiss-install'] = () => { Settings.set('installHintDismissed', true); render(); };
}
const settingsWarn = () => (!AI.ready() || !Store.hasToken() || Store.queueCount() > 0);
const topline = (right = '') => `<div class="topline"><span class="brand"><i aria-hidden="true"></i>İngilizce Koçu</span><span class="right">${right}<button class="gear ${settingsWarn() ? 'warn' : ''}" data-act="go-settings" aria-label="Ayarlar">${ico('gear')}</button></span></div>`;
const streakHtml = () => `<span class="streak" title="Ardışık çalışılan gün">${ico('flame')} <b>${S.main.streak || 0}</b> gün</span>`;
const dbNote = () => {
  if (S.dbState === 'stale' || S.dbState === 'offline') return `<div class="banner info">${S.online ? 'Depoya henüz ulaşılamadı; gördüğün ilerleme eski olabilir.' : 'İnternet yok; ilerleme bu cihazda saklanıyor, bağlanınca yazılır.'}</div>`;
  if (!Store.hasToken() && Store.queueCount()) return `<div class="banner info">${Store.queueCount()} kayıt henüz senkronize edilmedi. <button class="btn small ghost" data-act="go-settings">GitHub anahtarını gir</button></div>`;
  return '';
};
const sectionTitle = t => `<div class="section-title">${t}</div>`;
function pageTitle(tr, en) { return `<div><h2 style="font-family:var(--font-display);font-size:1.6rem">${esc(tr)}</h2>${en ? `<div class="muted" style="font-family:var(--font-display);font-style:italic">${esc(en)}</div>` : ''}</div>`; }
const NO_CLAUDE = 'Claude anahtarı yok. Konuşma bölümleri Ayarlar\'dan anahtar girilince açılır.';
const keyCard = (msg) => `<div class="keycard"><div class="en">Let's talk — soon.</div><p class="muted">${esc(msg || 'Konuşma pratiği için Ayarlar\'dan Claude anahtarını gir.')}</p><button class="btn primary small" data-act="go-settings">${ico('gear')} Ayarlar'a git</button></div>`;

/* ============================================================
   Soru motoru
   ============================================================ */
const QKIND = { choice: 'Seç', fill: 'Boşluk doldur', order: 'Sırala', translate: 'Çevir', listen: 'Dinle ve yaz', speak: 'Dinle ve söyle', match: 'Eşleştir', correct: 'Hatayı düzelt', free: 'Serbest yazı' };
const Quiz = {
  create(cfg) {
    const q = { key: uid('q'), cfg, i: cfg.startAt || 0, results: [], cur: null, built: [], picked: null, checking: false, given: '', match: null, heard: '', pct: null, listening: false, msg: '', interim: '', finished: false, startedAt: Date.now(), timeLeft: cfg.timerSec || 0, timer: null };
    if (q.i >= cfg.questions.length) q.finished = true;
    return q;
  },
  destroy(q) { if (q.timer) { clearInterval(q.timer); q.timer = null; } },
  score(q) { return q.results.filter(r => r && r.ok).length; },
  html(q) {
    const qs = q.cfg.questions;
    if (q.finished) return Quiz.doneHtml(q);
    const cur = qs[q.i]; const k = q.key; const r = q.cur;
    const locked = !!r;
    let body = '';
    const kind = QKIND[cur.type] || 'Soru';
    if (cur.type === 'choice') {
      body = `<div class="q en">${esc(cur.q)}</div><div class="opts">${cur.options.map(o => {
        let cls = '';
        if (r) { if (sameAnswer(o, cur.answer, cur.alt)) cls = 'right'; else if (o === q.picked) cls = 'wrong'; else cls = 'dim'; }
        return `<button class="opt ${cls}" data-act="${k}-answer" data-v="${esc(o)}" ${locked ? 'disabled' : ''}>${esc(o)}</button>`; }).join('')}</div>`;
    } else if (cur.type === 'fill') {
      body = `<div class="q en">${esc(cur.q)}</div><form data-form="${k}-check"><input class="input" id="${k}-ans" type="text" autocomplete="off" autocapitalize="off" placeholder="Boşluğu doldur" ${locked ? 'disabled' : ''} value="${esc(q.given)}"></form>`;
    } else if (cur.type === 'order') {
      const words = cur.words;
      body = `<p class="muted">Kelimeleri doğru sıraya koy.</p>
        <div class="built">${q.built.map(i => `<button class="chip" data-act="${k}-rm" data-i="${i}" ${locked ? 'disabled' : ''}>${esc(words[i])}</button>`).join('')}</div>
        <div class="chips">${words.map((w, i) => `<button class="chip ${q.built.includes(i) ? 'ghosted' : ''}" data-act="${k}-add" data-i="${i}" ${locked ? 'disabled' : ''}>${esc(w)}</button>`).join('')}</div>`;
    } else if (cur.type === 'translate') {
      body = `<p class="muted">İngilizceye çevir:</p><div class="q" style="font-weight:600">${esc(cur.q)}</div><form data-form="${k}-check"><input class="input" id="${k}-ans" type="text" autocomplete="off" autocapitalize="sentences" placeholder="İngilizcesini yaz" ${locked ? 'disabled' : ''} value="${esc(q.given)}"></form>`;
    } else if (cur.type === 'listen') {
      body = `<p class="muted">${esc(cur.q || 'Dinle, duyduğunu yaz.')}</p>
        <div class="row">${sayBtn(cur.say)}<button class="btn small ghost" data-say="${esc(cur.say)}" data-slow="1">Yavaş dinle</button></div>
        <form data-form="${k}-check"><input class="input" id="${k}-ans" type="text" autocomplete="off" autocapitalize="sentences" placeholder="Duyduğunu yaz…" ${locked ? 'disabled' : ''} value="${esc(q.given)}"></form>`;
    } else if (cur.type === 'speak') {
      body = `<p class="muted">${esc(cur.q || 'Dinle ve tekrar et.')}</p>
        <div class="row between" style="align-items:flex-start"><div class="en" style="flex:1;min-width:0;font-size:1.5rem">${esc(cur.say)}</div>${sayBtn(cur.say)}</div>
        ${locked ? '' : micBigHtml(k, { listening: q.listening, msg: q.msg, interim: q.listening ? q.interim : (q.heard || '') })}
        ${q.pct != null && !r ? `<div class="verdict ${q.pct >= 70 ? 'ok' : 'no'}"><div class="row between"><span class="pct">%${q.pct}</span><b>${q.pct >= 70 ? 'İyi!' : 'Bir daha dene'}</b></div><div class="expl"><span class="heard">${esc(q.heard)}</span></div></div>` : ''}`;
    } else if (cur.type === 'match') {
      if (!q.match) q.match = { left: shuffle(cur.pairs.map((p, i) => ({ t: p[0], i }))), right: shuffle(cur.pairs.map((p, i) => ({ t: p[1], i }))), selL: null, selR: null, done: new Set(), wrong: 0 };
      const m = q.match;
      body = `<p class="muted">Soldaki kelimeyi sağdaki anlamıyla eşleştir.</p>
        <div class="match"><div class="col">${m.left.map(x => `<button class="opt ${m.done.has(x.i) ? 'ok' : (m.selL === x.i ? 'sel' : '')}" data-act="${k}-ml" data-i="${x.i}">${esc(x.t)}</button>`).join('')}</div>
        <div class="col tr">${m.right.map(x => `<button class="opt ${m.done.has(x.i) ? 'ok' : (m.selR === x.i ? 'sel' : '')}" data-act="${k}-mr" data-i="${x.i}">${esc(x.t)}</button>`).join('')}</div></div>`;
    } else if (cur.type === 'correct') {
      body = `<p class="muted">Bu cümlede bir hata var. Doğrusunu yaz:</p><div class="q en" style="color:var(--bad)">${esc(cur.q)}</div><form data-form="${k}-check"><input class="input" id="${k}-ans" type="text" autocomplete="off" autocapitalize="sentences" placeholder="Doğru cümleyi yaz" ${locked ? 'disabled' : ''} value="${esc(q.given)}"></form>`;
    } else if (cur.type === 'free') {
      const wc = wordCount(q.given);
      body = `<div class="q" style="font-weight:600">${esc(cur.q)}</div>
        <textarea class="input" id="${k}-ans" rows="3" placeholder="İngilizce yaz…" ${locked ? 'disabled' : ''}>${esc(q.given)}</textarea>
        <div class="row between"><span class="counter ${wc >= (cur.min_words || 1) ? 'ok' : ''}" id="${k}-wc">${wc} / ${cur.min_words || 1} kelime</span>${!aiReady() ? `<span class="hint">Claude anahtarı yok: cevabın kaydedilir, puanlanmaz.</span>` : ''}</div>`;
    }
    const verdict = r ? `<div class="verdict ${r.ok ? 'ok' : 'no'}"><b>${r.ok ? `<span class="tick">${ico('check')}</span>${pick(PRAISE)}` : (cur.type === 'free' ? 'Değerlendirme' : 'Doğrusu şöyle:')}</b>
        <div class="expl">${cur.type === 'free' ? '' : `<span class="en">${esc(cur.answer || cur.say || '')}</span><br>`}${r.note ? esc(r.note) : (cur.why_tr ? esc(cur.why_tr) : '')}${r.corrected ? `<br><span class="en">${esc(r.corrected)}</span>` : ''}</div></div>` : '';
    const needsCheck = ['fill', 'translate', 'listen', 'correct', 'free', 'order'].includes(cur.type);
    const skipSpeak = cur.type === 'speak' && !r;
    return `<div class="qbox" id="${k}">
      <div class="qhead"><span class="kind">${kind}</span><span class="count">${q.i + 1} / ${qs.length}${q.cfg.timerSec ? ` · <span class="timer ${q.timeLeft < 60 ? 'low' : ''}" id="${k}-timer">${Quiz.fmtTime(q.timeLeft)}</span>` : ''}</span></div>
      ${body}${verdict}
      <div class="row end">
        ${r ? `<button class="btn primary" data-act="${k}-next">${q.i + 1 >= qs.length ? 'Bitir' : 'Sonraki'}</button>`
          : (needsCheck ? `<button class="btn primary" data-act="${k}-check" ${q.checking ? 'disabled' : ''}>${q.checking ? 'kontrol ediliyor…' : 'Kontrol et'}</button>`
          : (skipSpeak ? `${q.pct != null && q.pct < 70 ? `<button class="btn ghost" data-act="${k}-retry">Tekrar söyle</button>` : ''}<button class="btn ${q.pct != null && q.pct >= 70 ? 'primary' : 'soft'}" data-act="${k}-said">${q.pct != null ? 'Sonraki' : 'Söyledim, sonraki'}</button>` : ''))}
      </div></div>`;
  },
  fmtTime(s) { s = Math.max(0, s | 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  doneHtml(q) {
    const qs = q.cfg.questions; const ok = Quiz.score(q);
    const wrongs = q.results.map((r, i) => ({ r, i, qq: qs[i] })).filter(x => x.r && !x.r.ok);
    return `<div class="qbox"><div class="qdone">
      <div class="pct">${ok}/${qs.length}</div><p class="muted">${q.cfg.doneText || (ok === qs.length ? 'Hepsi doğru.' : `${wrongs.length} soru yanlış.`)}</p>
      ${wrongs.length ? `<ul class="wronglist">${wrongs.map(x => `<li><span class="en">${esc(x.qq.q || x.qq.say || (x.qq.words || []).join(' '))}</span><br><span class="muted">→ ${esc(x.qq.answer || '')}${x.qq.why_tr ? ' · ' + esc(x.qq.why_tr) : ''}</span>${x.r.note && x.qq.type === 'free' ? `<br>${esc(x.r.note)}` : ''}</li>`).join('')}</ul>` : ''}
      ${q.cfg.doneLabel ? `<button class="btn primary" data-act="${q.key}-done">${esc(q.cfg.doneLabel)}</button>` : ''}
    </div></div>`;
  },
  bind(q, rerender) {
    const k = q.key, qs = q.cfg.questions, cur = qs[q.i];
    const refresh = () => rerender();
    const finish = (ok, note, corrected, score) => {
      q.cur = { ok, note: note || '', corrected: corrected || '', score };
      q.results[q.i] = q.cur;
      if (!ok) markWeak(q.cfg.topicIds);
      if (q.cfg.onAnswer) q.cfg.onAnswer(ok, cur, q);
      if (q.cfg.silent) { handlers[`${k}-next`](); return; }
      refresh();
    };
    handlers[`${k}-done`] = () => { if (q.cfg.onDone) q.cfg.onDone({ ok: Quiz.score(q), total: qs.length, results: q.results }); };
    if (q.finished) return;
    handlers[`${k}-next`] = () => {
      Sound.abortListening();
      q.i++; q.cur = null; q.built = []; q.picked = null; q.given = ''; q.match = null; q.heard = ''; q.pct = null; q.msg = ''; q.interim = ''; q.listening = false;
      if (q.i >= qs.length) { q.finished = true; Quiz.destroy(q); if (q.cfg.onFinish) q.cfg.onFinish({ ok: Quiz.score(q), total: qs.length, results: q.results }); }
      refresh();
    };
    handlers[`${k}-answer`] = el => { if (q.cur) return; q.picked = el.dataset.v; finish(sameAnswer(q.picked, cur.answer, cur.alt)); };
    handlers[`${k}-add`] = el => { if (q.cur) return; const i = Number(el.dataset.i); if (!q.built.includes(i)) { q.built.push(i); refresh(); } };
    handlers[`${k}-rm`] = el => { if (q.cur) return; q.built = q.built.filter(x => x !== Number(el.dataset.i)); refresh(); };
    handlers[`${k}-said`] = () => finish(q.pct == null ? true : q.pct >= 70, q.pct == null ? 'Söylediğini varsaydık.' : '');
    handlers[`${k}-retry`] = () => { q.heard = ''; q.pct = null; q.msg = ''; refresh(); handlers[`${k}-micstart`](); };
    handlers[`${k}-micstart`] = () => {
      if (q.listening || q.cur) return;
      q.heard = ''; q.pct = null; q.msg = ''; q.interim = ''; q.listening = true; micPatch(k, { listening: true, interim: '' });
      Sound.listen({
        onInterim: t => { q.interim = t; micPatch(k, { listening: true, interim: t }); },
        onFinal: t => { q.heard = t; q.pct = similarity(t, cur.say); },
        onError: code => { q.msg = micMsg(code); q.listening = false; refresh(); },
        onEnd: () => { if (q.listening) { q.listening = false; if (!q.heard && !q.msg) q.msg = MIC_MSG['no-speech']; refresh(); } },
      });
    };
    handlers[`${k}-micstop`] = () => Sound.stopListening();
    handlers[`${k}-ml`] = el => { const m = q.match; const i = Number(el.dataset.i); m.selL = m.selL === i ? null : i; Quiz.tryMatch(q, finish); refresh(); };
    handlers[`${k}-mr`] = el => { const m = q.match; const i = Number(el.dataset.i); m.selR = m.selR === i ? null : i; Quiz.tryMatch(q, finish); refresh(); };
    handlers[`${k}-check`] = async () => {
      if (q.cur || q.checking) return;
      const given = cur.type === 'order' ? q.built.map(i => cur.words[i]).join(' ') : ($(`#${k}-ans`)?.value || '').trim();
      if (!normalize(given)) { toast('Önce bir cevap yaz.'); return; }
      q.given = given;
      if (cur.type === 'free') {
        if (wordCount(given) < (cur.min_words || 1)) { toast(`En az ${cur.min_words} kelime yaz.`); return; }
        if (!aiReady()) return finish(true, 'Claude anahtarı yok; cevabın kabul edildi.');
        q.checking = true; refresh();
        try {
          const r = await AI.json(
            `You grade a short free-writing answer by a Turkish A1 English learner. Task (Turkish): "${cur.q}". Grading focus (Turkish): "${cur.rubric_tr || ''}". Learner wrote: "${given}". Reply with only JSON: {"ok": true if acceptable for A1 with at most one small error, "score": 0-10, "feedback_tr": "one or two short warm Turkish sentences, name the main error if any", "corrected_en": "the corrected English text"}`,
            { tier: 'default', maxTokens: 400 });
          q.checking = false;
          if (r && typeof r === 'object') return finish(!!r.ok, String(r.feedback_tr || ''), String(r.corrected_en || ''), Number(r.score) || 0);
          return finish(true, 'Değerlendirme alınamadı; cevabın kabul edildi.');
        } catch (e) { q.checking = false; toast(aiMessage(e)); return finish(true, 'Değerlendirme alınamadı; cevabın kabul edildi.'); }
      }
      if (sameAnswer(given, cur.answer, cur.alt)) return finish(true);
      if (cur.type === 'listen' && similarity(given, cur.answer) >= 92) return finish(true);
      if ((cur.type === 'translate' || cur.type === 'correct') && aiReady()) {
        q.checking = true; refresh();
        try {
          const r = await AI.json(
            `You grade an A1 English learner. ${cur.type === 'translate' ? `Turkish sentence: "${cur.q}". Expected English: "${cur.answer}".` : `Sentence with an error: "${cur.q}". Expected correction: "${cur.answer}".`} Learner wrote: "${given}". Is the learner's sentence an acceptable, grammatical English sentence with the same meaning? Minor punctuation or capitalization differences are fine; a missing article, wrong verb form or wrong word is not. Reply with only JSON: {"ok": true or false, "note_tr": "one short sentence in Turkish explaining why"}`,
            { tier: 'quick', maxTokens: 200 });
          q.checking = false;
          if (r && typeof r.ok === 'boolean') return finish(r.ok, r.note_tr || '');
          return finish(false);
        } catch (e) { q.checking = false; toast(aiMessage(e)); return finish(false); }
      }
      finish(false);
    };
    const ta = $(`#${k}-ans`);
    if (ta && cur.type === 'free') ta.addEventListener('input', () => { q.given = ta.value; const c = $(`#${k}-wc`); if (c) { const wc = wordCount(ta.value); c.textContent = `${wc} / ${cur.min_words || 1} kelime`; c.classList.toggle('ok', wc >= (cur.min_words || 1)); } });
    if (q.cfg.timerSec && !q.timer) {
      q.timer = setInterval(() => {
        q.timeLeft--; const t = $(`#${k}-timer`); if (t) { t.textContent = Quiz.fmtTime(q.timeLeft); t.classList.toggle('low', q.timeLeft < 60); }
        if (q.timeLeft <= 0) { Quiz.destroy(q); q.finished = true; toast('Süre doldu.'); if (q.cfg.onFinish) q.cfg.onFinish({ ok: Quiz.score(q), total: qs.length, results: q.results, timeout: true }); refresh(); }
      }, 1000);
    }
  },
  tryMatch(q, finish) {
    const m = q.match; const cur = q.cfg.questions[q.i];
    if (m.selL == null || m.selR == null) return;
    if (m.selL === m.selR) m.done.add(m.selL); else m.wrong++;
    m.selL = null; m.selR = null;
    if (m.done.size === cur.pairs.length) finish(m.wrong <= 1, m.wrong ? `${m.wrong} yanlış deneme.` : 'Hepsini ilk denemede eşleştirdin.');
  },
};

/* ============================================================
   Sohbet motoru — sesli kullanım için: büyük mikrofon, otomatik seslendirme, "yazayım" seçeneği
   ============================================================ */
const Chat = {
  active: null,
  stopAll() { if (this.active) this.active.stop(); },
  create(cfg) {
    const chat = {
      key: uid('ch'), turns: [], msgs: [], streaming: false, ctl: null, userTurns: 0, listening: false, micMsg: '', interim: '', finished: false, feedback: null, gettingFeedback: false, errorMsg: '', typing: !Sound.canListen(), cfg,
      stop() { try { this.ctl?.abort(); } catch (e) { /* yoksay */ } Sound.abortListening(); Sound.stop(); this.listening = false; },
    };
    if (cfg.opener) { chat.turns.push({ role: 'assistant', content: cfg.opener }); chat.msgs.push({ role: 'ai', en: cfg.opener, tr: '' }); }
    this.active = chat;
    return chat;
  },
  html(chat) {
    const c = chat.cfg, k = chat.key;
    const hits = (c.targets || []).map(t => { const stem = normalize(t.replace(/\.{3}|…/g, '')).trim(); return { t, hit: stem && chat.msgs.some(m => m.role === 'me' && normalize(m.en).includes(stem)) }; });
    const dead = !aiReady();
    const remaining = Math.max(0, (c.minTurns || 0) - chat.userTurns);
    const canMic = Sound.canListen();
    return `<div class="chat" id="${k}">
      ${c.scenarioHtml ? `<div class="scenario">${c.scenarioHtml}${hits.length ? `<div class="targets">${hits.map(h => `<span class="${h.hit ? 'hit' : ''}">${esc(h.t)}</span>`).join('')}</div>` : ''}</div>` : ''}
      ${dead ? keyCard() : ''}
      <div class="msgs" id="${k}-msgs">${chat.msgs.map(m => Chat.msgHtml(m)).join('')}${chat.streaming && !chat.msgs[chat.msgs.length - 1]?.partial ? `<div class="thinking"><i></i> düşünüyor…</div>` : ''}</div>
      ${chat.errorMsg ? `<div class="banner bad">${esc(chat.errorMsg)}</div>` : ''}
      ${chat.feedback ? Chat.feedbackHtml(chat.feedback) : ''}
      ${!chat.finished && !dead ? `
      ${!chat.typing && canMic ? micBigHtml(k, { listening: chat.listening, msg: chat.micMsg, interim: chat.interim, disabled: chat.streaming }, { extra: `<div class="micopts"><button class="btn ghost" data-act="${k}-type">${ico('pen')} Yazayım</button>${chat.streaming ? `<button class="btn ghost" data-act="${k}-stop">${ico('stop')} Durdur</button>` : (chat.msgs.length && chat.msgs[chat.msgs.length - 1].role === 'ai' ? `<button class="btn ghost" data-act="${k}-replay">${ico('speaker')} Tekrar dinle</button>` : '')}</div>` }) : `
      <div class="micline" id="${k}-micline">${esc(chat.micMsg || '')}</div>
      <div class="composer">
        ${canMic ? `<button class="iconbtn ${chat.listening ? 'live' : ''}" data-act="${k}-voice" aria-label="Sesle söyle">${ico('mic')}</button>` : ''}
        <textarea class="input" id="${k}-in" rows="1" placeholder="İngilizce yaz…" ${chat.streaming ? 'disabled' : ''}></textarea>
        ${chat.streaming ? `<button class="btn soft" data-act="${k}-stop">Durdur</button>` : `<button class="btn primary" data-act="${k}-send">Gönder</button>`}
      </div>`}
      <div class="row between">
        ${c.minTurns ? (remaining > 0 ? `<span class="hint">${remaining} cevap daha, sonra bitirebilirsin</span>` : `<button class="btn ghost" data-act="${k}-finish" ${chat.gettingFeedback || chat.streaming ? 'disabled' : ''}>${chat.gettingFeedback ? 'geri bildirim hazırlanıyor…' : (c.finishLabel || 'Bitir ve geri bildirim al')}</button>`) : (c.askMe ? `<button class="btn ghost small" data-act="${k}-ask" ${chat.streaming ? 'disabled' : ''}>Bana soru sor</button>` : '<span></span>')}
        ${c.hints?.length ? `<span class="hint">İpucu: ${esc(c.hints.join(' · '))}</span>` : ''}
      </div>` : ''}
    </div>`;
  },
  msgHtml(m) {
    if (m.role === 'me') return `<div class="msg me"><div class="bubble">${esc(m.en)}</div></div>`;
    return `<div class="msg ai">${m.tr ? `<div class="trnote">${esc(m.tr)}</div>` : ''}<div class="bubble"><span class="en">${esc(m.en)}${m.partial ? '…' : ''}</span>${m.en && !m.partial ? sayBtn(m.en, 'sm') : ''}</div></div>`;
  },
  feedbackHtml(f) {
    return `<div class="feedback fade-in"><b>Geri bildirim</b><p>${esc(f.feedback_tr || '')}</p>
      ${f.good?.length ? `<div><span class="hint">İyi kullandıkların</span><ul>${f.good.map(x => `<li><span class="en">${esc(x)}</span></li>`).join('')}</ul></div>` : ''}
      ${f.fix?.length ? `<div><span class="hint">Düzeltmeler</span><ul>${f.fix.map(x => `<li><code>${esc(x)}</code></li>`).join('')}</ul></div>` : ''}</div>`;
  },
  bind(chat, rerender) {
    const k = chat.key;
    const refresh = () => rerender();
    handlers[`${k}-send`] = () => { const ta = $(`#${k}-in`); const text = (ta?.value || '').trim(); if (!text) return; Chat.send(chat, text, refresh); };
    handlers[`${k}-stop`] = () => { chat.stop(); chat.streaming = false; refresh(); };
    handlers[`${k}-ask`] = () => Chat.send(chat, 'Please ask me a new simple question.', refresh, true);
    handlers[`${k}-type`] = () => { Sound.abortListening(); chat.listening = false; chat.typing = true; refresh(); const ta = $(`#${k}-in`); if (ta) ta.focus(); };
    handlers[`${k}-voice`] = () => { chat.typing = false; chat.micMsg = ''; refresh(); };
    handlers[`${k}-replay`] = () => { const last = [...chat.msgs].reverse().find(m => m.role === 'ai' && m.en); if (last) Sound.speak(last.en, $$(`#${k}-msgs .msg.ai .iconbtn`).pop()); };
    const start = () => {
      if (chat.listening || chat.streaming) return;
      Sound.stop();
      chat.listening = true; chat.micMsg = ''; chat.interim = '';
      micPatch(k, { listening: true, interim: '' });
      let finalText = '';
      Sound.listen({
        onInterim: t => { chat.interim = t; micPatch(k, { listening: true, interim: t }); },
        onFinal: t => { finalText = t; chat.interim = t; },
        onError: code => { chat.micMsg = micMsg(code); chat.listening = false; refresh(); },
        onEnd: () => {
          if (!chat.listening) return;
          chat.listening = false; chat.interim = '';
          if (finalText.trim()) Chat.send(chat, finalText.trim(), refresh);
          else { if (!chat.micMsg) chat.micMsg = MIC_MSG['no-speech']; refresh(); }
        },
      });
    };
    handlers[`${k}-micstart`] = start;
    handlers[`${k}-micstop`] = () => Sound.stopListening();
    handlers[`${k}-finish`] = () => Chat.finish(chat, refresh);
    const ta = $(`#${k}-in`);
    if (ta) {
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlers[`${k}-send`](); } });
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    }
    const msgs = $(`#${k}-msgs`); if (msgs) { const last = msgs.lastElementChild; if (last) last.scrollIntoView({ block: 'nearest' }); }
  },
  async send(chat, text, refresh, hidden = false) {
    if (chat.streaming) return;
    if (!aiReady()) { toast(AI_MSG.nokey); return; }
    chat.errorMsg = ''; chat.micMsg = '';
    chat.turns.push({ role: 'user', content: text });
    if (!hidden) { chat.msgs.push({ role: 'me', en: text }); chat.userTurns++; }
    const ai = { role: 'ai', en: '', tr: '', partial: true };
    chat.streaming = true; refresh();
    const ctl = new AbortController(); chat.ctl = ctl;
    const keep = chat.turns.slice(-20);
    let pushed = false;
    try {
      const { text: full } = await AI.chat(keep, {
        system: chat.cfg.rules, tier: 'quick', maxTokens: 200, signal: ctl.signal,
        onText: ({ text: t }) => { if (!pushed) { chat.msgs.push(ai); pushed = true; } const p = splitTR(t); ai.en = p.en; ai.tr = p.tr; refresh(); },
      });
      const p = splitTR(full); ai.en = p.en; ai.tr = chat.cfg.exam ? '' : p.tr; ai.partial = false;
      if (!pushed) { chat.msgs.push(ai); pushed = true; }
      chat.turns.push({ role: 'assistant', content: full });
      chat.streaming = false; refresh();
      if (ai.en && Settings.get('autoSpeak')) {
        const btn = $$(`#${chat.key}-msgs .msg.ai .iconbtn`).pop();
        Sound.speak(ai.en, btn, undefined, () => {
          // Otomatik ses: cevap okunup bitince mikrofonu aç (dokun modunda, yazma modunda değil)
          if (Settings.get('autoListen') && Settings.get('micMode') !== 'hold' && !chat.typing && !chat.finished && !chat.streaming && Chat.active === chat && Sound.canListen() && !document.hidden) {
            const fn = handlers[`${chat.key}-micstart`]; if (fn) fn();
          }
        });
      }
      if (chat.cfg.onTurn) chat.cfg.onTurn(chat);
    } catch (e) {
      chat.streaming = false;
      if (e && e.code === 'cancelled') {
        if (e.text) { const p = splitTR(e.text); ai.en = p.en; ai.tr = p.tr; ai.partial = false; chat.turns.push({ role: 'assistant', content: e.text }); if (!pushed) chat.msgs.push(ai); }
        else if (pushed) chat.msgs.pop();
      } else {
        if (pushed) chat.msgs.pop();
        chat.turns.pop(); if (!hidden) { chat.msgs.pop(); chat.userTurns--; }
        chat.errorMsg = aiMessage(e) || 'Yanıt alınamadı.';
        console.warn('claude', e);
      }
      refresh();
    } finally { if (chat.ctl === ctl) chat.ctl = null; }
  },
  transcript(chat) { return chat.msgs.map(m => (m.role === 'me' ? 'LEARNER: ' : 'TUTOR: ') + m.en).join('\n'); },
  async finish(chat, refresh) {
    if (chat.gettingFeedback) return;
    Sound.abortListening(); chat.listening = false;
    chat.gettingFeedback = true; chat.errorMsg = ''; refresh();
    if (chat.cfg.exam) {
      chat.finished = true; chat.gettingFeedback = false;
      if (chat.cfg.onFinish) chat.cfg.onFinish(null);
      refresh(); return;
    }
    let fb = null;
    if (aiReady()) {
      try {
        fb = await AI.json(
          'Below is a short English practice conversation between a Turkish A1 learner (LEARNER) and a tutor (TUTOR).' +
          (chat.cfg.targets?.length ? ' Target patterns for the learner: ' + chat.cfg.targets.join(' | ') + '.' : '') +
          '\n\n' + Chat.transcript(chat).slice(0, 6000) +
          '\n\nWrite feedback for the LEARNER in Turkish. Reply with only JSON: {"feedback_tr": "2-3 short, warm Turkish sentences: what went well and one thing to improve", "good": ["1-3 English phrases the learner used correctly"], "fix": ["1-3 corrections written as: wrong -> right"]}',
          { tier: 'default', maxTokens: 600 });
      } catch (e) { chat.errorMsg = aiMessage(e) || ''; }
    }
    if (!fb || typeof fb !== 'object') fb = { feedback_tr: 'Konuşmayı tamamladın. Geri bildirim bu sefer alınamadı; yine de güzel pratik oldu.', good: [], fix: [] };
    fb.good = Array.isArray(fb.good) ? fb.good.map(String) : [];
    fb.fix = Array.isArray(fb.fix) ? fb.fix.map(String) : [];
    chat.feedback = fb; chat.finished = true; chat.gettingFeedback = false;
    try {
      const d = todayStr();
      S.speaking[d] = [...(S.speaking[d] || []), { lesson: chat.cfg.lessonId || 'free', turns: chat.userTurns, feedback_tr: String(fb.feedback_tr || ''), errors: fb.fix }];
      DB.save('speaking');
    } catch (e) { console.warn(e); }
    if (chat.cfg.onFinish) chat.cfg.onFinish(fb);
    refresh();
  },
};
function mountChat(chat, boxId) {
  const box0 = $('#' + boxId); if (box0) box0.dataset.chat = chat.key;
  const rerender = () => { const box = $('#' + boxId); if (!box || box.dataset.chat !== chat.key) return; box.innerHTML = Chat.html(chat); Chat.bind(chat, rerender); };
  rerender();
  if (chat.msgs.length === 1 && !chat.msgs[0].said && Sound.unlocked && aiReady() && Settings.get('autoSpeak')) { chat.msgs[0].said = true; Sound.speak(chat.msgs[0].en, $(`#${chat.key}-msgs .iconbtn`)); }
  return rerender;
}

/* ============================================================
   Konu anlatımı bileşenleri (sections[])
   ============================================================ */
function exampleRows(items) {
  return `<div class="ex-list">${(items || []).map(ex => `<div class="ex"><div><div class="en">${esc(ex.en)}</div><div class="tr">${esc(ex.tr)}</div>${ex.note ? `<div class="note">${esc(ex.note)}</div>` : ''}</div>${sayBtn(ex.en)}</div>`).join('')}</div>`;
}
function tableHtml(t) {
  return `<div class="twrap"><table class="gtable">${t.cols?.length ? `<thead><tr>${t.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${(t.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const NOTE_LABEL = { dikkat: 'Dikkat', ipucu: 'İpucu', turkce: 'Türkçeyle kıyasla' };
function noteHtml(sec) {
  const kind = ['dikkat', 'ipucu', 'turkce'].includes(sec.kind) ? sec.kind : 'ipucu';
  return `<div class="nbox ${kind}" role="note"><span class="lab">${NOTE_LABEL[kind]}</span>${md(sec.md)}</div>`;
}
function pronounceHtml(sec) {
  return `<div>${(sec.items || []).map(it => `<div class="prow"><span class="en">${esc(it.en)}</span><span class="h">${esc(it.hint || '')}</span>${sayBtn(it.en)}</div>`).join('')}</div>`;
}
function mistakesHtml(sec) {
  return `<div>${(sec.items || []).map(it => `<div class="mrow"><span class="w">${esc(it.wrong)}</span><span class="r">${esc(it.right)}</span>${it.why ? `<span class="y">${esc(it.why)}</span>` : ''}</div>`).join('')}</div>`;
}

/* --- Diyalog: oynat, tümünü oynat, "Sen söyle" modu (sesli) --- */
const Dialogue = {
  create(sec) {
    const names = [...new Set((sec.lines || []).map(l => l.who))];
    const me = names.find(n => /uğur|ugur|sen|you/i.test(n)) || names[1] || names[0];
    return { key: uid('d'), sec, me, mode: 'read', i: -1, playing: false, heard: '', pct: null, listening: false, msg: '', interim: '', said: new Set(), typed: '', typing: !Sound.canListen() };
  },
  html(d) {
    const k = d.key, lines = d.sec.lines || [];
    const myTurn = d.mode === 'you' && d.i >= 0 && d.i < lines.length && lines[d.i].who === d.me;
    return `<div class="stack" id="${k}">
      <div class="dctl">
        <button class="btn small ${d.mode === 'read' ? 'soft' : 'ghost'}" data-act="${k}-mode-read">Oku</button>
        <button class="btn small ${d.mode === 'you' ? 'primary' : 'ghost'}" data-act="${k}-mode-you">${ico('mic')} Sen söyle: ${esc(d.me)}</button>
        ${d.mode === 'read' ? (d.playing ? `<button class="btn small ghost" data-act="${k}-stop">${ico('stop')} Durdur</button>` : `<button class="btn small ghost" data-act="${k}-playall">${ico('play')} Tümünü oynat</button>`) : ''}
        ${rateToggleHtml()}
      </div>
      ${d.mode === 'you' ? `<p class="hint">${esc(d.me)} dışındaki satırlar okunur; sıra sana gelince durur. Mikrofonla söyle ya da yaz.</p>` : ''}
      <div class="dlg">${lines.map((l, i) => {
        const mine = l.who === d.me;
        const cls = [mine ? 'b' : 'a', i === d.i ? 'now' : '', d.said.has(i) ? 'said' : '', d.mode === 'you' && mine && !d.said.has(i) && i >= d.i && d.i >= 0 ? 'hidden-en' : ''].join(' ');
        return `<div class="dline ${cls}"><div><div class="who">${esc(l.who)}</div><div class="en">${esc(l.en)}</div><div class="tr">${esc(l.tr || '')}</div></div><button class="iconbtn sm" data-act="${k}-play" data-i="${i}" aria-label="Satırı dinle">${ico('speaker')}</button></div>`;
      }).join('')}</div>
      ${d.mode === 'you' && d.i < 0 ? `<div class="row"><button class="btn primary" data-act="${k}-start">Başla</button></div>` : ''}
      ${myTurn ? `<div class="dturn"><b>Sıra sende: ${esc(lines[d.i].tr || '')}</b>
        ${!d.typing && Sound.canListen() ? micBigHtml(k, { listening: d.listening, msg: d.msg, interim: d.listening ? d.interim : d.heard }, { extra: `<div class="micopts"><button class="btn ghost" data-act="${k}-typeon">${ico('pen')} Yazayım</button><button class="btn ghost" data-act="${k}-reveal">${ico('eye')} Cümleyi göster</button></div>` }) : `
        <form data-form="${k}-typed" class="composer"><input class="input" id="${k}-in" type="text" autocomplete="off" placeholder="Cümleyi yaz" value="${esc(d.typed)}"><button class="btn primary" type="submit">Söyledim</button></form>
        <div class="row between">${Sound.canListen() ? `<button class="btn small ghost" data-act="${k}-typeoff">${ico('mic')} Mikrofonla</button>` : '<span></span>'}<button class="btn small ghost" data-act="${k}-reveal">Cümleyi göster</button></div>`}
        ${d.pct != null ? `<div class="row between"><span class="pct" style="font-size:1.6rem">%${d.pct}</span><span class="hint">${d.pct >= 70 ? 'İyi, devam ediyoruz' : 'Bir daha dene ya da devam et'}</span></div>` : ''}
        <div class="row end">${d.pct != null && d.pct < 70 ? `<button class="btn small ghost" data-act="${k}-retry">Tekrar söyle</button>` : ''}<button class="btn small soft" data-act="${k}-skipline">Devam</button></div>
      </div>` : ''}
      ${d.mode === 'you' && d.i >= lines.length ? `<div class="verdict ok"><b><span class="tick">${ico('check')}</span>Diyalog bitti.</b><div class="expl">${d.said.size} satırını söyledin. Baştan almak için "Başla"ya bas.</div></div><div class="row"><button class="btn small ghost" data-act="${k}-start">Baştan</button></div>` : ''}
    </div>`;
  },
  bind(d, rerender) {
    const k = d.key, lines = d.sec.lines || [];
    const refresh = () => rerender();
    const btnFor = i => $(`#${k} .dline:nth-child(${i + 1}) .iconbtn`);
    handlers[`${k}-mode-read`] = () => { Sound.stop(); Sound.abortListening(); d.mode = 'read'; d.i = -1; d.playing = false; d.listening = false; refresh(); };
    handlers[`${k}-mode-you`] = () => { Sound.stop(); d.mode = 'you'; d.i = -1; d.said = new Set(); refresh(); };
    handlers[`${k}-play`] = el => { Sound.stop(); d.playing = false; const i = Number(el.dataset.i); Sound.speak(lines[i].en, el); };
    handlers[`${k}-stop`] = () => { Sound.stop(); d.playing = false; d.i = -1; refresh(); };
    handlers[`${k}-playall`] = () => {
      d.playing = true; d.i = 0; refresh();
      Sound.speakSeq(lines.map((l, i) => ({ text: l.en, i })), it => { d.i = it.i; $$(`#${k} .dline`).forEach((el, j) => el.classList.toggle('now', j === it.i)); }, () => { d.playing = false; d.i = -1; refresh(); });
    };
    const advance = () => {
      d.heard = ''; d.pct = null; d.msg = ''; d.typed = ''; d.interim = '';
      if (d.i >= lines.length) { refresh(); return; }
      if (lines[d.i].who === d.me) {
        refresh();
        // Sıra sende: otomatik ses açıksa mikrofonu kendiliğinden aç (dokun modu)
        if (Settings.get('autoListen') && Settings.get('micMode') !== 'hold' && !d.typing && Sound.canListen()) setTimeout(() => { if (d.mode === 'you' && !d.listening && lines[d.i]?.who === d.me) handlers[`${k}-micstart`](); }, 350);
        return;
      }
      refresh();
      const i = d.i;
      Sound.speak(lines[i].en, btnFor(i), undefined, () => { if (d.mode === 'you' && d.i === i) { d.i++; advance(); } });
    };
    handlers[`${k}-start`] = () => { d.said = new Set(); d.i = 0; advance(); };
    handlers[`${k}-skipline`] = () => { Sound.abortListening(); d.listening = false; d.i++; advance(); };
    handlers[`${k}-reveal`] = () => { const el = $(`#${k} .dline:nth-child(${d.i + 1})`); if (el) el.classList.remove('hidden-en'); Sound.speak(lines[d.i].en, btnFor(d.i)); };
    handlers[`${k}-typeon`] = () => { Sound.abortListening(); d.listening = false; d.typing = true; refresh(); $(`#${k}-in`)?.focus(); };
    handlers[`${k}-typeoff`] = () => { d.typing = false; refresh(); };
    const accept = text => {
      const pct = similarity(text, lines[d.i].en); d.heard = text; d.pct = pct;
      if (pct >= 70) { d.said.add(d.i); setTimeout(() => { if (d.mode === 'you') { d.i++; advance(); } }, 900); }
      refresh();
    };
    handlers[`${k}-typed`] = f => { const v = (f.querySelector('input')?.value || '').trim(); if (!v) { toast('Önce cümleyi yaz ya da söyle.'); return; } d.typed = v; accept(v); };
    handlers[`${k}-retry`] = () => { d.heard = ''; d.pct = null; d.msg = ''; refresh(); handlers[`${k}-micstart`](); };
    handlers[`${k}-micstart`] = () => {
      if (d.listening) return;
      d.heard = ''; d.pct = null; d.msg = ''; d.interim = ''; d.listening = true; micPatch(k, { listening: true, interim: '' });
      let fin = '';
      Sound.listen({
        onInterim: t => { d.interim = t; micPatch(k, { listening: true, interim: t }); },
        onFinal: t => { fin = t; },
        onError: code => { d.msg = micMsg(code); d.listening = false; refresh(); },
        onEnd: () => { if (!d.listening) return; d.listening = false; if (fin) accept(fin); else { if (!d.msg) d.msg = MIC_MSG['no-speech']; refresh(); } },
      });
    };
    handlers[`${k}-micstop`] = () => Sound.stopListening();
  },
};

function sectionsHtml(sections, pg) {
  return (sections || []).map((sec, idx) => {
    let body = '';
    switch (sec.t) {
      case 'text': body = md(sec.md); break;
      case 'examples': body = `<div class="card flat tight">${exampleRows(sec.items)}</div>`; break;
      case 'table': body = tableHtml(sec); break;
      case 'dialogue': {
        const key = 'dlg' + idx;
        if (!pg.widgets[key]) pg.widgets[key] = Dialogue.create(sec);
        body = `<div id="${pg.widgets[key].key}-box">${Dialogue.html(pg.widgets[key])}</div>`;
        pg.mounts.push(() => { const d = pg.widgets[key]; const rr = () => { const b = $(`#${d.key}-box`); if (!b) return; b.innerHTML = Dialogue.html(d); Dialogue.bind(d, rr); }; Dialogue.bind(d, rr); });
        break;
      }
      case 'note': return `<div class="sub">${noteHtml(sec)}</div>`;
      case 'pronounce': body = `<div class="card flat tight">${pronounceHtml(sec)}</div>`; break;
      case 'mistakes': body = `<div class="card flat tight">${mistakesHtml(sec)}</div>`; break;
      default: body = sec.md ? md(sec.md) : '';
    }
    return `<div class="sub">${sec.h ? `<h3>${esc(sec.h)}</h3>` : ''}${body}</div>`;
  }).join('');
}

/* ============================================================
   Ders sayfası — tek uzun sayfa, 8 bölüm ("kitap sayfası")
   ============================================================ */
function newPage(doc) {
  return { id: doc.id, doc, widgets: {}, mounts: [], scores: { prev: 0, exercises: 0, exercisesMax: exCount(doc), listening: 0, speakingTurns: 0 }, hw: { written: '', spoken: [], mode: 'typed', submitting: false }, openedAt: Date.now(), scrolled: false };
}
function pageSteps(doc) {
  if (doc.type === 'review') return [{ id: 'read', label: 'Haftanın özeti' }, { id: 'exercises', label: 'Karışık sorular' }, { id: 'vocab', label: 'Kelime tekrarı' }, { id: 'summary', label: 'Bitti' }];
  return LESSON_STEPS;
}
function stepState(doc, id) { const steps = stepsFor(doc.id); if (id === 'summary') return isLessonDone(doc, steps); return stepDone(doc, id, steps); }
function refreshNav() {
  const pg = S.page; if (!pg) return;
  const nav = $('#secnav'); if (nav) nav.outerHTML = secNavHtml(pg);
  pageSteps(pg.doc).forEach(s => { const el = $('#sec-' + s.id); if (el) el.classList.toggle('is-done', stepState(pg.doc, s.id)); });
}
function secNavHtml(pg) {
  const steps = pageSteps(pg.doc);
  const done = steps.filter(s => stepState(pg.doc, s.id)).length;
  const firstOpen = steps.find(s => !stepState(pg.doc, s.id));
  return `<div class="secnav" id="secnav"><div class="chips-row">${steps.map((s, i) => `<a class="sc ${stepState(pg.doc, s.id) ? 'done' : ''} ${firstOpen && firstOpen.id === s.id ? 'now' : ''}" href="#" data-act="jump" data-to="sec-${s.id}">${i + 1} ${esc(s.label)}</a>`).join('')}</div><div class="bar"><i style="width:${Math.round(done / steps.length * 100)}%"></i></div></div>`;
}
function lessonHead(doc) {
  const pl = planLesson(doc.id);
  const kicker = doc.type === 'review' ? 'Tekrar günü' : (pl ? `${pl.course.title_tr.split(' ')[0]} · ${pl.unit.n}. ünite · ${doc.lesson || pl.n}. ders` : 'Ders');
  return `<div class="lesson-head">
    <div class="row between"><button class="back" data-act="back">${ico('back')} Dersler</button><span class="hint">${doc.date ? fmtDate(doc.date) : ''}${doc.minutes ? ` · ~${doc.minutes} dk` : ''}</span></div>
    <div class="lesson-top"><div class="kicker">${esc(kicker)}</div><h1>${esc(doc.title_tr)}</h1><div class="en-title">${esc(doc.title_en || '')}</div>
      ${doc.goals_tr?.length ? `<ul class="goals">${doc.goals_tr.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
      ${doc.adapt_note_tr ? `<div class="banner note" style="margin-top:8px">${esc(doc.adapt_note_tr)}</div>` : ''}
    </div></div>`;
}
function secWrap(id, n, title, lead, body, pg) {
  return `<section class="lsec ${stepState(pg.doc, id) ? 'is-done' : ''}" id="sec-${id}"><div class="num">${n}</div><h2>${esc(title)}<span class="tick">${ico('check')}</span></h2>${lead ? `<p class="lead">${lead}</p>` : ''}<div class="body">${body}</div></section>`;
}
function doneBtn(label, act) { return `<div class="mark-done"><button class="btn primary" data-act="${act}">${esc(label)}</button></div>`; }

function viewLessonPage() {
  const id = S.route.id;
  const doc = lessonDoc(id);
  if (!doc) {
    if (S.lessonsState === 'loading') return topline() + `<div class="empty"><div class="en">Loading…</div><p>Ders yükleniyor.</p></div>`;
    DB.loadLesson(id).then(d => { if (d && S.route?.id === id) render(); });
    return topline() + `<section class="stack"><button class="back" data-act="back">${ico('back')} Dersler</button><div class="empty"><div class="en">Not yet.</div><p>Bu ders henüz hazırlanmadı. Dersler her sabah 09:00'da gelir.</p></div></section>`;
  }
  if (doc.type === 'speaking_test') return viewSpeakingTest(doc);
  if (doc.type === 'unit_exam') return viewUnitExam(doc);
  if (!S.page || S.page.id !== id) { S.page = newPage(doc); S.stepStart = Date.now(); ensureLogEntry(doc.id); if (doc.type === 'lesson') { S.main.current = S.main.completed[doc.id] ? S.main.current : doc.id; } }
  const pg = S.page; pg.mounts = [];
  handlers.back = () => go('dersler');
  handlers.jump = (el, e) => { e.preventDefault(); const t = $('#' + el.dataset.to); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const steps = pageSteps(doc);
  const parts = doc.type === 'review'
    ? [secRead(doc, pg, 1), secExercises(doc, pg, 2), secVocabReview(doc, pg, 3), secSummary(doc, pg, 4)]
    : [secPrev(doc, pg, 1), secRead(doc, pg, 2), secVocab(doc, pg, 3), secListening(doc, pg, 4), secExercises(doc, pg, 5), secSpeaking(doc, pg, 6), secHomework(doc, pg, 7), secSummary(doc, pg, 8)];
  handlers.__mount = () => {
    pg.mounts.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    if (!pg.scrolled) { pg.scrolled = true; const firstOpen = steps.find(s => !stepState(doc, s.id)); if (firstOpen && firstOpen.id !== steps[0].id && !S.main.completed[doc.id]) { const t = $('#sec-' + firstOpen.id); if (t) setTimeout(() => t.scrollIntoView({ block: 'start' }), 50); } }
  };
  return lessonHead(doc) + secNavHtml(pg) + parts.join('');
}

/* 1. Önceki dersin kontrolü */
function secPrev(doc, pg, n) {
  const pc = doc.prev_check;
  if (!pc) {
    if (!stepState(doc, 'prev')) { const e = ensureLogEntry(doc.id); if (!e.steps.prev) { e.steps.prev = true; DB.save('main'); } }
    return secWrap('prev', n, 'Önceki dersin kontrolü', '', `<div class="banner info">İlk ders, kontrol yok. Yarından itibaren her ders ödevinin düzeltmesiyle başlar.</div>`, pg);
  }
  const sc = pc.score || {};
  if (!pg.widgets.prevQuiz && pc.quiz?.length) {
    pg.widgets.prevQuiz = Quiz.create({ questions: pc.quiz, topicIds: planLesson(doc.id)?.grammar, startAt: stepState(doc, 'prev') ? pc.quiz.length : 0,
      onFinish: r => { pg.scores.prev = r.ok; markStep(doc, 'prev', true); refreshNav(); }, doneText: 'Hızlı test bitti.' });
  } else if (!pc.quiz?.length && !stepState(doc, 'prev')) { const e = ensureLogEntry(doc.id); e.steps.prev = true; DB.save('main'); }
  const q = pg.widgets.prevQuiz;
  if (q) pg.mounts.push(() => { const rr = () => { const b = $('#prevq'); if (!b) return; b.innerHTML = Quiz.html(q); Quiz.bind(q, rr); }; Quiz.bind(q, rr); });
  return secWrap('prev', n, 'Önceki dersin kontrolü', 'Dünkü ödevin okundu; işte düzeltmeler. Sonra 5 soruluk hızlı test.', `
    <div class="card" style="display:flex;flex-direction:column;gap:14px">
      ${sc.max ? `<div class="scorecards"><div class="stat"><b>${sc.written ?? '–'}<span style="font-size:.9rem;color:var(--ink-3)">/${sc.max}</span></b><span>yazılı ödev</span></div><div class="stat"><b>${sc.spoken ?? '–'}<span style="font-size:.9rem;color:var(--ink-3)">/${sc.max}</span></b><span>sesli ödev</span></div></div>` : ''}
      ${md(pc.homework_feedback_md || 'Dün ödev teslim etmedin.')}
    </div>
    ${q ? `<div class="sub"><h3>Hızlı test</h3><div id="prevq">${Quiz.html(q)}</div></div>` : ''}`, pg);
}

/* 2. Konu anlatımı */
function secRead(doc, pg, n) {
  handlers['read-done'] = () => { markStep(doc, 'read', true); refreshNav(); const t = $('#sec-' + (doc.type === 'review' ? 'exercises' : 'vocab')); if (t) t.scrollIntoView({ behavior: 'smooth' }); };
  const title = doc.type === 'review' ? 'Haftanın özeti' : 'Konu anlatımı';
  return secWrap('read', n, title, '', sectionsHtml(doc.sections, pg) + (stepState(doc, 'read') ? '' : doneBtn(doc.type === 'review' ? 'Okudum, sorulara geç' : 'Okudum, kelimelere geç', 'read-done')), pg);
}

/* 3. Kelimeler */
function vocabCard(w) {
  return `<div class="vcard"><div class="top"><div><div class="en">${esc(w.en)}</div>${w.ipa ? `<div class="ipa">/${esc(w.ipa)}/</div>` : ''}</div>${sayBtn(w.en)}</div>
    <div class="tr">${esc(w.tr)}${w.pos ? ` <span class="hint">· ${esc(w.pos)}</span>` : ''}</div>
    ${w.ex_en ? `<div class="ex"><span class="en">${esc(w.ex_en)}</span><br>${esc(w.ex_tr || '')}</div>` : ''}</div>`;
}
function secVocab(doc, pg, n) {
  const words = doc.vocab || [];
  if (!pg.widgets.matchQuiz && words.length >= 2) {
    const chunks = []; for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4));
    if (chunks.length > 1 && chunks[chunks.length - 1].length < 2) { const last = chunks.pop(); chunks[chunks.length - 1].push(...last); }
    pg.widgets.matchQuiz = Quiz.create({ questions: chunks.map(c => ({ type: 'match', pairs: c.map(w => [w.en, w.tr]) })), startAt: stepState(doc, 'vocab') ? chunks.length : 0, doneText: 'Eşleştirme bitti.',
      onFinish: () => { addVocab(words.map(w => w.id), doc.id); markStep(doc, 'vocab', true); refreshNav(); toast(`${words.length} kelime tekrar sistemine eklendi.`); } });
  }
  const q = pg.widgets.matchQuiz;
  if (q) pg.mounts.push(() => { const rr = () => { const b = $('#matchq'); if (!b) return; b.innerHTML = Quiz.html(q); Quiz.bind(q, rr); }; Quiz.bind(q, rr); });
  handlers['vocab-done'] = () => { addVocab(words.map(w => w.id), doc.id); markStep(doc, 'vocab', true); refreshNav(); };
  return secWrap('vocab', n, 'Kelimeler', `${words.length} kelime. Dinle, örnek cümleyi oku; bölüm bitince hepsi otomatik olarak tekrar sistemine girer.`, `
    <div class="vcards">${words.map(vocabCard).join('')}</div>
    ${q ? `<div class="sub"><h3>Mini eşleştirme</h3><div id="matchq">${Quiz.html(q)}</div></div>` : (stepState(doc, 'vocab') ? '' : doneBtn('Kelimeleri bitirdim', 'vocab-done'))}`, pg);
}
function secVocabReview(doc, pg, n) {
  if (!pg.widgets.srs) pg.widgets.srs = { deck: shuffle(dueVocab()), i: 0, flipped: false, ok: 0, no: 0 };
  const st = pg.widgets.srs;
  handlers['rv-flip'] = () => { st.flipped = !st.flipped; render(); };
  handlers['rv-yes'] = () => { gradeVocab(st.deck[st.i], true); st.ok++; st.i++; st.flipped = false; if (st.i >= st.deck.length) markStep(doc, 'vocab', true); render(); };
  handlers['rv-no'] = () => { gradeVocab(st.deck[st.i], false); st.no++; st.i++; st.flipped = false; if (st.i >= st.deck.length) markStep(doc, 'vocab', true); render(); };
  let body;
  if (!st.deck.length || st.i >= st.deck.length) {
    if (!stepState(doc, 'vocab')) { const e = ensureLogEntry(doc.id); e.steps.vocab = true; DB.save('main'); }
    body = `<div class="card" style="text-align:center"><div class="en" style="font-size:1.6rem">${st.deck.length ? 'All caught up.' : 'Nothing due.'}</div><p class="muted" style="margin-top:6px">${st.deck.length ? `${st.ok} hatırladın, ${st.no} tekrara düştü.` : 'Bugün süresi gelen kelime yok.'}</p></div>`;
  } else {
    const w = wordInfo(st.deck[st.i]) || { en: st.deck[st.i], tr: '' };
    body = `<div class="hint">${st.i + 1} / ${st.deck.length}</div>
      <div class="flash ${st.flipped ? 'flipped' : ''}"><button type="button" class="face" data-act="rv-flip">${st.flipped ? `<div class="tr">${esc(w.tr)}</div><div class="exm"><span class="en">${esc(w.ex_en || '')}</span>${esc(w.ex_tr || '')}</div>` : `<div class="en">${esc(w.en)}</div><div class="pos">${esc(w.pos || '')}</div><span class="hint">anlamını düşün, sonra çevir</span>`}</button></div>
      <div class="row between">${sayBtn(w.en)}${st.flipped ? `<div class="judge" style="flex:1"><button class="btn ghost" data-act="rv-no">Hatırlamadım</button><button class="btn primary" data-act="rv-yes">Hatırladım</button></div>` : `<button class="btn primary" data-act="rv-flip">Göster</button>`}</div>`;
  }
  return secWrap('vocab', n, 'Kelime tekrarı', 'Bu hafta süresi gelen tüm kelimeler.', `<div class="stack">${body}</div>`, pg);
}

/* 4. Dinleme */
function secListening(doc, pg, n) {
  const L = doc.listening;
  if (!L) { if (!stepState(doc, 'listening')) { const e = ensureLogEntry(doc.id); e.steps.listening = true; DB.save('main'); } return secWrap('listening', n, 'Dinleme', '', `<div class="banner info">Bu derste dinleme bölümü yok.</div>`, pg); }
  if (!pg.widgets.lis) pg.widgets.lis = { played: stepState(doc, 'listening'), reveal: stepState(doc, 'listening') };
  const st = pg.widgets.lis;
  if (!pg.widgets.lisQuiz && L.questions?.length) {
    pg.widgets.lisQuiz = Quiz.create({ questions: L.questions, startAt: stepState(doc, 'listening') ? L.questions.length : 0, doneText: 'Dinleme soruları bitti; metin aşağıda.',
      onFinish: r => { pg.scores.listening = r.ok; st.reveal = true; markStep(doc, 'listening', true); refreshNav(); render(); } });
  }
  const q = pg.widgets.lisQuiz;
  if (q) pg.mounts.push(() => { const rr = () => { const b = $('#lisq'); if (!b) return; b.innerHTML = Quiz.html(q); Quiz.bind(q, rr); }; Quiz.bind(q, rr); });
  handlers['lis-play'] = el => { st.played = true; Sound.speak(L.text_en, el); const qb = $('#lisq'); if (qb) qb.hidden = false; const h = $('#lis-hint'); if (h) h.remove(); };
  handlers['lis-reveal'] = () => { st.reveal = true; render(); };
  return secWrap('listening', n, L.h || 'Dinleme', 'Önce metni görmeden dinle (istersen yavaş), sonra 3 soruyu cevapla. Metin ve çevirisi sorulardan sonra açılır.', `
    <div class="lbox">
      <div class="big">${st.reveal ? 'Transcript' : 'Listen first.'}</div>
      <div class="row center"><button class="btn primary" data-act="lis-play">${ico('speaker')} Dinle</button>${rateToggleHtml()}</div>
      ${st.reveal ? `<div class="transcript"><div class="en">${esc(L.text_en)}</div><p class="muted" style="margin-top:8px">${esc(L.text_tr || '')}</p></div>` : `<div class="row center"><button class="btn small ghost" data-act="lis-reveal">Metni göster (sorulardan önce)</button></div>`}
    </div>
    ${q ? `<div class="sub"><h3>Sorular</h3><div id="lisq" ${st.played || st.reveal || q.finished ? '' : 'hidden'}>${Quiz.html(q)}</div>${!(st.played || st.reveal || q.finished) ? `<p class="hint" id="lis-hint">Sorular dinledikten sonra açılır.</p>` : ''}</div>` : ''}`, pg);
}

/* 5. Alıştırmalar */
function secExercises(doc, pg, n) {
  const qs = doc.exercises || [];
  const steps = stepsFor(doc.id);
  if (!pg.widgets.exq) {
    const saved = Math.min(steps.exercises || 0, qs.length);
    pg.widgets.exq = Quiz.create({ questions: qs, topicIds: planLesson(doc.id)?.grammar, startAt: saved, doneText: '',
      onAnswer: (ok, q, quiz) => { if (ok) pg.scores.exercises++; markStep(doc, 'exercises', quiz.i + 1); const e = ensureLogEntry(doc.id); e.steps.exercises_ok = (e.steps.exercises_ok || 0) + (ok ? 1 : 0); },
      onFinish: () => { markStep(doc, 'exercises', qs.length); refreshNav(); } });
    if (saved >= qs.length) pg.scores.exercises = steps.exercises_ok || 0;
  }
  const q = pg.widgets.exq;
  pg.mounts.push(() => { const rr = () => { const b = $('#exq'); if (!b) return; b.innerHTML = Quiz.html(q); Quiz.bind(q, rr); }; Quiz.bind(q, rr); });
  const lead = doc.type === 'review' ? `${qs.length} karışık soru; haftanın tüm konularından.` : `${qs.length} soru, kolaydan zora. Her cevaptan sonra açıklama gelir; yanlışlar zayıf konularına işlenir.`;
  return secWrap('exercises', n, doc.type === 'review' ? 'Karışık sorular' : 'Alıştırmalar', lead, `<div id="exq">${Quiz.html(q)}</div>`, pg);
}

/* 6. Konuşma pratiği */
function secSpeaking(doc, pg, n) {
  const sp = doc.speaking;
  if (!sp) { if (!stepState(doc, 'speaking')) { const e = ensureLogEntry(doc.id); e.steps.speaking = true; DB.save('main'); } return secWrap('speaking', n, 'Konuşma pratiği', '', `<div class="banner info">Bu derste konuşma bölümü yok.</div>`, pg); }
  if (!pg.widgets.chat) {
    pg.widgets.chat = Chat.create({
      rules: chatRules({ targets: sp.targets, role: sp.role_en, scenario: sp.scenario_tr, topic: `${doc.title_en} (${doc.title_tr})` }),
      opener: sp.opener_en, targets: sp.targets || [], hints: sp.hints_tr || [], minTurns: sp.min_turns || 5, lessonId: doc.id,
      scenarioHtml: `<b>Senaryo:</b> ${esc(sp.scenario_tr || '')}`,
      onFinish: () => { pg.scores.speakingTurns = pg.widgets.chat.userTurns; markStep(doc, 'speaking', true); refreshNav(); render(); },
    });
  }
  const chat = pg.widgets.chat;
  pg.mounts.push(() => mountChat(chat, 'spkbox'));
  handlers['spk-skip'] = () => { markStep(doc, 'speaking', true); refreshNav(); render(); };
  const done = stepState(doc, 'speaking');
  return secWrap('speaking', n, 'Konuşma pratiği', `En az ${sp.min_turns || 5} cevap ver; mikrofonla konuş ya da yaz. Hata yaparsan sarı notla düzeltilir, sonunda geri bildirim alırsın.`, `
    <div id="spkbox">${Chat.html(chat)}</div>
    ${!done && !aiReady() ? `<div class="mark-done"><button class="btn ghost" data-act="spk-skip">Anahtar yok, bu bölümü atla</button></div>` : ''}`, pg);
}

/* 7. Ödev */
function secHomework(doc, pg, n) {
  const hw = doc.homework;
  if (!hw) { if (!stepState(doc, 'homework')) { const e = ensureLogEntry(doc.id); e.steps.homework = true; DB.save('main'); } return secWrap('homework', n, 'Ödev', '', `<div class="banner info">Bu derste ödev yok.</div>`, pg); }
  const sub = S.homework[doc.id];
  const st = pg.hw; const sents = hw.spoken?.sentences || [];
  if (!st.spoken.length) st.spoken = sents.map(() => ({ text: '', pct: null, listening: false, msg: '' }));
  const minS = hw.written?.min_sentences || 1;
  if (sub) {
    return secWrap('homework', n, 'Ödev', '', `
      <div class="verdict ok"><b><span class="tick">${ico('check')}</span>Ödev teslim edildi · ${esc(fmtDate(sub.date || todayStr()))}</b><div class="expl">Sabah Claude kontrol edecek, sonucu yarınki dersin başında göreceksin.${Store.queued('homework/' + doc.id) ? ' (Henüz GitHub\'a yazılmadı; anahtar girilince gönderilir.)' : ''}</div></div>
      <div class="sub"><h3>Yazılı ödevin</h3><div class="card flat"><div class="en" style="font-size:1.15rem;line-height:1.45">${esc(sub.written || '')}</div></div></div>
      ${sub.spoken?.length ? `<div class="sub"><h3>Sesli ödevin (${sub.spoken_mode === 'mic' ? 'mikrofon' : 'yazılı'})</h3><div class="card flat tight">${sub.spoken.map((s, i) => `<div class="hw-sent"><div><div class="hint">${esc(sents[i] || '')}</div><div class="en">${esc(s)}</div></div><span></span>${sayBtn(sents[i] || s)}</div>`).join('')}</div></div>` : ''}
      ${hw.written?.model_en ? `<div class="sub"><h3>Örnek cevap</h3><div class="card flat"><div class="en" style="font-size:1.15rem;line-height:1.45">${esc(hw.written.model_en)}</div><button class="btn small ghost" style="margin-top:10px" data-say="${esc(hw.written.model_en)}">${ico('speaker')} Dinle</button></div></div>` : ''}
      ${hw.habit_tr ? `<div class="habit">${ico('spark')}<div><b>Bugünün mikro alışkanlığı</b><br>${esc(hw.habit_tr)}</div></div>` : ''}`, pg);
  }
  const can = Sound.canListen();
  const patchRow = i => { const s = st.spoken[i]; const b = $(`#hw-mic-${i}`); if (b) b.classList.toggle('live', !!s.listening); const h = $(`#hw-heard-${i}`); if (h) h.textContent = s.listening ? (s.interim || 'dinliyorum…') : ''; };
  handlers['hw-micstart'] = el => {
    const i = Number((el && el.dataset.i) ?? st.cur ?? 0); st.cur = i; const s = st.spoken[i];
    if (s.listening) return;
    st.spoken.forEach(x => x.listening = false); s.listening = true; s.msg = ''; s.interim = ''; patchRow(i);
    let fin = '';
    Sound.listen({
      onInterim: t => { s.interim = t; patchRow(i); },
      onFinal: t => { fin = t; },
      onError: code => { s.msg = micMsg(code); s.listening = false; render(); },
      onEnd: () => { if (!s.listening) return; s.listening = false; if (fin) { s.text = fin; s.pct = similarity(fin, sents[i]); st.mode = 'mic'; } else if (!s.msg) s.msg = MIC_MSG['no-speech']; render(); },
    });
  };
  handlers['hw-micstop'] = () => Sound.stopListening();
  handlers['hw-submit'] = async () => {
    const written = ($('#hw-written')?.value || '').trim(); st.written = written;
    $$('[data-hw-i]').forEach(inp => { const i = Number(inp.dataset.hwI); const v = inp.value.trim(); if (v && v !== st.spoken[i].text) { st.spoken[i].text = v; st.spoken[i].pct = similarity(v, sents[i]); } });
    if (sentenceCount(written) < minS) { toast(`Yazılı ödev için en az ${minS} cümle gerekiyor.`); return; }
    const missing = st.spoken.filter(s => !s.text.trim()).length;
    if (missing) { toast(`${missing} cümle eksik; söyle ya da yaz.`); return; }
    if (st.submitting) return; st.submitting = true; render();
    const data = { lesson: doc.id, date: todayStr(), written, spoken: st.spoken.map(s => s.text), spoken_mode: st.mode, submitted_at: new Date().toISOString() };
    await DB.writeDoc('homework/' + doc.id, data, 'homework');
    st.submitting = false;
    markStep(doc, 'homework', true); refreshNav(); toast('Ödev teslim edildi.'); render();
  };
  pg.mounts.push(() => {
    const ta = $('#hw-written'); if (ta) ta.addEventListener('input', () => { st.written = ta.value; const c = $('#hw-count'); const nS = sentenceCount(ta.value); if (c) { c.textContent = `${nS} / ${minS} cümle`; c.classList.toggle('ok', nS >= minS); } });
    $$('[data-hw-i]').forEach(inp => inp.addEventListener('change', () => { const i = Number(inp.dataset.hwI); st.spoken[i].text = inp.value.trim(); st.spoken[i].pct = inp.value.trim() ? similarity(inp.value, sents[i]) : null; if (st.mode !== 'mic') st.mode = 'typed'; const p = $(`#hw-pct-${i}`); if (p) { p.textContent = st.spoken[i].pct == null ? '' : '%' + st.spoken[i].pct; p.className = 'pct-sm ' + (st.spoken[i].pct >= 70 ? 'ok' : 'no'); } }));
  });
  const nS = sentenceCount(st.written);
  return secWrap('homework', n, 'Ödev', 'İki parça: kısa bir yazı ve sesli cümleler. Teslim edince örnek cevap açılır; sabah Claude okur, yarınki dersin başında düzeltmelerini görürsün.', `
    <div class="sub"><h3>Yazılı</h3><p class="muted">${esc(hw.written?.prompt_tr || '')}</p>
      <textarea class="input" id="hw-written" rows="5" placeholder="İngilizce yaz…" style="font-family:var(--font-display);font-size:1.1rem;min-height:130px" ${st.submitting ? 'disabled' : ''}>${esc(st.written)}</textarea>
      <div class="row between"><span class="counter ${nS >= minS ? 'ok' : ''}" id="hw-count">${nS} / ${minS} cümle</span><span class="hint">Nokta ile bitir, cümleler sayılsın.</span></div></div>
    <div class="sub"><h3>Sesli</h3><p class="muted">${esc(hw.spoken?.prompt_tr || '')}${can ? ` ${Settings.get('micMode') === 'hold' ? 'Mikrofona basılı tutup söyle.' : 'Mikrofona dokunup söyle.'}` : ' (Bu tarayıcıda ses tanıma yok; cümleleri yaz.)'}</p>
      <div class="card flat tight">${sents.map((s, i) => { const x = st.spoken[i]; return `<div class="hw-sent"><div style="min-width:0"><div class="en">${esc(s)}</div><div class="heard" id="hw-heard-${i}" style="font-size:1rem">${x.listening ? 'dinliyorum…' : ''}</div>${x.msg ? `<div class="micline">${esc(x.msg)}</div>` : ''}<input class="input body" data-hw-i="${i}" type="text" autocomplete="off" placeholder="…ya da yaz" value="${esc(x.text)}"></div><span class="pct-sm ${x.pct == null ? '' : (x.pct >= 70 ? 'ok' : 'no')}" id="hw-pct-${i}">${x.pct == null ? '' : '%' + x.pct}</span><div class="row" style="gap:6px">${sayBtn(s)}<button class="iconbtn ${x.listening ? 'live' : ''}" id="hw-mic-${i}" data-mic="hw" data-i="${i}" aria-label="Söyle" ${can ? '' : 'disabled'}>${ico('mic')}</button></div></div>`; }).join('')}</div></div>
    ${hw.habit_tr ? `<div class="habit">${ico('spark')}<div><b>Bugünün mikro alışkanlığı</b><br>${esc(hw.habit_tr)}</div></div>` : ''}
    <div class="mark-done"><button class="btn primary" data-act="hw-submit" ${st.submitting ? 'disabled' : ''}>${st.submitting ? 'teslim ediliyor…' : 'Teslim et'}</button></div>`, pg);
}

/* 8. Özet ve bitiş */
function secSummary(doc, pg, n) {
  const sm = doc.summary;
  const done = isLessonDone(doc, stepsFor(doc.id)) || (doc.type === 'review' && stepState(doc, 'read') && stepState(doc, 'exercises') && stepState(doc, 'vocab'));
  if (doc.type === 'review' && done && !S.main.completed[doc.id]) { S.main.completed[doc.id] = { date: todayStr(), exercise_score: pg.scores.exercises, exercise_max: exCount(doc), minutes: latestLogFor(doc.id)?.entry.minutes || 0 }; S.main.streak = computeStreak(); DB.save('main'); }
  const c = S.main.completed[doc.id] || null;
  const log = latestLogFor(doc.id)?.entry;
  const all = flatLessons(); const i = all.findIndex(l => l.id === doc.id); const next = i >= 0 ? all[i + 1] : null;
  const missing = (doc.type === 'review' ? ['read', 'exercises', 'vocab'] : ['read', 'exercises', 'speaking', 'homework']).filter(s => !stepState(doc, s));
  const labels = { read: 'Konu', exercises: 'Alıştırmalar', speaking: 'Konuşma', homework: 'Ödev', vocab: 'Kelime tekrarı' };
  handlers.home = () => go('bugun');
  handlers['go-list'] = () => go('dersler');
  return secWrap('summary', n, 'Özet', '', `
    ${sm ? `<div class="card" style="display:flex;flex-direction:column;gap:12px">${md(sm.rule_md || '')}${sm.examples?.length ? exampleRows(sm.examples) : ''}</div>` : ''}
    <div class="sub">${done ? `
      <div class="done-hero"><div class="big">Done.</div><p>${esc(doc.title_tr)} tamamlandı. Seri: ${S.main.streak} gün</p></div>
      <div class="scorecards">
        ${doc.prev_check ? `<div class="stat"><b>${pg.scores.prev || c?.prev_quiz || 0}/${doc.prev_check.quiz?.length || 5}</b><span>hızlı test</span></div>` : ''}
        <div class="stat"><b>${c?.exercise_score ?? pg.scores.exercises}/${exCount(doc)}</b><span>alıştırma</span></div>
        ${doc.listening ? `<div class="stat"><b>${pg.scores.listening}/${doc.listening.questions?.length || 3}</b><span>dinleme</span></div>` : ''}
        <div class="stat"><b>${(c?.minutes ?? log?.minutes) || 0} dk</b><span>çalıştın</span></div>
      </div>
      ${next ? `<div class="card flat" style="margin-top:12px">${sectionTitle('Yarın')}<b>${esc(next.title_tr)}</b><div class="muted small" style="font-family:var(--font-display);font-style:italic">${esc(next.title_en)}</div><p class="hint" style="margin-top:4px">Yarınki ders sabah 09:00'da gelir; ödevinin düzeltmesiyle başlar.</p></div>` : ''}
      <div class="row between" style="margin-top:12px"><button class="btn ghost" data-act="go-list">Derslere dön</button><button class="btn primary" data-act="home">Bugüne dön</button></div>`
      : `<div class="banner info">Ders henüz tamamlanmış sayılmıyor. Eksik: <b>${missing.map(m => labels[m]).join(', ')}</b>.</div>`}
    </div>`, pg);
}

/* ============================================================
   Konuşma sınavı (cumartesi)
   ============================================================ */
const RUBRIC_TR = { fluency: 'Akıcılık', accuracy: 'Doğruluk', pronunciation: 'Telaffuz', interaction: 'Etkileşim' };
function rubricCards(scores) {
  return `<div class="rubric">${Object.keys(RUBRIC_TR).map(k => { const v = Number(scores?.[k]) || 0; return `<div class="r"><b>${v}</b><span>${RUBRIC_TR[k]}</span><div class="dots">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= v ? 'on' : ''}"></i>`).join('')}</div></div>`; }).join('')}</div>`;
}
function examResultHtml(x) {
  const total = x.scores?.total ?? 0, max = x.scores?.max ?? 25;
  return `<div class="stack">
    <div class="done-hero"><div class="big">${total}<span style="font-size:1.4rem;color:var(--ink-3)"> / ${max}</span></div><p>${x.passed ? 'Geçtin.' : 'Bu sefer olmadı; haftaya tekrar.'} · ${esc(fmtDate(x.date))}</p></div>
    ${x.scores && x.type === 'speaking_test' ? rubricCards(x.scores) : ''}
    ${x.feedback_md ? `<div class="card">${md(x.feedback_md)}</div>` : ''}
    ${x.fixes?.length ? `<div class="card flat">${sectionTitle('Üç düzeltme')}<div>${x.fixes.map(f => `<div class="mrow"><span class="w">${esc(f.wrong || '')}</span><span class="r">${esc(f.right || '')}</span>${f.why_tr ? `<span class="y">${esc(f.why_tr)}</span>` : ''}</div>`).join('')}</div></div>` : ''}
    ${x.weak?.length ? `<div class="card flat">${sectionTitle('Zayıf konular')}<div class="row">${x.weak.map(w => `<span class="chip" style="font-family:var(--font-body);font-size:.9rem">${esc(grammarById(w)?.title_tr || w)}</span>`).join('')}</div></div>` : ''}
  </div>`;
}
function headBar(doc, right = '') { return `<div class="exam-head"><button class="back" data-act="back">${ico('back')} Dersler</button><span class="hint">${esc(doc.title_tr)}</span>${right}</div>`; }
function viewSpeakingTest(doc) {
  const prior = S.exams[doc.id];
  handlers.back = () => go('dersler');
  if (prior && !(S.page && S.page.id === doc.id && S.page.retake)) {
    handlers.retake = () => { S.page = { id: doc.id, retake: true, part: -1, chats: [], done: [], scoring: false, result: null, startedAt: Date.now(), transcript: [] }; render(); };
    return `<section class="stack">${headBar(doc)}${examResultHtml(prior)}<div class="row between"><button class="btn ghost" data-act="back">Derslere dön</button><button class="btn soft small" data-act="retake">Yeniden gir</button></div></section>`;
  }
  if (!S.page || S.page.id !== doc.id) S.page = { id: doc.id, part: -1, chats: [], done: [], scoring: false, result: null, startedAt: Date.now(), transcript: [], tick: null };
  const pg = S.page; const parts = doc.test?.parts || [];
  const totalMin = parts.reduce((a, p) => a + (p.minutes || 3), 0);
  if (pg.result) return `<section class="stack">${headBar(doc)}${examResultHtml(pg.result)}<div class="row end"><button class="btn primary" data-act="back">Derslere dön</button></div></section>`;
  if (pg.part < 0) {
    handlers.start = () => { pg.part = 0; pg.startedAt = Date.now(); render(); };
    return `<section class="stack fade-in">${headBar(doc)}
      <div class="lesson-top"><div class="kicker">Cumartesi · konuşma sınavı</div><h1>${esc(doc.title_tr)}</h1><div class="en-title">${esc(doc.title_en || '')}</div></div>
      ${doc.intro_md ? `<div class="card flat">${md(doc.intro_md)}</div>` : ''}
      <div class="card" style="display:flex;flex-direction:column;gap:12px">
        <p>${parts.length} bölüm, yaklaşık ${totalMin} dakika. Sınav boyunca <b>düzeltme yapılmaz</b>; sonunda dört ölçütte puan alırsın. Mikrofonla konuşman beklenir; istersen yazabilirsin.</p>
        <div class="parts">${parts.map(p => `<span>${p.n}. ${esc(p.h)}<br><small>${p.minutes || 3} dk</small></span>`).join('')}</div>
        <div>${sectionTitle('Puanlama ölçütleri')}<ul class="goals">${Object.entries(doc.test?.rubric || {}).map(([k, v]) => `<li><b>${RUBRIC_TR[k] || k}:</b> ${esc(v)}</li>`).join('')}</ul></div>
        ${!aiReady() ? keyCard('Sınav Claude anahtarı girilince yapılır.') : ''}
      </div>
      <div class="row end"><button class="btn primary" data-act="start" ${aiReady() ? '' : 'disabled'}>Sınava başla</button></div></section>`;
  }
  const p = parts[pg.part];
  if (!pg.chats[pg.part]) {
    const minTurns = p.questions_en?.length ? p.questions_en.length : 3;
    pg.chats[pg.part] = Chat.create({
      rules: chatRules({ exam: true, role: p.role_en, scenario: p.scenario_tr || p.prompt_tr, questions: p.questions_en }),
      opener: p.opener_en || p.prompt_en, minTurns, exam: true, lessonId: doc.id, finishLabel: pg.part + 1 < parts.length ? 'Bu bölümü bitir' : 'Sınavı bitir',
      scenarioHtml: `<b>${p.n}. ${esc(p.h)}</b>${p.scenario_tr ? ` · ${esc(p.scenario_tr)}` : ''}${p.prompt_tr ? ` · ${esc(p.prompt_tr)}` : ''}`,
      onFinish: () => finishPart(),
    });
    pg.partStart = Date.now();
  }
  const chat = pg.chats[pg.part];
  const finishPart = async () => {
    pg.transcript.push({ part: p.n, h: p.h, lines: chat.msgs.map(m => ({ who: m.role === 'me' ? 'Uğur' : 'Examiner', en: m.en })) });
    pg.done.push(pg.part);
    if (pg.part + 1 < parts.length) { pg.part++; render(); return; }
    await scoreSpeakingTest(doc, pg);
  };
  if (pg.tick) clearInterval(pg.tick);
  pg.tick = setInterval(() => { const t = $('#exam-timer'); if (!t) { clearInterval(pg.tick); pg.tick = null; return; } const left = (p.minutes || 3) * 60 - Math.floor((Date.now() - pg.partStart) / 1000); t.textContent = (left < 0 ? '−' : '') + Quiz.fmtTime(Math.abs(left)); t.classList.toggle('low', left < 30); }, 1000);
  handlers.__mount = () => mountChat(chat, 'exambox');
  return `<section class="stack">${headBar(doc, `<span class="timer" id="exam-timer">${Quiz.fmtTime((p.minutes || 3) * 60)}</span>`)}
    <div class="parts">${parts.map((x, i) => `<span class="${i === pg.part ? 'now' : (pg.done.includes(i) ? 'done' : '')}">${x.n}. ${esc(x.h)}</span>`).join('')}</div>
    ${pg.scoring ? `<div class="card" style="text-align:center"><div class="thinking" style="justify-content:center"><i></i> puanlanıyor…</div></div>` : `<div id="exambox">${Chat.html(chat)}</div>`}
  </section>`;
}
async function scoreSpeakingTest(doc, pg) {
  pg.scoring = true; render();
  const transcript = pg.transcript.map(t => `--- Part ${t.part}: ${t.h} ---\n` + t.lines.map(l => `${l.who}: ${l.en}`).join('\n')).join('\n\n');
  const rubric = doc.test?.rubric || {};
  let r = null;
  if (aiReady()) {
    try {
      r = await AI.json(
        `You are grading an A1 English speaking test of a Turkish learner (Uğur). The learner spoke through a microphone; transcripts may contain recognition noise, judge generously. Transcript:\n\n${transcript.slice(0, 9000)}\n\nRubric (each 0-5): ${Object.entries(rubric).map(([k, v]) => `${k}: ${v}`).join(' | ')}\n\nReply with only JSON: {"scores":{"fluency":0-5,"accuracy":0-5,"pronunciation":0-5,"interaction":0-5},"feedback_md":"3-5 short sentences in Turkish, markdown allowed, warm and concrete","fixes":[{"wrong":"...","right":"...","why_tr":"..."}] (exactly 3, taken from the learner's actual sentences),"weak":["grammar topic ids among: ${(C?.grammar || []).map(g => g.id).join(', ')}"]}`,
        { tier: 'default', maxTokens: 800 });
    } catch (e) { toast(aiMessage(e) || 'Puanlama alınamadı.'); }
  }
  const sc = r?.scores && typeof r.scores === 'object' ? r.scores : { fluency: 0, accuracy: 0, pronunciation: 0, interaction: 0 };
  const keys = Object.keys(RUBRIC_TR); let total = 0;
  keys.forEach(k => { sc[k] = Math.max(0, Math.min(5, Math.round(Number(sc[k]) || 0))); total += sc[k]; });
  const result = { id: doc.id, type: 'speaking_test', date: todayStr(), scores: { ...sc, total, max: 20 }, feedback_md: String(r?.feedback_md || (r ? '' : 'Puanlama bu sefer alınamadı; konuşma kaydedildi.')), fixes: Array.isArray(r?.fixes) ? r.fixes.slice(0, 3) : [], weak: Array.isArray(r?.weak) ? r.weak.filter(w => grammarById(w)) : [], transcript: pg.transcript, passed: total >= 11, minutes: Math.round((Date.now() - pg.startedAt) / 60000) };
  markWeak(result.weak, 2);
  await DB.writeDoc('exams/' + doc.id, result, 'exams');
  S.main.streak = computeStreak(); DB.save('main');
  pg.scoring = false; pg.result = result; render();
}

/* ============================================================
   Ünite sınavı
   ============================================================ */
function viewUnitExam(doc) {
  const prior = S.exams[doc.id];
  handlers.back = () => go('dersler');
  const ex = doc.exam || {}; const qs = ex.questions || []; const pass = ex.pass || 70;
  if (prior && !(S.page && S.page.id === doc.id && S.page.retake)) {
    handlers.retake = () => { S.page = { id: doc.id, retake: true, started: false, quiz: null, result: null }; render(); };
    return `<section class="stack">${headBar(doc)}${examResultHtml(prior)}<div class="row between"><button class="btn ghost" data-act="back">Derslere dön</button><button class="btn soft small" data-act="retake">Yeniden gir</button></div></section>`;
  }
  if (!S.page || S.page.id !== doc.id) S.page = { id: doc.id, started: false, quiz: null, result: null };
  const pg = S.page;
  if (pg.result) return `<section class="stack">${headBar(doc)}${examResultHtml(pg.result)}${ex.speaking_prompt_tr ? `<div class="habit">${ico('mic')}<div>${esc(ex.speaking_prompt_tr)}</div></div>` : ''}<div class="row end"><button class="btn primary" data-act="back">Derslere dön</button></div></section>`;
  if (!pg.started) {
    handlers.start = () => { pg.started = true; render(); };
    return `<section class="stack fade-in">${headBar(doc)}
      <div class="lesson-top"><div class="kicker">Ünite sınavı</div><h1>${esc(doc.title_tr)}</h1><div class="en-title">${esc(doc.title_en || '')}</div></div>
      ${doc.intro_md ? `<div class="card flat">${md(doc.intro_md)}</div>` : ''}
      <div class="card" style="display:flex;flex-direction:column;gap:10px"><p><b>${qs.length} soru</b>, tek oturum, ${doc.minutes || 25} dakika. Geçme notu <b>%${pass}</b>. Sorular arasında açıklama görmezsin; sonuç sonunda gelir.</p>
      ${doc.goals_tr?.length ? `<ul class="goals">${doc.goals_tr.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}</div>
      <div class="row end"><button class="btn primary" data-act="start">Sınava başla</button></div></section>`;
  }
  if (!pg.quiz) {
    const topicIds = unitOf(doc.course, doc.unit)?.lessons?.flatMap(l => l.grammar || []) || [];
    pg.quiz = Quiz.create({ questions: qs, topicIds: [], timerSec: (doc.minutes || 25) * 60, doneText: 'Sınav bitti.', silent: true, doneLabel: 'Sonucu gör',
      onFinish: () => {},
      onDone: async r => {
        const pct = Math.round(r.ok / r.total * 100);
        const weakCount = {};
        r.results.forEach((res, i) => { if (res && !res.ok) { const q = qs[i]; const t = q.topic || (q.type === 'match' ? null : topicIds[i % Math.max(1, topicIds.length)]); if (t) weakCount[t] = (weakCount[t] || 0) + 1; } });
        const weak = Object.entries(weakCount).sort((a, b) => b[1] - a[1]).map(x => x[0]);
        const result = { id: doc.id, type: 'unit_exam', date: todayStr(), scores: { total: r.ok, max: r.total, pct }, passed: pct >= pass, weak, feedback_md: pct >= pass ? `**%${pct}** — ünite sınavını geçtin. ${weak.length ? 'Yine de şu konulara bir daha bak: ' + weak.map(w => grammarById(w)?.title_tr || w).join(', ') + '.' : ''}` : `**%${pct}** — geçme notu %${pass}. Zayıf konuları Kaynaklar'dan tekrar et; sınava yeniden girebilirsin.`, wrong: r.results.map((res, i) => res && !res.ok ? i : -1).filter(i => i >= 0), timeout: !!r.timeout };
        markWeak(weak, 2);
        await DB.writeDoc('exams/' + doc.id, result, 'exams');
        S.main.streak = computeStreak(); DB.save('main');
        pg.result = result; render();
      } });
  }
  const q = pg.quiz;
  handlers.__mount = () => { const rr = () => { const b = $('#examq'); if (!b) return; b.innerHTML = Quiz.html(q); Quiz.bind(q, rr); }; Quiz.bind(q, rr); };
  return `<section class="stack">${headBar(doc)}<div id="examq">${Quiz.html(q)}</div></section>`;
}

/* ============================================================
   Bugün
   ============================================================ */
const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
const platform = () => { const ua = navigator.userAgent || ''; if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'; if (/Android/i.test(ua)) return 'android'; return 'other'; };
function installHint() {
  if (Settings.get('installHintDismissed') || isStandalone()) return '';
  const p = platform(); if (p === 'other') return '';
  const how = p === 'ios' ? `Safari'de ${ico('share')} Paylaş → <b>Ana Ekrana Ekle</b>` : `Chrome'da ${ico('dots')} Menü → <b>Ana ekrana ekle</b>`;
  return `<div class="install"><div><b>Ana ekrana ekle</b><p>Uygulama gibi açılır, tam ekran çalışır: ${how}.</p></div><button class="iconbtn sm" data-act="dismiss-install" aria-label="Kapat">${ico('cross')}</button></div>`;
}
function welcomeHtml() {
  return `<section class="welcome fade-in">
    <div class="big">Hello, <em>I'm Uğur.</em></div>
    <p>İlk cümle bu. Her gün bir ders: önce dünün ödevi, sonra konu, kelimeler, dinleme, alıştırma, konuşma ve ödev. Cumartesi konuşma sınavı, pazar tekrar.</p>
    <ul class="steps-list">
      <li><span>1</span><span>Ayarlar'dan Claude ve GitHub anahtarlarını gir — konuşma ve kayıt bunlarla çalışır.</span></li>
      <li><span>2</span><span>Mikrofon izni ver; cevaplarını konuşarak ver, istersen yaz.</span></li>
      <li><span>3</span><span>Bugünün dersini aç ve başla.</span></li>
    </ul>
    <div class="row" style="margin-top:16px"><button class="btn primary" data-act="go-settings">${ico('gear')} Anahtarları gir</button></div>
  </section>`;
}
function viewToday() {
  const t = todayStr(); const wd = weekday(t);
  const weekly = plan().weekly || {};
  const kind = wd === 6 ? (weekly.sat || 'speaking_test') : wd === 0 ? (weekly.sun || 'review') : (weekly.mon_fri || 'lesson');
  const due = dueVocab().length;
  const curId = currentLessonId(); const cur = curId ? lessonDoc(curId) : null;
  const todayDoc = docForToday();
  const yesterday = addDays(t, -1);
  const yDoc = docsForDate(yesterday).find(d => d.type === 'lesson');
  const hwWarn = yDoc && yDoc.homework && !homeworkSubmitted(yDoc.id) ? yDoc : null;
  const habit = (todayDoc || cur)?.homework?.habit_tr;
  const firstRun = !S.main.startedAt && !AI.ready() && !Store.hasToken();
  let main = '';
  const lessonCard = (doc, label) => {
    const prog = lessonProgress(doc); const pl = planLesson(doc.id);
    const r = 36, circ = 2 * Math.PI * r; const offset = circ * (1 - prog.done / prog.total);
    const started = prog.done > 0; const done = !!S.main.completed[doc.id];
    return `<section class="card fade-in todaycard"><div class="hero"><div>
        <div class="day">${label}${pl ? ` · ${pl.unit.n}. ünite ${doc.lesson || pl.n}. ders` : ''}</div>
        <h1>${esc(doc.title_tr)}</h1><div class="en-title">${esc(doc.title_en || '')}</div>
        <ul class="goals">${(doc.goals_tr || []).map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>
      <div class="ring" role="img" aria-label="${prog.done} / ${prog.total} bölüm"><svg viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="${r}"/><circle class="bar" cx="42" cy="42" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg><div class="num"><b>${prog.done}/${prog.total}</b><span>bölüm</span></div></div></div>
      <div class="row between" style="margin-top:20px"><span class="hint">Yaklaşık ${doc.minutes || 30} dakika</span><button class="btn primary" data-act="open-lesson" data-id="${doc.id}">${done ? 'Tekrar bak' : started ? 'Devam et' : 'Başla'}</button></div></section>`;
  };
  if (kind === 'lesson') {
    if (todayDoc) main = lessonCard(todayDoc, 'Bugünün dersi');
    else main = `<section class="card fade-in"><div class="day" style="font-family:var(--font-display);color:var(--accent);font-weight:600">${DAY_TR[wd]} · ${fmtDate(t)}</div>
      <h1 style="font-family:var(--font-display);font-size:1.7rem;margin-top:6px">Bugünün dersi henüz hazırlanmadı</h1><p class="muted" style="margin-top:6px">Dersler sabah 09:00'da gelir.${S.lessonsState === 'loading' ? ' Yükleniyor…' : ''}</p>
      ${cur ? `<div class="row between" style="margin-top:16px"><span class="small muted">Kaldığın ders: <b>${esc(cur.title_tr)}</b></span><button class="btn primary" data-act="open-lesson" data-id="${cur.id}">Kaldığın dersten devam et</button></div>` : `<p class="hint" style="margin-top:12px">${Object.keys(S.lessons).length ? '' : 'Henüz hiç ders yüklenmedi.'}</p>`}</section>`;
  } else if (kind === 'speaking_test') {
    const spk = docsForDate(t).find(d => d.type === 'speaking_test') || lessonsByType('speaking_test').filter(d => !S.exams[d.id]).pop() || null;
    const res = spk && S.exams[spk.id];
    main = `<section class="card fade-in"><div class="day" style="font-family:var(--font-display);color:var(--accent);font-weight:600">Cumartesi · konuşma sınavı</div>
      <h1 style="font-family:var(--font-display);font-size:1.9rem;margin-top:6px">${esc(spk?.title_tr || 'Konuşma sınavı')}</h1><p class="muted" style="margin-top:6px">${spk ? `${(spk.test?.parts || []).length} bölüm · ~${spk.minutes || 15} dk · puan /20` : 'Bu haftanın sınavı henüz hazırlanmadı.'}</p>
      ${res ? `<div class="verdict ok" style="margin-top:14px"><b>Tamamlandı: ${res.scores?.total}/20</b></div>` : ''}
      <div class="row end" style="margin-top:16px">${spk ? `<button class="btn primary" data-act="open-exam" data-id="${spk.id}">${res ? 'Sonucu gör' : 'Sınava gir'}</button>` : ''}</div></section>`;
  } else {
    const rev = docsForDate(t).find(d => d.type === 'review') || lessonsByType('review').filter(d => !S.main.completed[d.id]).pop() || null;
    const ue = docsForDate(t).find(d => d.type === 'unit_exam') || lessonsByType('unit_exam').filter(d => !S.exams[d.id]).pop() || null;
    main = `<section class="card fade-in"><div class="day" style="font-family:var(--font-display);color:var(--accent);font-weight:600">Pazar · tekrar günü</div>
      <h1 style="font-family:var(--font-display);font-size:1.9rem;margin-top:6px">${esc(rev?.title_tr || 'Tekrar günü')}</h1><p class="muted" style="margin-top:6px">${rev ? 'Haftanın özeti, 20 karışık soru ve süresi gelen tüm kelimeler.' : 'Bu haftanın tekrarı henüz hazırlanmadı.'}</p>
      <div class="row end" style="margin-top:16px">${rev ? `<button class="btn primary" data-act="open-lesson" data-id="${rev.id}">${S.main.completed[rev.id] ? 'Tekrar bak' : 'Başla'}</button>` : ''}</div></section>
      ${ue ? `<section class="card flat"><div class="row between"><div><b>${esc(ue.title_tr)}</b><div class="muted small">Ünite bitti: ${(ue.exam?.questions || []).length} soru, geçme %${ue.exam?.pass || 70}.${S.exams[ue.id] ? ` Sonuç: %${S.exams[ue.id].scores?.pct}` : ''}</div></div><button class="btn ${S.exams[ue.id] ? 'ghost' : 'primary'}" data-act="open-exam" data-id="${ue.id}">${S.exams[ue.id] ? 'Sonucu gör' : 'Ünite sınavı'}</button></div></section>` : ''}`;
  }
  const doneCount = Object.keys(S.main.completed).filter(id => lessonDoc(id)?.type === 'lesson' || planLesson(id)).length;
  return topline(streakHtml()) + dbNote() + (firstRun ? welcomeHtml() : '') + installHint() + main + `
    ${hwWarn ? `<div class="banner bad">Dünkü ödev teslim edilmedi: <b>${esc(hwWarn.title_tr)}</b>. Sonraki ders ödev teslim edilince açılır. <button class="btn small ghost" style="margin-left:6px" data-act="open-lesson" data-id="${hwWarn.id}">Ödeve git</button></div>` : ''}
    ${habit ? `<div class="habit">${ico('spark')}<div><b>Bugünün mikro alışkanlığı</b><br>${esc(habit)}</div></div>` : ''}
    <section class="quick">
      <div class="stat"><div><b>${due}</b><span>kelime tekrar bekliyor</span></div><button class="btn small ${due ? 'primary' : 'soft'}" data-act="go-review" ${due ? '' : 'disabled'}>5 dakikalık tekrar</button></div>
      <div class="stat"><div><b>${doneCount}</b><span>ders bitti · seri ${S.main.streak || 0} gün</span></div><button class="btn small ghost" data-act="to-tab" data-tab="karne">Karneye bak</button></div>
    </section>`;
}

/* ============================================================
   Dersler — kur → üniteler → ders listesi
   ============================================================ */
let openUnits = null;
function viewLessons() {
  if (S.route) return S.route.kind === 'exam' ? viewExamRoute() : viewLessonPage();
  const p = plan();
  if (openUnits == null) { openUnits = new Set(); const cur = currentLessonId(); const pl = cur && planLesson(cur); if (pl) openUnits.add(pl.unit.id); else { const first = p.courses?.[0]?.units?.[0]; if (first) openUnits.add(first.id); } }
  handlers['toggle-unit'] = el => { const id = el.dataset.id; if (openUnits.has(id)) openUnits.delete(id); else openUnits.add(id); render(); };
  const STATUS = { done: ['done', ico('check'), 'bitti'], today: ['today', ico('dot'), 'bugün'], open: ['open', ico('chev'), 'açık'], locked: ['', ico('lock'), 'kilitli'], missing: ['', '·', 'hazırlanmadı'] };
  const courses = (p.courses || []).map(c => `
    <div class="stack"><h2 style="font-family:var(--font-display);font-size:1.6rem">${esc(c.title_tr)}</h2>
    ${(c.units || []).map(u => {
      const sts = (u.lessons || []).map(l => lessonStatus(l));
      const exam = u.exam_id ? lessonDoc(u.exam_id) : null; const examRes = u.exam_id && S.exams[u.exam_id];
      const allDone = sts.every(s => s === 'done');
      const open = openUnits.has(u.id);
      return `<div class="unit ${open ? 'open' : ''}"><button data-act="toggle-unit" data-id="${u.id}" aria-expanded="${open}">
          <span class="un">${u.n}</span><span><span class="ut">${esc(u.title_tr)}</span><br><span class="us">${esc(u.title_en || '')}</span></span>
          <span class="row" style="gap:10px"><span class="uprog">${sts.map(s => `<i class="${s === 'done' ? 'd' : s === 'today' ? 't' : ''}"></i>`).join('')}</span><span class="chev">${ico('chev')}</span></span></button>
        ${open ? `<div class="llist">${(u.lessons || []).map((l, i) => { const [cls, ic, lab] = STATUS[sts[i]]; const doc = lessonDoc(l.id); const can = ['done', 'today', 'open'].includes(sts[i]); const c = S.main.completed[l.id];
            return `<button class="lrow" data-act="open-lesson" data-id="${l.id}" ${can ? '' : 'disabled'}><span class="st ${cls}">${ic}</span><span><span class="lt">${l.n}. ${esc(l.title_tr)}</span><br><span class="ls">${esc(l.title_en || '')}</span></span><span class="meta">${c ? `${c.exercise_score}/${c.exercise_max}` : (doc?.date ? fmtDate(doc.date) : lab)}</span></button>`; }).join('')}
          <button class="lrow exam" data-act="open-exam" data-id="${u.exam_id}" ${exam && (allDone || examRes || sts.filter(s => s === 'done').length >= (u.lessons || []).length - 1) ? '' : 'disabled'}><span class="st ${examRes ? (examRes.passed ? 'done' : '') : ''}">${examRes ? (examRes.passed ? ico('check') : ico('cross')) : ico('star')}</span><span><span class="lt">Ünite sınavı</span><br><span class="ls">${exam ? `${(exam.exam?.questions || []).length} soru` : 'henüz hazırlanmadı'}</span></span><span class="meta">${examRes ? `%${examRes.scores?.pct}` : (allDone ? 'açık' : 'dersler bitince')}</span></button>
        </div>` : ''}</div>`;
    }).join('')}</div>`).join('');
  const spks = lessonsByType('speaking_test');
  const extra = spks.length ? `<div class="stack"><h2 style="font-family:var(--font-display);font-size:1.3rem">Konuşma sınavları</h2><div class="card flat" style="padding:0 16px">${spks.map(s => { const r = S.exams[s.id]; return `<button class="lrow" data-act="open-exam" data-id="${s.id}"><span class="st ${r ? 'done' : 'open'}">${r ? ico('check') : ico('mic')}</span><span><span class="lt">${esc(s.title_tr)}</span><br><span class="ls">${fmtDate(s.date)}</span></span><span class="meta">${r ? `${r.scores?.total}/20` : 'cumartesi'}</span></button>`; }).join('')}</div></div>` : '';
  return topline(streakHtml()) + `<section class="stack" style="gap:20px">${courses || `<div class="empty"><div class="en">No plan yet.</div><p>Kur planı bulunamadı (data/course/plan.json ya da content.js).</p></div>`}${extra}
    <p class="hint">Bir sonraki ders, öncekinin ödevi teslim edilince ve günü gelince açılır. Geçmiş dersler her zaman açık.</p></section>`;
}
function viewExamRoute() {
  const doc = lessonDoc(S.route.id);
  handlers.back = () => go('dersler');
  if (!doc) { DB.loadLesson(S.route.id).then(d => { if (d && S.route?.id === d.id) render(); }); return topline() + `<section class="stack"><button class="back" data-act="back">${ico('back')} Dersler</button><div class="empty"><div class="en">Not yet.</div><p>Bu sınav henüz hazırlanmadı.</p></div></section>`; }
  if (doc.type === 'speaking_test') return viewSpeakingTest(doc);
  if (doc.type === 'unit_exam') return viewUnitExam(doc);
  return viewLessonPage();
}

/* ============================================================
   Konuş — serbest sohbet
   ============================================================ */
const TOPICS = [
  { id: 'daily', label: 'Günlük', role: 'You are Sam, a friendly neighbor chatting about everyday life.', opener: 'Hi! How is your day going?' },
  { id: 'work', label: 'İş / ajans', role: 'You are Maya, a designer from another agency, curious about the learner\'s work at a design agency in Samsun.', opener: 'Hello! What do you do at your agency?' },
  { id: 'cafe', label: 'Kafe', role: 'You are a barista in a small café. Take the learner\'s order and chat a little.', opener: 'Hi there! What would you like to drink?' },
  { id: 'phone', label: 'Telefon', role: 'You are calling the learner on the phone from a client company to arrange a meeting. Speak slowly and simply.', opener: 'Hello, this is Anna from Blue Studio. Do you have a minute?' },
  { id: 'weekend', label: 'Hafta sonu', role: 'You are Leo, a friend asking about weekend plans.', opener: 'Hey! What are you doing this weekend?' },
];
let freeChat = null;
function viewSpeak() {
  const todayDoc = docForToday() || (currentLessonId() ? lessonDoc(currentLessonId()) : null);
  const topics = TOPICS.slice();
  if (todayDoc?.speaking) topics.unshift({ id: 'lesson', label: 'Bugünün dersinden konuş', role: todayDoc.speaking.role_en, opener: todayDoc.speaking.opener_en, targets: todayDoc.speaking.targets, scenario: todayDoc.speaking.scenario_tr, topic: todayDoc.title_en });
  const topic = topics.find(t => t.id === S.sub) || null;
  if (topic && (!freeChat || freeChat.topicId !== topic.id)) {
    if (freeChat) freeChat.stop();
    freeChat = Chat.create({ rules: chatRules({ role: topic.role, targets: topic.targets, scenario: topic.scenario, topic: topic.topic }), opener: topic.opener, targets: topic.targets || [], askMe: true, lessonId: 'free:' + topic.id,
      scenarioHtml: `<b>${esc(topic.label)}</b> · ${topic.scenario ? esc(topic.scenario) : 'serbest sohbet. İstediğin zaman konu değiştirebilirsin.'}` });
    freeChat.topicId = topic.id;
  }
  const chat = topic ? freeChat : null;
  handlers.topic = el => { S.sub = el.dataset.id; render(); };
  handlers['chat-end'] = () => { if (chat && chat.userTurns > 0) Chat.finish(chat, mountChat(chat, 'chatbox')); };
  handlers.__mount = () => { if (chat) mountChat(chat, 'chatbox'); };
  const dead = !aiReady();
  return topline(streakHtml()) + `
  <section class="stack">
    ${pageTitle('Serbest sohbet', 'Free talk')}
    <p class="muted">Bir konu seç; mikrofona dokun ve İngilizce konuş, ya da yaz. Hata yaparsan sarı notla düzeltilir.</p>
    <div class="topics">${topics.map(t => `<button class="btn small ghost ${S.sub === t.id ? 'on' : ''}" data-act="topic" data-id="${t.id}">${esc(t.label)}</button>`).join('')}</div>
    ${dead && !topic ? keyCard() : ''}
    <div id="chatbox">${chat ? Chat.html(chat) : `<div class="card flat" style="text-align:center"><div class="en" style="font-size:1.5rem">Let's talk.</div><p class="muted small" style="margin-top:6px">Yukarıdan bir konu seçince sohbet başlar.</p></div>`}</div>
    ${chat && !chat.finished ? `<div class="row end"><button class="btn ghost small" data-act="chat-end">Sohbeti bitir, geri bildirim al</button></div>` : ''}
  </section>`;
}

/* ============================================================
   Kaynaklar — gramer, kelime defteri, yöntem
   ============================================================ */
let resSeg = 'gramer', vocabFilter = { level: 'all', unit: 'all', q: '' };
function viewResources() {
  if (S.sub === 'srs') return viewSrs();
  if (S.sub && S.sub.startsWith('g:')) { const g = grammarById(S.sub.slice(2)); if (g) return grammarDetail(g); }
  handlers.seg = el => { resSeg = el.dataset.seg; render(); };
  const segs = `<div class="segs">${[['gramer', 'Gramer'], ['kelime', 'Kelime defteri'], ['yontem', 'Nasıl öğreniyoruz?']].map(([id, l]) => `<button class="${resSeg === id ? 'on' : ''}" data-act="seg" data-seg="${id}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (resSeg === 'gramer') {
    const topics = (C?.grammar || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const coveredBy = id => flatLessons().find(l => (l.grammar || []).includes(id));
    handlers['open-g'] = el => { S.sub = 'g:' + el.dataset.id; S.gq = null; render(); };
    body = `<div class="card tight"><div class="glist">${topics.map((g, i) => { const l = coveredBy(g.id); const done = l && S.main.completed[l.id]; const weak = S.main.weak[g.id] || 0;
      return `<button class="gitem" data-act="open-g" data-id="${g.id}"><span class="n">${i + 1}</span><span><span class="t">${esc(g.title_tr)}</span><br><span class="s">${esc(g.title_en)}</span>${l ? `<span class="hint"> · ${l.unit.n}.${l.n}</span>` : ''}${weak >= 3 ? `<span class="hint" style="color:var(--bad)"> · zayıf</span>` : ''}</span><span class="mark ${done ? 'done' : ''}">${done ? ico('check') : '·'}</span></button>`; }).join('')}</div></div>`;
  } else if (resSeg === 'kelime') {
    body = vocabBook();
  } else {
    const m = C?.method;
    body = m ? `<div class="stack" style="gap:18px">${(m.sections || []).map(s => `<div class="sub" style="margin:0"><h3>${esc(s.h)}</h3>${md(s.md)}</div>`).join('')}</div>` : `<div class="banner info">Yöntem sayfası content.js içinde yok.</div>`;
  }
  return topline(streakHtml()) + `<section class="stack">${pageTitle('Kaynaklar')}${segs}${body}</section>`;
}
function vocabBook() {
  const pool = (C?.vocab_pool || []).slice();
  const extra = []; for (const l of Object.values(S.lessons)) for (const w of (l?.vocab || [])) if (!pool.some(p => p.id === w.id) && !extra.some(e => e.id === w.id)) extra.push({ ...w, unit: 'u' + l.unit, level: 'A1.1' });
  const all = pool.concat(extra);
  const levels = [...new Set(all.map(w => w.level).filter(Boolean))].sort();
  const units = [...new Set(all.map(w => w.unit).filter(Boolean))].sort();
  const f = vocabFilter;
  const counts = { new: 0, learn: 0, known: 0 }; all.forEach(w => counts[vocabStatus(w.id)]++);
  const due = dueVocab();
  handlers['f-level'] = el => { f.level = el.dataset.v; render(); };
  handlers['f-unit'] = el => { f.unit = el.dataset.v; render(); };
  handlers.srs = () => { S.sub = 'srs'; S.srs = null; render(); };
  handlers.__mount = () => { const i = $('#vsearch'); if (i) i.addEventListener('input', () => { f.q = i.value; const list = $('#vlist'); if (list) list.innerHTML = rows(); }); };
  const rows = () => { const fl = all.filter(w => (f.level === 'all' || w.level === f.level) && (f.unit === 'all' || w.unit === f.unit) && (!f.q || normalize(w.en).includes(normalize(f.q)) || normalize(w.tr).includes(normalize(f.q))));
    if (!fl.length) return `<p class="hint" style="padding:16px 0">Eşleşen kelime yok.</p>`;
    return `<div class="vlist">${fl.map(w => { const e = S.vocab[w.id]; const b = e?.box || 0; const st = vocabStatus(w.id); return `<div class="vrow"><div><div class="en">${esc(w.en)}</div><div class="tr">${esc(w.tr)}${w.ex_en ? ` <span class="hint">· ${esc(w.ex_en)}</span>` : ''}</div></div><span class="row" style="gap:8px"><span class="vstat ${st}">${st === 'new' ? 'yeni' : st === 'learn' ? 'tekrar' : 'öğrenildi'}</span><span class="boxes" title="Kutu ${b}/5">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= b ? 'on' : ''}"></i>`).join('')}</span></span>${sayBtn(w.en)}</div>`; }).join('')}</div>`; };
  return `<div class="stack">
    <div class="card"><div class="row between"><div><b style="font-size:1.2rem">${due.length ? `Bugün tekrar: ${due.length} kelime` : 'Bugün tekrar yok'}</b><div class="muted small">${due.length ? 'Hatırladıkların bir sonraki kutuya geçer.' : 'Yeni kelimeler derslerle gelir; süresi gelenler burada belirir.'}</div></div><button class="btn primary" data-act="srs" ${due.length ? '' : 'disabled'}>Tekrara başla</button></div></div>
    <div class="stats"><div class="stat"><b>${counts.known}</b><span>öğrenildi</span></div><div class="stat"><b>${counts.learn}</b><span>tekrarda</span></div><div class="stat"><b>${counts.new}</b><span>yeni · ${all.length} toplam</span></div></div>
    <div class="filters"><button class="btn small ghost ${f.level === 'all' ? 'on' : ''}" data-act="f-level" data-v="all">Tüm seviyeler</button>${levels.map(l => `<button class="btn small ghost ${f.level === l ? 'on' : ''}" data-act="f-level" data-v="${l}">${l}</button>`).join('')}</div>
    <div class="filters"><button class="btn small ghost ${f.unit === 'all' ? 'on' : ''}" data-act="f-unit" data-v="all">Tüm üniteler</button>${units.map(u => `<button class="btn small ghost ${f.unit === u ? 'on' : ''}" data-act="f-unit" data-v="${u}">${u.replace('u', '')}. ünite</button>`).join('')}</div>
    <div class="search"><input class="input body" id="vsearch" type="search" placeholder="Kelime ara (İngilizce ya da Türkçe)" value="${esc(f.q)}" autocomplete="off"></div>
    <div id="vlist">${rows()}</div></div>`;
}
function grammarDetail(g) {
  if (!S.gq) S.gq = Quiz.create({ questions: g.quick_check || [], topicIds: [g.id], doneText: 'Hızlı kontrol bitti.', doneLabel: 'Yeniden çöz', onDone: () => { S.gq = null; render(); } });
  const q = S.gq;
  handlers.back = () => { S.sub = null; S.gq = null; render(); };
  handlers.__mount = () => { const rr = () => { const b = $('#gq'); if (!b) return; b.innerHTML = Quiz.html(q); Quiz.bind(q, rr); }; Quiz.bind(q, rr); };
  const l = flatLessons().find(x => (x.grammar || []).includes(g.id));
  return topline() + `<section class="stack fade-in"><button class="back" data-act="back">${ico('back')} Kaynaklar</button>
    <div class="lesson-top" style="padding-left:0"><div class="kicker">Gramer · ${esc(g.level || 'A1')}${l ? ` · ${l.unit.n}. ünite ${l.n}. ders` : ''}</div><h1 style="font-size:1.8rem">${esc(g.title_tr)}</h1><div class="en-title">${esc(g.title_en)}</div></div>
    ${md(g.explain_md || '')}
    ${(g.tables || []).map(t => tableHtml(t)).join('')}
    ${g.examples?.length ? `<div class="sub"><h3>Örnekler</h3><div class="card flat tight">${exampleRows(g.examples)}</div></div>` : ''}
    ${g.mistakes?.length ? `<div class="sub"><h3>Sık hatalar</h3><div class="card flat tight">${mistakesHtml({ items: g.mistakes })}</div></div>` : ''}
    ${(g.quick_check || []).length ? `<div class="sub"><h3>Hızlı kontrol</h3><div id="gq">${Quiz.html(q)}</div></div>` : ''}
  </section>`;
}
function viewSrs() {
  if (!S.srs) S.srs = { deck: shuffle(dueVocab()), i: 0, flipped: false, again: [], ok: 0, no: 0 };
  const st = S.srs;
  handlers.back = () => { S.sub = null; S.srs = null; resSeg = 'kelime'; render(); };
  if (st.i >= st.deck.length) {
    if (st.again.length) { st.deck = st.again; st.again = []; st.i = 0; st.flipped = false; }
    else return topline() + `<section class="stack fade-in"><button class="back" data-act="back">${ico('back')} Kaynaklar</button><div class="card" style="text-align:center"><div class="en" style="font-size:1.8rem">${st.ok + st.no ? 'All caught up.' : 'Nothing due.'}</div><p class="muted" style="margin-top:6px">${st.ok} hatırladın, ${st.no} tekrara düştü.</p></div><div class="row end"><button class="btn primary" data-act="back">Kelime defterine dön</button></div></section>`;
  }
  const w = wordInfo(st.deck[st.i]);
  if (!w) { st.i++; return viewSrs(); }
  handlers.flip = () => { st.flipped = !st.flipped; render(); };
  handlers.yes = () => { gradeVocab(w.id, true); st.ok++; st.i++; st.flipped = false; render(); };
  handlers.no = () => { gradeVocab(w.id, false); st.no++; st.again.push(w.id); st.i++; st.flipped = false; render(); };
  const e = S.vocab[w.id] || {};
  return topline() + `<section class="stack fade-in">
    <div class="row between"><button class="back" data-act="back">${ico('back')} Kaynaklar</button><span class="hint">${st.i + 1} / ${st.deck.length} · kutu ${e.box || 0}</span></div>
    <div class="flash ${st.flipped ? 'flipped' : ''}"><button type="button" class="face" data-act="flip" aria-label="Kartı çevir">${st.flipped ? `<div class="tr">${esc(w.tr)}</div><div class="exm"><span class="en">${esc(w.ex_en || '')}</span>${esc(w.ex_tr || '')}</div>` : `<div class="en">${esc(w.en)}</div><div class="pos">${esc(w.pos || '')}</div><span class="hint">anlamını düşün, sonra çevir</span>`}</button></div>
    <div class="row between">${sayBtn(w.en)}${st.flipped ? `<div class="judge" style="flex:1"><button class="btn ghost" data-act="no">Hatırlamadım</button><button class="btn primary" data-act="yes">Hatırladım</button></div>` : `<button class="btn primary" data-act="flip">Göster</button>`}</div>
  </section>`;
}

/* ============================================================
   Karne
   ============================================================ */
function bar(label, val, max, suffix = '', neutral = false) { const pct = max ? Math.round(val / max * 100) : 0; return `<div class="brow"><span class="lab" title="${esc(label)}">${esc(label)}</span><span class="track"><i class="${!neutral && pct >= 70 ? 'good' : ''}" style="width:${pct}%"></i></span><span class="val">${suffix || `${val}/${max}`}</span></div>`; }
function viewReport() {
  const comp = Object.entries(S.main.completed || {});
  const lessonsDone = comp.filter(([id]) => (lessonDoc(id)?.type || 'lesson') === 'lesson').length;
  const unitsDone = (plan().courses || []).flatMap(c => c.units || []).filter(u => (u.lessons || []).every(l => S.main.completed[l.id])).length;
  const exTot = comp.reduce((a, [, c]) => a + (c.exercise_score || 0), 0), exMax = comp.reduce((a, [, c]) => a + (c.exercise_max || 0), 0);
  const avg = exMax ? Math.round(exTot / exMax * 100) : 0;
  const grades = Object.entries(S.grades || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const spk = Object.values(S.exams).filter(x => x.type === 'speaking_test').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const ue = Object.values(S.exams).filter(x => x.type === 'unit_exam').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const weak = Object.entries(S.main.weak || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxWeak = weak.length ? weak[0][1] : 1;
  const vocabIds = Object.keys(S.vocab); const vc = { new: 0, learn: 0, known: 0 }; vocabIds.forEach(id => vc[vocabStatus(id)]++);
  const talks = Object.values(S.speaking).flat().length;
  const minutes = comp.reduce((a, [, c]) => a + (c.minutes || 0), 0);
  const u = Usage.month();
  const monthName = (() => { try { return new Intl.DateTimeFormat('tr-TR', { month: 'long' }).format(new Date()); } catch (e) { return 'bu ay'; } })();
  return topline(streakHtml()) + `<section class="stack" style="gap:18px">${pageTitle('Karne', 'Report card')}
    <div class="scorecards" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><b>${S.main.streak || 0}</b><span>gün seri</span></div><div class="stat"><b>${lessonsDone}</b><span>ders bitti</span></div><div class="stat"><b>${unitsDone}</b><span>ünite bitti</span></div><div class="stat"><b>%${avg}</b><span>alıştırma ort.</span></div><div class="stat"><b>${minutes}</b><span>dakika</span></div><div class="stat"><b>${talks}</b><span>konuşma</span></div></div>
    <div class="card">${sectionTitle('Alıştırma skorları')}${comp.length ? `<div class="bars">${comp.sort((a, b) => String(a[1].date).localeCompare(String(b[1].date))).map(([id, c]) => bar(lessonDoc(id)?.title_tr || planLesson(id)?.title_tr || id, c.exercise_score || 0, c.exercise_max || 0)).join('')}</div>` : `<p class="hint">Henüz tamamlanan ders yok.</p>`}</div>
    <div class="card">${sectionTitle('Ödev notları')}${grades.length ? `<div class="bars">${grades.map(([id, g]) => bar(lessonDoc(id)?.title_tr || id, (g.written || 0) + (g.spoken || 0), (g.max || 10) * 2, `${g.written ?? '–'} · ${g.spoken ?? '–'} /${g.max || 10}`)).join('')}</div>` : `<p class="hint">Ödev notları sabah kontrolünden sonra burada görünür (yazılı · sesli).</p>`}</div>
    <div class="card">${sectionTitle('Konuşma sınavları (puan / 20)')}${spk.length ? `<div class="timeline">${spk.map(x => `<button class="tl" data-act="open-exam" data-id="${x.id}" style="text-align:left;width:100%"><span class="d">${fmtDate(x.date)}</span><span><b>${x.scores?.total ?? 0}</b><span class="hint"> / 20 · ${Object.keys(RUBRIC_TR).map(k => `${RUBRIC_TR[k].slice(0, 3)} ${x.scores?.[k] ?? 0}`).join(' · ')}</span></span><span class="pill ${x.passed ? 'ok' : 'no'}">${x.passed ? 'geçti' : 'tekrar'}</span></button>`).join('')}</div>` : `<p class="hint">İlk konuşma sınavı cumartesi.</p>`}</div>
    <div class="card">${sectionTitle('Ünite sınavları')}${ue.length ? `<div class="timeline">${ue.map(x => `<button class="tl" data-act="open-exam" data-id="${x.id}" style="text-align:left;width:100%"><span class="d">${fmtDate(x.date)}</span><span><b>${lessonDoc(x.id)?.title_tr || x.id}</b> <span class="hint">%${x.scores?.pct ?? 0}</span></span><span class="pill ${x.passed ? 'ok' : 'no'}">${x.passed ? 'geçti' : 'kaldı'}</span></button>`).join('')}</div>` : `<p class="hint">Ünite bitince sınav açılır.</p>`}</div>
    <div class="card">${sectionTitle('Zayıf konular')}${weak.length ? `<div class="bars">${weak.map(([id, n]) => bar(grammarById(id)?.title_tr || id, n, maxWeak, `${n} hata`, true)).join('')}</div>` : `<p class="hint">Henüz zayıf konu işaretlenmedi.</p>`}</div>
    <div class="card">${sectionTitle('Kelime durumu')}<div class="bars">${bar('Öğrenildi', vc.known, vocabIds.length || 1)}${bar('Tekrarda', vc.learn, vocabIds.length || 1)}${bar('Bugün bekleyen', dueVocab().length, vocabIds.length || 1)}</div></div>
    <div class="card flat"><div class="row between"><div><b>Bu ay Claude harcaması ≈ $${u.cost.toFixed(2)}</b><div class="muted small">${esc(monthName)}: ${u.calls} çağrı, ${Math.round(u.tokens / 1000)}k token. Yaklaşık; haiku $1/$5, sonnet $3/$15 (1M token).</div></div></div></div>
  </section>`;
}

/* ============================================================
   Ayarlar
   ============================================================ */
const setState = { claudeStatus: '', claudeOk: null, ghStatus: '', ghOk: null, showClaude: false, showGh: false, busy: false };
function viewSettings() {
  const st = setState;
  if (st.ghKey !== Keys.github()) { st.ghStatus = ''; st.ghOk = null; st.ghKey = Keys.github(); }
  if (st.claudeKey !== Keys.claude()) { st.claudeStatus = ''; st.claudeOk = null; st.claudeKey = Keys.claude(); }
  const en = Sound.enVoices();
  const sw = (key, label, desc) => `<div class="set-row"><div><div class="lab">${label}</div>${desc ? `<div class="desc">${desc}</div>` : ''}</div><button class="switch" role="switch" aria-checked="${Settings.get(key) ? 'true' : 'false'}" data-act="sw" data-key="${key}" aria-label="${label}"></button></div>`;
  handlers.sw = el => { Settings.set(el.dataset.key, !Settings.get(el.dataset.key)); render(); };
  handlers['set-mic'] = el => { Settings.set('micMode', el.dataset.v); render(); };
  handlers['set-rate'] = el => { Sound.slow = el.dataset.v === 'slow'; render(); };
  handlers['toggle-claude'] = () => { st.showClaude = !st.showClaude; render(); };
  handlers['toggle-gh'] = () => { st.showGh = !st.showGh; render(); };
  handlers['save-claude'] = async () => { Keys.setClaude($('#claude-key')?.value); st.claudeKey = Keys.claude(); st.claudeStatus = Keys.claude() ? 'Kaydedildi (sadece bu cihazda).' : 'Anahtar silindi.'; st.claudeOk = null; render(); };
  handlers['test-claude'] = async () => {
    Keys.setClaude($('#claude-key')?.value); st.claudeKey = Keys.claude();
    if (!Keys.claude()) { st.claudeStatus = AI_MSG.nokey; st.claudeOk = false; render(); return; }
    st.busy = true; st.claudeStatus = 'Deneniyor…'; st.claudeOk = null; render();
    try { const r = await AI.test(); st.claudeStatus = `Bağlı · ${r.model} · ${r.ms} ms`; st.claudeOk = true; }
    catch (e) { st.claudeStatus = aiMessage(e) + (e.detail ? ` (${e.detail.slice(0, 80)})` : ''); st.claudeOk = false; }
    st.busy = false; render();
  };
  handlers['save-gh'] = async () => { Keys.setGithub($('#gh-key')?.value); st.ghKey = Keys.github(); st.ghStatus = Keys.github() ? 'Kaydedildi (sadece bu cihazda).' : 'Anahtar silindi.'; st.ghOk = null; render(); if (Keys.github() && Store.queueCount()) { const n = await Store.flush(); if (n) toast(`${n} bekleyen kayıt GitHub'a yazıldı.`); render(); } };
  handlers['test-gh'] = async () => {
    Keys.setGithub($('#gh-key')?.value); st.ghKey = Keys.github();
    if (!Keys.github()) { st.ghStatus = 'GitHub anahtarı yok; okumalar Pages üzerinden, yazmalar bu cihazda bekler.'; st.ghOk = false; render(); return; }
    st.busy = true; st.ghStatus = 'Deneniyor…'; st.ghOk = null; render();
    try { const r = await Store.test(); st.ghStatus = `Bağlı · son yazma: ${r.lastWrite ? fmtTime(r.lastWrite) : 'henüz yok'}${r.remaining ? ` · kalan istek ${r.remaining}` : ''}`; st.ghOk = true; Store.authError = null; if (Store.queueCount()) { const n = await Store.flush(); if (n) toast(`${n} bekleyen kayıt yazıldı.`); } }
    catch (e) { st.ghStatus = e.status === 401 ? 'GitHub anahtarı geçersiz.' : e.status === 403 ? 'Erişim yok: anahtarın bu depoda "Contents: read and write" izni olmalı.' : e.status === 404 ? 'Depo ya da dosya bulunamadı.' : 'GitHub\'a ulaşılamadı: ' + (e.message || ''); st.ghOk = false; }
    st.busy = false; render();
  };
  handlers.reload = async () => { st.busy = true; toast('Veriler yeniden yükleniyor…'); render(); Store.mem = {}; await DB.init(true); st.busy = false; toast('Veriler yenilendi.'); render(); };
  handlers['clear-cache'] = async () => {
    Store.clearCache(); LS.del('index');
    try { if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage('clear-cache'); const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } catch (e) { /* yoksay */ }
    toast('Önbellek temizlendi; veriler yeniden yükleniyor.'); await DB.init(true); render();
  };
  handlers['voice'] = el => { Settings.set('voice', el.value); Sound.init(); };
  handlers['test-voice'] = () => Sound.speak('Hello! Nice to meet you. How are you today?');
  handlers.__mount = () => { const sel = $('#voice-sel'); if (sel) sel.addEventListener('change', () => { Settings.set('voice', sel.value); Sound.voices = []; Sound.init(); }); };
  const q = Store.queueCount();
  const ghState = !Keys.github() ? `Anahtar yok: dersler Pages'ten okunur (birkaç dakika gecikebilir), ilerleme bu cihazda bekler.${q ? ` <b>${q} kayıt senkronize edilmedi.</b>` : ''}` : (Store.authError ? 'Son istek reddedildi; anahtarı kontrol et.' : (q ? `${q} kayıt yazılmayı bekliyor.` : (Store.lastWrite ? `Son yazma: ${fmtTime(Store.lastWrite)}` : 'Henüz yazma yapılmadı.')));
  return topline() + `<section class="stack" style="gap:16px">${pageTitle('Ayarlar')}
    <div class="set-group" id="grp-claude"><h3>Claude</h3>
      <div class="set-row col"><div><div class="lab">API anahtarı</div><div class="desc">Konuşma pratiği, sınav ve değerlendirme için. Sadece bu cihazda saklanır; depoya yazılmaz.</div>
        <div class="keyfield"><input class="input" id="claude-key" type="${st.showClaude ? 'text' : 'password'}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-…" value="${esc(Keys.claude())}"><button class="iconbtn" data-act="toggle-claude" aria-label="${st.showClaude ? 'Gizle' : 'Göster'}">${ico(st.showClaude ? 'eyeoff' : 'eye')}</button></div>
        <div class="row" style="margin-top:10px"><button class="btn small primary" data-act="save-claude">Kaydet</button><button class="btn small ghost" data-act="test-claude" ${st.busy ? 'disabled' : ''}>Bağlantıyı test et</button></div>
        <div class="status ${st.claudeOk === true ? 'ok' : st.claudeOk === false ? 'bad' : ''}">${esc(st.claudeStatus || (Keys.claude() ? 'Anahtar kayıtlı.' : 'Anahtar yok.'))}</div></div></div>
    </div>
    <div class="set-group" id="grp-gh"><h3>GitHub</h3>
      <div class="set-row col"><div><div class="lab">Depo anahtarı</div><div class="desc">İlerleme ve ödevler <code>${CFG.owner}/${CFG.repo}</code> deposuna yazılır. Fine-grained token, sadece bu depo, "Contents: read and write".</div>
        <div class="keyfield"><input class="input" id="gh-key" type="${st.showGh ? 'text' : 'password'}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…" value="${esc(Keys.github())}"><button class="iconbtn" data-act="toggle-gh" aria-label="${st.showGh ? 'Gizle' : 'Göster'}">${ico(st.showGh ? 'eyeoff' : 'eye')}</button></div>
        <div class="row" style="margin-top:10px"><button class="btn small primary" data-act="save-gh">Kaydet</button><button class="btn small ghost" data-act="test-gh" ${st.busy ? 'disabled' : ''}>Bağlantıyı test et</button></div>
        <div class="status ${st.ghOk === true ? 'ok' : st.ghOk === false ? 'bad' : ''}">${st.ghStatus ? esc(st.ghStatus) : ghState}</div></div></div>
    </div>
    <div class="set-group"><h3>Ses</h3>
      ${sw('autoSpeak', 'Otomatik seslendirme', 'Asistanın cevabı gelince okunur.')}
      ${sw('autoListen', 'Cevaptan sonra mikrofonu aç', 'Okuma bitince dinlemeye geçer; gerçek sohbet hissi. (Dokun modunda)')}
      <div class="set-row"><div><div class="lab">Mikrofon</div><div class="desc">Dokun: aç/kapa. Bas-konuş: basılı tutarken dinler, bırakınca gönderir.</div></div><span class="rate"><button type="button" data-act="set-mic" data-v="tap" class="${Settings.get('micMode') !== 'hold' ? 'on' : ''}">Dokun</button><button type="button" data-act="set-mic" data-v="hold" class="${Settings.get('micMode') === 'hold' ? 'on' : ''}">Bas-konuş</button></span></div>
      <div class="set-row"><div><div class="lab">Konuşma hızı</div></div><span class="rate"><button type="button" data-act="set-rate" data-v="normal" class="${Sound.slow ? '' : 'on'}">Normal</button><button type="button" data-act="set-rate" data-v="slow" class="${Sound.slow ? 'on' : ''}">Yavaş</button></span></div>
      <div class="set-row col"><div><div class="lab">Ses</div><div class="desc">${en.length ? 'Cihazdaki İngilizce sesler.' : 'Bu cihazda İngilizce ses listesi bulunamadı; varsayılan kullanılır.'}</div>
        <div class="row" style="margin-top:8px"><select class="input" id="voice-sel" style="flex:1;min-width:0"><option value="">Otomatik (${esc(Sound.voice?.name || 'en-US')})</option>${en.map(v => `<option value="${esc(v.name)}" ${Settings.get('voice') === v.name ? 'selected' : ''}>${esc(v.name)} · ${esc(v.lang)}</option>`).join('')}</select><button class="btn small ghost" data-act="test-voice">${ico('speaker')} Dene</button></div></div></div>
      <div class="set-row"><div><div class="lab">Ses tanıma</div><div class="desc">${Sound.canListen() ? 'Bu tarayıcıda mikrofonla konuşma tanıma var.' : 'Bu tarayıcıda ses tanıma yok (Safari ya da Chrome kullan).'}</div></div></div>
    </div>
    <div class="set-group"><h3>Veri</h3>
      <div class="set-row"><div><div class="lab">Verileri yeniden yükle</div><div class="desc">Ders ve ilerlemeyi depodan tazeler.</div></div><button class="btn small ghost" data-act="reload" ${st.busy ? 'disabled' : ''}>${ico('refresh')} Yükle</button></div>
      <div class="set-row"><div><div class="lab">Önbelleği temizle</div><div class="desc">Yerel kopyaları ve uygulama kabuğunu siler; anahtarlar kalır.</div></div><button class="btn small ghost" data-act="clear-cache">Temizle</button></div>
    </div>
    <div class="version">İngilizce Koçu v${VERSION} · ${isStandalone() ? 'ana ekran uygulaması' : 'tarayıcı'} · ${S.online ? 'çevrimiçi' : 'çevrimdışı'}</div>
  </section>`;
}

/* ============================================================
   Başlangıç
   ============================================================ */
function render() {
  handlers = {};
  const app = $('#app');
  Sound.stop();
  let html = '';
  try {
    commonHandlers();
    if (!C) {
      html = topline() + `<div class="banner bad"><b>İçerik yüklenemedi.</b> content.js dosyası bulunamadı ya da window.CONTENT tanımlı değil.</div>`;
    } else if (S.route) {
      html = S.route.kind === 'exam' ? viewExamRoute() : viewLessonPage();
    } else {
      switch (S.tab) {
        case 'bugun': html = viewToday(); break;
        case 'dersler': html = viewLessons(); break;
        case 'konus': html = viewSpeak(); break;
        case 'kaynaklar': html = viewResources(); break;
        case 'karne': html = viewReport(); break;
        case 'ayarlar': html = viewSettings(); break;
        default: html = viewToday();
      }
    }
  } catch (e) { console.error(e); html = `<div class="banner bad">Bu ekran çizilemedi: ${esc(e.message || e)}</div>`; }
  app.innerHTML = html;
  renderTabs();
  try { if (handlers.__mount) handlers.__mount(app); } catch (e) { console.error(e); toast('Ekran hazırlanırken hata oluştu.'); }
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  try { navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw', e)); } catch (e) { /* yoksay */ }
}
async function boot() {
  Sound.init();
  S.tab = LS.get('tab') || 'bugun';
  if (!applyHash()) { setHash('tab-' + S.tab); }
  DB.loadLocal();
  render();
  if (!C) return;
  registerSW();
  await DB.init(true);
  render();
}
boot();
// Test kancası (headless test düzeneği için; anahtar içermez)
window.__IK = { S, Store, AI, Settings, Keys, DB, render, version: VERSION };
})();
