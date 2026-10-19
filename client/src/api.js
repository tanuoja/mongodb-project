// One small fetch wrapper. It adds the access token and silently refreshes it when it expires.
let token = null;
export const setToken = (t) => { token = t; };
export const getToken = () => token;

let refreshing = null;
export function refreshSession() {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (r) => { if (!r.ok) return null; const j = await r.json(); token = j.token; return j; })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

function send(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  return fetch('/api' + path, { method, headers, body: payload, credentials: 'include' });
}

export async function api(path, opts = {}) {
  let res = await send(path, opts);
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) res = await send(path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'Something went wrong. Please try again.');
  return json;
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => v !== '' && v != null && p.set(k, v));
  const s = p.toString();
  return s ? '?' + s : '';
};
