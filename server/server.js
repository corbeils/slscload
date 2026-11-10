// Serveur auto-hébergé : sert la page, authentifie les utilisateurs et fournit l'API de données (équivalent de claude.db / claude.user).
// Aucune dépendance externe. Données dans DATA_DIR (store.json, users.json, secret).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 3000);
const DATA = process.env.DATA_DIR || path.join(ROOT, '..', 'data');
const PAGE = process.env.PAGE_FILE || path.join(ROOT, '..', 'dist', 'planificateur.html');
const ADMIN_ONLY = new Set(['equipment', 'roles', 'tiedowns']); // collections modifiables par les administrateurs seulement
fs.mkdirSync(DATA, { recursive: true });

// ---------- stockage (fichiers JSON, écriture atomique)
const file = (n) => path.join(DATA, n);
const readJson = (n, d) => { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return d; } };
const writeJson = (n, v) => { const t = file(n) + '.tmp'; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, file(n)); };
let store = readJson('store.json', {});     // { "collection/id": {...} }
let users = readJson('users.json', []);     // [{ id, name, pass, admin }]
let saveT = null;
const saveStore = () => { clearTimeout(saveT); saveT = setTimeout(() => writeJson('store.json', store), 150); };
process.on('SIGTERM', () => { writeJson('store.json', store); process.exit(0); });

let secret = '';
try { secret = fs.readFileSync(file('secret'), 'utf8'); } catch { secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(file('secret'), secret, { mode: 0o600 }); }

// ---------- utilisateurs
export const hashPass = (p) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(p, s, 32).toString('hex'); };
const checkPass = (p, h) => { const [s, k] = String(h).split(':'); if (!s || !k) return false; const a = Buffer.from(k, 'hex'), b = crypto.scryptSync(p, s, 32); return a.length === b.length && crypto.timingSafeEqual(a, b); };
if (!users.length && process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
  users.push({ id: 'u' + crypto.randomBytes(5).toString('hex'), name: process.env.ADMIN_USER, pass: hashPass(process.env.ADMIN_PASSWORD), admin: true });
  writeJson('users.json', users);
  console.log('Administrateur initial créé :', process.env.ADMIN_USER);
}

// ---------- sessions (cookie signé, 30 jours)
const sign = (v) => crypto.createHmac('sha256', secret).update(v).digest('hex');
const makeToken = (uid) => { const exp = Date.now() + 30 * 864e5, b = uid + '.' + exp; return b + '.' + sign(b); };
function userFrom(req) {
  const c = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ''); if (!c) return null;
  const [uid, exp, sig] = decodeURIComponent(c[1]).split('.');
  if (!sig || sign(uid + '.' + exp) !== sig || +exp < Date.now()) return null;
  return users.find((u) => u.id === uid) || null;
}
const attempts = new Map();
const tooMany = (ip) => { const n = Date.now(), a = (attempts.get(ip) || []).filter((t) => n - t < 6e4); attempts.set(ip, a); return a.length >= 10; };

// ---------- événements en direct (SSE)
const clients = new Set();
const emit = (col) => { for (const r of clients) r.write(`data: ${JSON.stringify({ c: col })}\n\n`); };

// ---------- utilitaires HTTP
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = (req) => new Promise((ok, ko) => { let b = '', n = 0; req.on('data', (d) => { n += d.length; if (n > 1e6) { ko(new Error('trop gros')); req.destroy(); } else b += d; }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ko(e); } }); });
const COL = /^[a-z0-9_-]{1,40}$/i, DOC = /^[a-z0-9_-]{1,40}\/[A-Za-z0-9_-]{1,80}$/;
const secure = (req) => req.headers['x-forwarded-proto'] === 'https';
const shim = fs.readFileSync(path.join(ROOT, 'claude-shim.js'), 'utf8');
const loginHtml = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname, me = userFrom(req);
    if (p === '/healthz') return json(res, 200, { ok: true });
    if (p === '/login' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(loginHtml); }
    if (p === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || '';
      if (tooMany(ip)) return json(res, 429, { error: 'Trop de tentatives, réessaie dans une minute.' });
      users = readJson('users.json', users);
      const b = await body(req), u = users.find((x) => x.name.toLowerCase() === String(b.user || '').toLowerCase());
      if (!u || !checkPass(String(b.password || ''), u.pass)) { attempts.get(ip).push(Date.now()); return json(res, 401, { error: 'Utilisateur ou mot de passe invalide.' }); }
      res.setHeader('Set-Cookie', `sid=${encodeURIComponent(makeToken(u.id))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure(req) ? '; Secure' : ''}`);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/logout' && req.method === 'POST') { res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }

    if (!me) { if (p.startsWith('/api/')) return json(res, 401, { error: 'Non connecté' }); res.writeHead(302, { Location: '/login' }); return res.end(); }

    if (p === '/' || p === '/index.html') {
      const html = fs.readFileSync(PAGE, 'utf8').replace('<head>', '<head><script src="/claude-shim.js"></script>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html);
    }
    if (p === '/claude-shim.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(shim); }
    if (p === '/api/me') return json(res, 200, { id: me.id, name: me.name, admin: !!me.admin });
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(': ok\n\n'); clients.add(res);
      const ka = setInterval(() => res.write(': ka\n\n'), 25000);
      req.on('close', () => { clearInterval(ka); clients.delete(res); });
      return;
    }
    if (p === '/api/users/search') { const q = (url.searchParams.get('q') || '').toLowerCase(); return json(res, 200, users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 20).map((u) => ({ id: u.id, name: u.name }))); }
    if (p === '/api/users/profiles') { const ids = (url.searchParams.get('ids') || '').split(','); const o = {}; for (const u of users) if (ids.includes(u.id)) o[u.id] = { id: u.id, name: u.name }; return json(res, 200, o); }

    if (p === '/api/col' && req.method === 'GET') {
      const c = url.searchParams.get('path') || ''; if (!COL.test(c)) return json(res, 400, { error: 'chemin invalide' });
      let docs = Object.keys(store).filter((k) => k.startsWith(c + '/')).map((k) => ({ id: k.slice(c.length + 1), data: store[k] }));
      const ord = url.searchParams.get('order'), lim = +url.searchParams.get('limit') || 0;
      if (ord) docs.sort((a, b) => String(b.data[ord] ?? '').localeCompare(String(a.data[ord] ?? '')));
      if (lim) docs = docs.slice(0, lim);
      return json(res, 200, docs);
    }
    if (p === '/api/doc') {
      const k = url.searchParams.get('path') || ''; if (!DOC.test(k)) return json(res, 400, { error: 'chemin invalide' });
      const c = k.split('/')[0];
      if (req.method === 'GET') return json(res, 200, store[k] === undefined ? { exists: false } : { exists: true, data: store[k] });
      if (ADMIN_ONLY.has(c) && !me.admin) return json(res, 403, { error: 'Réservé aux administrateurs' });
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const b = await body(req); if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, { error: 'document invalide' });
        store[k] = req.method === 'PUT' ? b : { ...(store[k] || {}), ...b };
      } else if (req.method === 'DELETE') delete store[k];
      else return json(res, 405, { error: 'méthode' });
      saveStore(); emit(c); return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'introuvable' });
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
});
server.listen(PORT, () => console.log('Planificateur sur le port', PORT));
