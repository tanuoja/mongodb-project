import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api, setToken, getToken, refreshSession } from '../api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Tiny UI translation table (English / Tamil / Hindi). Article content is translated separately.
const DICT = {
  en: { home: 'Home', categories: 'Categories', trending: 'Trending', latest: 'Latest', authors: 'Authors', search: 'Search', login: 'Login', register: 'Register', logout: 'Logout', read: 'Read Article' },
  ta: { home: 'முகப்பு', categories: 'வகைகள்', trending: 'பிரபலம்', latest: 'புதியவை', authors: 'எழுத்தாளர்கள்', search: 'தேடு', login: 'உள்நுழை', register: 'பதிவு', logout: 'வெளியேறு', read: 'கட்டுரையைப் படி' },
  hi: { home: 'होम', categories: 'श्रेणियाँ', trending: 'ट्रेंडिंग', latest: 'ताज़ा', authors: 'लेखक', search: 'खोजें', login: 'लॉगिन', register: 'रजिस्टर', logout: 'लॉगआउट', read: 'लेख पढ़ें' },
};

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [socket, setSocket] = useState(null);
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(() => load('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [fontScale, setFontScale] = useState(() => load('fontScale', 100));
  const [contrast, setContrast] = useState(() => load('contrast', 'normal'));
  const [lang, setLang] = useState(() => load('lang', 'en'));

  useEffect(() => { // apply preferences + remember them
    const d = document.documentElement;
    d.dataset.theme = theme; d.dataset.contrast = contrast; d.style.fontSize = fontScale + '%'; d.lang = lang;
    localStorage.setItem('theme', JSON.stringify(theme)); localStorage.setItem('fontScale', JSON.stringify(fontScale));
    localStorage.setItem('contrast', JSON.stringify(contrast)); localStorage.setItem('lang', JSON.stringify(lang));
  }, [theme, fontScale, contrast, lang]);

  useEffect(() => { refreshSession().then((s) => { if (s) setUser(s.user); setReady(true); }); }, []);

  // Real-time connection (re-created when the user logs in/out so the server knows who we are)
  useEffect(() => {
    const s = io('/', { auth: { token: user ? getToken() : undefined } });
    setSocket(s);
    return () => s.disconnect();
  }, [user?.id]); // eslint-disable-line

  const flash = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); }, []);

  const value = useMemo(() => ({
    user, ready, socket, toast, flash, theme, lang, fontScale, contrast,
    t: (k) => DICT[lang]?.[k] || DICT.en[k] || k,
    setLang, setContrast,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    bumpFont: (d) => setFontScale((f) => (d === 0 ? 100 : Math.min(150, Math.max(80, f + d)))),
    async login(email, password, remember) { const j = await api('/auth/login', { method: 'POST', body: { email, password, remember } }); setToken(j.token); setUser(j.user); return j.user; },
    async register(form) { const j = await api('/auth/register', { method: 'POST', body: form }); setToken(j.token); setUser(j.user); return j.user; },
    async logout() { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setToken(null); setUser(null); },
    patchUser: (p) => setUser((u) => ({ ...u, ...p })),
    toggleIn(field, id) { setUser((u) => ({ ...u, [field]: u[field].includes(id) ? u[field].filter((x) => x !== id) : [...u[field], id] })); },
  }), [user, ready, socket, toast, theme, lang, fontScale, contrast, flash]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

