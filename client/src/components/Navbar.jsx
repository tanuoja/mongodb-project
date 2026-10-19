import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api.js';
import { Avatar } from './ui.jsx';
import { fmtDate } from '../hooks.js';

function Bell() {
  const { user, socket } = useApp();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [unread, setUnread] = useState(0);
  const nav = useNavigate();
  const load = () => api('/notifications?limit=8').then((j) => { setList(j.data); setUnread(j.unread); }).catch(() => {});
  useEffect(() => { load(); }, [user?.id]); // eslint-disable-line
  useEffect(() => {
    if (!socket) return;
    const on = (n) => { setList((l) => [n, ...l].slice(0, 8)); setUnread((u) => u + 1); };
    socket.on('notification', on);
    return () => socket.off('notification', on);
  }, [socket]);
  const readAll = async () => { await api('/notifications/read-all', { method: 'PUT' }); load(); };
  const go = async (n) => { setOpen(false); if (!n.read) { await api(`/notifications/${n._id}/read`, { method: 'PUT' }); load(); } nav(n.link || '/notifications'); };
  return (
    <div className="rel">
      <button className="icon-btn" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen(!open)}>🔔{unread > 0 && <span className="badge">{unread}</span>}</button>
      {open && (
        <div className="menu" style={{ width: 320 }}>
          <div className="row between" style={{ padding: '8px 14px' }}><b>Notifications</b><button className="btn sm ghost" style={{ width: 'auto' }} onClick={readAll}>Mark all read</button></div>
          {list.length === 0 && <p className="muted small" style={{ padding: '0 14px' }}>You're all caught up.</p>}
          {list.map((n) => <button key={n._id} onClick={() => go(n)} style={{ fontWeight: n.read ? 400 : 700 }}>{n.message}<div className="muted small">{fmtDate(n.createdAt)}</div></button>)}
          <Link to="/notifications" onClick={() => setOpen(false)}>See all →</Link>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, logout, t, theme, toggleTheme, bumpFont, contrast, setContrast, lang, setLang } = useApp();
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState([]);
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const nav = useNavigate();
  const timer = useRef();

  const onType = (v) => {
    setQ(v); clearTimeout(timer.current);
    timer.current = setTimeout(() => v.trim().length > 1 ? api('/posts/suggest?q=' + encodeURIComponent(v)).then((j) => setSugg(j.data)).catch(() => {}) : setSugg([]), 250);
  };
  const submit = (e) => {
    e.preventDefault(); if (!q.trim()) return;
    const recent = JSON.parse(localStorage.getItem('recentSearches') || '[]').filter((x) => x !== q);
    localStorage.setItem('recentSearches', JSON.stringify([q, ...recent].slice(0, 6)));
    setSugg([]); nav('/search?q=' + encodeURIComponent(q));
  };
  const dash = user?.role === 'admin' ? '/admin' : user?.role === 'editor' ? '/editor/dashboard' : user?.role === 'author' ? '/author/dashboard' : '/dashboard';
  const links = [['/', t('home')], ['/blog', t('latest')], ['/category/technology', t('categories')], ['/trending', t('trending')], ['/authors', t('authors')]];

  return (
    <header className="nav">
      <div className="container nav-inner">
        <button className="icon-btn burger" aria-label="Open menu" onClick={() => setDrawer(true)}>☰</button>
        <Link to="/" className="logo">✍️ ContentHub</Link>
        <nav className="nav-links" aria-label="Main">{links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
        <form className="searchbar rel" onSubmit={submit} role="search">
          <input value={q} onChange={(e) => onType(e.target.value)} placeholder={t('search') + '…'} aria-label="Search articles" list="recent" />
          <datalist id="recent">{JSON.parse(localStorage.getItem('recentSearches') || '[]').map((r) => <option key={r} value={r} />)}</datalist>
          {sugg.length > 0 && <div className="menu" style={{ top: 44, width: 300 }}>{sugg.map((s, i) => <Link key={i} to={s.type === 'tag' ? `/tag/${s.label.slice(1)}` : `/blog/${s.slug}`} onClick={() => setSugg([])}>{s.type === 'tag' ? '🏷' : '📄'} {s.label}</Link>)}</div>}
        </form>
        <div className="nav-right">
          <div className="a11y" role="group" aria-label="Font size"><button className="icon-btn" aria-label="Decrease font size" onClick={() => bumpFont(-10)}>A−</button><button className="icon-btn" aria-label="Reset font size" onClick={() => bumpFont(0)}>A</button><button className="icon-btn" aria-label="Increase font size" onClick={() => bumpFont(10)}>A+</button></div>
          <button className="icon-btn hide-m" aria-label="Toggle high contrast" aria-pressed={contrast === 'high'} onClick={() => setContrast(contrast === 'high' ? 'normal' : 'high')}>◐</button>
          <select className="hide-m" style={{ width: 'auto' }} aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)}><option value="en">English</option><option value="ta">தமிழ்</option><option value="hi">हिन्दी</option></select>
          <button className="icon-btn" aria-label="Toggle dark mode" onClick={toggleTheme}>{theme === 'dark' ? '☀ Light' : '🌙 Dark'}</button>
          {user ? (<>
            <Bell />
            <div className="rel">
              <button className="icon-btn" aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Avatar user={user} /></button>
              {menu && <div className="menu" onClick={() => setMenu(false)}>
                <div style={{ padding: '10px 14px' }}><b>{user.name}</b><div className="muted small">{user.role}</div></div>
                <Link to={dash}>Dashboard</Link><Link to="/bookmarks">🔖 Bookmarks</Link><Link to="/history">🕘 Reading history</Link><Link to="/following">👥 Following</Link><Link to="/profile">⚙ Profile & settings</Link>
                <button onClick={async () => { await logout(); nav('/'); }}>{t('logout')}</button>
              </div>}
            </div>
          </>) : (<><Link className="btn ghost sm hide-m" to="/login">{t('login')}</Link><Link className="btn sm" to="/register">{t('register')}</Link></>)}
        </div>
      </div>
      {drawer && <><div className="scrim" onClick={() => setDrawer(false)} /><aside className="drawer" onClick={() => setDrawer(false)}>
        <b>ContentHub</b>
        {links.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
        <form onSubmit={(e) => { submit(e); setDrawer(false); }} style={{ margin: '14px 0' }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search" /></form>
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language"><option value="en">English</option><option value="ta">தமிழ்</option><option value="hi">हिन्दी</option></select>
        {!user && <Link to="/login">{t('login')}</Link>}
      </aside></>}
    </header>
  );
}
