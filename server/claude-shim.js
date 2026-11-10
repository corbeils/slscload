// Fournit window.claude.use("db" | "user" | "downloads") au-dessus de l'API du serveur, comme l'environnement d'origine de la page.
(() => {
  const api = async (url, opt = {}) => {
    const r = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opt });
    if (r.status === 401) { location.href = '/login'; throw new Error('Non connecté'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  };
  const q = encodeURIComponent;
  const watchers = new Set();
  const refresh = (c) => watchers.forEach((w) => { if (!c || w.col === c) w.run(); });
  let es = null;
  const live = () => {
    if (es) return;
    es = new EventSource('/api/events');
    es.onmessage = (e) => { try { refresh(JSON.parse(e.data).c); } catch {} };
    es.onopen = () => refresh();
  };
  const docSnap = (id, r) => ({ id, exists: !!r.exists, data: () => (r.exists ? JSON.parse(JSON.stringify(r.data)) : undefined) });
  const docRef = (p) => ({
    id: p.split('/').pop(), path: p,
    get: async () => docSnap(p.split('/').pop(), await api('/api/doc?path=' + q(p))),
    set: async (d) => { await api('/api/doc?path=' + q(p), { method: 'PUT', body: JSON.stringify(d) }); },
    update: async (d) => { await api('/api/doc?path=' + q(p), { method: 'PATCH', body: JSON.stringify(d) }); },
    delete: async () => { await api('/api/doc?path=' + q(p), { method: 'DELETE' }); },
    onSnapshot(n, err) {
      const w = { col: p.split('/')[0], run: async () => { try { n(docSnap(p.split('/').pop(), await api('/api/doc?path=' + q(p)))); } catch (e) { err && err(e); } } };
      watchers.add(w); live(); w.run(); return () => watchers.delete(w);
    },
  });
  const colRef = (p, ord, lim) => {
    const list = async () => {
      const docs = await api('/api/col?path=' + q(p) + (ord ? '&order=' + q(ord) : '') + (lim ? '&limit=' + lim : ''));
      const a = docs.map((d) => docSnap(d.id, { exists: true, data: d.data }));
      return { docs: a, size: a.length, empty: !a.length, docChanges: () => [] };
    };
    return {
      path: p, doc: (id) => docRef(p + '/' + (id || Math.random().toString(36).slice(2))),
      orderBy: (f) => colRef(p, f, lim), limit: (n) => colRef(p, ord, n), get: list,
      onSnapshot(n, err) { const w = { col: p, run: async () => { try { n(await list()); } catch (e) { err && err(e); } } }; watchers.add(w); live(); w.run(); return () => watchers.delete(w); },
    };
  };
  let me = null;
  const who = async () => me || (me = await api('/api/me'));
  const user = {
    isOwner: async () => !!(await who()).admin, canEdit: async () => !!(await who()).admin, can: async () => true,
    id: async () => (await who()).id,
    profiles: async (ids) => api('/api/users/profiles?ids=' + q(ids.join(','))),
    search: async (s) => api('/api/users/search?q=' + q(s)),
  };
  window.claude = { use: async (n) => (n === 'db' ? { doc: docRef, collection: (p) => colRef(p) } : n === 'user' ? user : null) };
})();
