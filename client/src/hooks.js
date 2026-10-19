import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

// useFetch('/posts?page=1')  ->  { data, loading, error, reload }. Pass null to skip fetching.
export function useFetch(path) {
  const [state, setState] = useState({ data: null, loading: !!path, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path).then((data) => alive && setState({ data, loading: false, error: null })).catch((e) => alive && setState({ data: null, loading: false, error: e.message }));
    return () => { alive = false; };
  }, [path, tick]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export function setMeta(title, description, image) {
  document.title = title ? `${title} · ContentHub` : 'ContentHub';
  const set = (sel, attr, val) => { if (!val) return; let el = document.head.querySelector(sel); if (!el) { el = document.createElement('meta'); const [k, v] = attr; el.setAttribute(k, v); document.head.appendChild(el); } el.setAttribute('content', val); };
  set('meta[name=description]', ['name', 'description'], description);
  set('meta[property="og:title"]', ['property', 'og:title'], title);
  set('meta[property="og:description"]', ['property', 'og:description'], description);
  set('meta[property="og:image"]', ['property', 'og:image'], image);
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const fmtNum = (n = 0) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));
