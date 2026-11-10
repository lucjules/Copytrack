// Faux navigateur (un « appareil » = un localStorage + un sessionStorage) et faux Supabase (Auth + REST) en mémoire, pour les tests du client (comptes, cloud).
// Extrait de test-account.mjs : refreshStatus simule une panne du serveur (500, 429) au renouvellement de session.

// ---- Faux navigateur : un « appareil » = un localStorage + un sessionStorage ------------------------------------
class Store {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
Object.defineProperty(Store.prototype, Symbol.iterator, { value: undefined });
export const devices = {};
export function device(name) {
  const d = devices[name] || (devices[name] = { local: new Store(), session: new Store() });
  globalThis.localStorage = new Proxy(d.local, { ownKeys: () => [...d.local.m.keys()], getOwnPropertyDescriptor: (t, k) => (d.local.m.has(k) ? { enumerable: true, configurable: true, value: d.local.m.get(k) } : undefined) });
  globalThis.sessionStorage = d.session;
  return d;
}
device('A');

// ---- Faux Supabase ----------------------------------------------------------------------------------------------
export const srv = { users: new Map(), tokens: new Map(), refresh: new Map(), saves: new Map(), accounts: new Map(), players: new Map(), calls: [], refreshFails: false, refreshStatus: 0, offline: false, beforeNextPatch: null, n: 0 };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export function session(user) {
  const at = 'at' + ++srv.n, rt = 'rt' + ++srv.n;
  srv.tokens.set(at, user); srv.refresh.set(rt, user);
  return { access_token: at, refresh_token: rt, expires_in: 3600, user: { id: user.id } };
}
globalThis.fetch = async (url, init = {}) => {
  if (srv.offline) throw new TypeError('network down');
  const u = new URL(url), path = u.pathname, q = u.searchParams, method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  const auth = (init.headers || {}).Authorization;
  const user = auth ? srv.tokens.get(auth.replace('Bearer ', '')) : null;
  srv.calls.push({ method, path, body });
  if (path === '/auth/v1/signup') {
    if (body.email) {
      if (srv.users.has(body.email)) return json(422, { error_code: 'user_already_exists', msg: 'User already registered' });
      const user = { id: 'u-' + ++srv.n, email: body.email, pw: body.password, username: body.data && body.data.username };
      srv.users.set(body.email, user); srv.accounts.set(user.id, user.username);
      return json(200, session(user));
    }
    const anon = { id: 'anon-' + ++srv.n, anon: true };
    return json(200, session(anon));
  }
  if (path === '/auth/v1/token') {
    if (q.get('grant_type') === 'password') {
      const user = srv.users.get(body.email);
      if (!user || user.pw !== body.password) return json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, session(user));
    }
    if (srv.refreshStatus) return json(srv.refreshStatus, { message: 'indisponible' });
    if (srv.refreshFails || !srv.refresh.has(body.refresh_token)) return json(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    return json(200, session(srv.refresh.get(body.refresh_token)));
  }
  if (path === '/rest/v1/rpc/username_available') return json(200, ![...srv.accounts.values()].some((n) => n.toLowerCase() === body.n.toLowerCase()));
  if (path === '/rest/v1/rpc/delete_account') { srv.users.delete(user.email); srv.saves.delete(user.id); srv.accounts.delete(user.id); return json(200, null); }
  if (!user) return json(401, { message: 'JWT expired' });
  if (path === '/rest/v1/accounts') return json(200, srv.accounts.has(user.id) ? [{ username: srv.accounts.get(user.id) }] : []);
  if (path === '/rest/v1/players') { srv.players.set(body.id, body.name); return new Response('', { status: 201 }); }
  if (path === '/rest/v1/cloud_saves') {
    if (method === 'GET') { const r = srv.saves.get(user.id); return json(200, r ? [{ data: r.data, rev: r.rev }] : []); }
    if (method === 'POST') {
      if (body.user_id !== user.id) return json(403, { message: 'new row violates row-level security policy' });
      if (srv.saves.has(user.id)) return json(409, { code: '23505', message: 'duplicate key' });
      srv.saves.set(user.id, { data: body.data, rev: 1 }); return new Response('', { status: 201 });
    }
    if (method === 'PATCH') {
      if (srv.beforeNextPatch) { const f = srv.beforeNextPatch; srv.beforeNextPatch = null; f(user); }
      const r = srv.saves.get(user.id), want = Number(q.get('rev').replace('eq.', ''));
      if (!r || r.rev !== want) return json(200, []);
      r.data = body.data; r.rev++; return json(200, [{ rev: r.rev }]);
    }
  }
  return json(404, { message: 'inconnu ' + path });
};
