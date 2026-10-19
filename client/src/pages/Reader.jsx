import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api, qs } from '../api.js';
import { useFetch, setMeta, fmtDate } from '../hooks.js';
import { CardsSkeleton, ErrorBox, Empty, PostGrid, Pagination, Avatar } from '../components/ui.jsx';

export function Bookmarks() {
  const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch('/me/bookmarks' + qs({ q, page }));
  useEffect(() => setMeta('My Bookmarks'), []);
  return (
    <div className="container"><h1>🔖 My Bookmarks</h1>
      <input style={{ maxWidth: 360 }} placeholder="Search your bookmarks…" aria-label="Search bookmarks" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <div style={{ marginTop: 20 }}>{loading ? <CardsSkeleton n={3} /> : error ? <ErrorBox message={error} onRetry={reload} /> : data.data.length === 0
        ? <Empty title="No bookmarks yet." text="Start exploring articles and save your favorites here." to="/blog" cta="Explore Articles" />
        : <><PostGrid posts={data.data} /><Pagination pagination={data.pagination} onPage={setPage} /></>}</div>
    </div>
  );
}

export function History() {
  const { data, loading, error, reload } = useFetch('/me/history');
  const { flash } = useApp();
  useEffect(() => setMeta('Reading history'), []);
  const clear = async () => { if (confirm('Clear your reading history?')) { await api('/me/history', { method: 'DELETE' }); flash('History cleared'); reload(); } };
  return (
    <div className="container"><div className="row between"><h1>🕘 Recently Read</h1>{data?.data.length > 0 && <button className="btn ghost" onClick={clear}>Clear history</button>}</div>
      {loading ? <CardsSkeleton n={3} /> : error ? <ErrorBox message={error} /> : data.data.length === 0 ? <Empty title="Nothing here yet" text="Articles you read will show up here." to="/blog" cta="Find something to read" /> : <PostGrid posts={data.data} />}
    </div>
  );
}

export function Following() {
  const { data, loading, error } = useFetch('/me/following');
  useEffect(() => setMeta('Following'), []);
  if (loading) return <div className="container"><CardsSkeleton n={3} /></div>;
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  const { authors, posts, tags } = data.data;
  return (
    <div className="container"><h1>👥 Following</h1>
      {authors.length === 0 && tags.length === 0 ? <Empty title="You're not following anyone yet" text="Follow authors and tags to personalise your home page." to="/authors" cta="Discover authors" /> : <>
        <div className="rail">{authors.map((a) => <Link key={a._id} className="card pad row" to={`/author/${a._id}`} style={{ color: 'inherit' }}><Avatar user={a} /><b>{a.name}</b></Link>)}{tags.map((t) => <Link key={t} className="chip" to={`/tag/${t}`}>#{t}</Link>)}</div>
        <h2 style={{ marginTop: 28 }}>Latest from them</h2>{posts.length ? <PostGrid posts={posts} /> : <p className="muted">No new articles yet.</p>}</>}
    </div>
  );
}

export function Notifications() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(`/notifications?page=${page}&limit=15`);
  useEffect(() => setMeta('Notifications'), []);
  const readAll = async () => { await api('/notifications/read-all', { method: 'PUT' }); reload(); };
  const read = async (n) => { if (!n.read) { await api(`/notifications/${n._id}/read`, { method: 'PUT' }); reload(); } };
  return (
    <div className="container narrow"><div className="row between"><h1>🔔 Notifications</h1><button className="btn ghost" onClick={readAll}>Mark all as read</button></div>
      {loading ? <CardsSkeleton n={2} /> : error ? <ErrorBox message={error} /> : data.data.length === 0 ? <Empty title="No notifications" text="We'll let you know when something happens." /> : <>
        <div className="card">{data.data.map((n) => <Link key={n._id} to={n.link || '/'} onClick={() => read(n)} style={{ display: 'block', padding: '14px 18px', borderBottom: '1px solid var(--border)', color: 'inherit', fontWeight: n.read ? 400 : 700, background: n.read ? 'transparent' : 'var(--surface2)' }}>{n.message}<div className="muted small">{fmtDate(n.createdAt)}</div></Link>)}</div>
        <Pagination pagination={data.pagination} onPage={setPage} /></>}
    </div>
  );
}

export function Profile() {
  const { user, patchUser, flash, theme, toggleTheme, lang, setLang } = useApp();
  const [f, setF] = useState({ name: user.name, bio: user.bio || '', avatar: user.avatar || '', twitter: user.social?.twitter || '', linkedin: user.social?.linkedin || '', website: user.social?.website || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [err, setErr] = useState('');
  useEffect(() => setMeta('Profile'), []);
  const upload = async (file) => {
    const fd = new FormData(); fd.append('file', file);
    try { setF({ ...f, avatar: (await api('/media/avatar', { method: 'POST', form: fd })).url }); } catch (e) { setErr(e.message); }
  };
  const save = async (e) => {
    e.preventDefault(); setErr('');
    try { const j = await api('/auth/me', { method: 'PUT', body: { name: f.name, bio: f.bio, avatar: f.avatar, social: { twitter: f.twitter, linkedin: f.linkedin, website: f.website }, language: lang } }); patchUser(j.user); flash('Profile saved'); } catch (x) { setErr(x.message); }
  };
  const changePw = async (e) => { e.preventDefault(); try { flash((await api('/auth/password', { method: 'PUT', body: pw })).message); setPw({ currentPassword: '', newPassword: '' }); } catch (x) { setErr(x.message); } };
  return (
    <div className="container narrow"><h1>Profile & settings</h1>{err && <div className="error" role="alert">{err}</div>}
      <form className="card pad" onSubmit={save}>
        <div className="row"><Avatar user={{ ...user, avatar: f.avatar }} size="lg" /><input type="file" accept="image/*" aria-label="Profile image" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} style={{ maxWidth: 260 }} /></div>
        {[['name', 'Name'], ['bio', 'Bio'], ['twitter', 'X / Twitter URL'], ['linkedin', 'LinkedIn URL'], ['website', 'Website']].map(([k, l]) => <div key={k}><label htmlFor={k}>{l}</label><input id={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
        <div className="row" style={{ marginTop: 14 }}><button className="btn">Save profile</button><button type="button" className="btn ghost" onClick={toggleTheme}>Theme: {theme}</button>
          <select style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language"><option value="en">English</option><option value="ta">தமிழ்</option><option value="hi">हिन्दी</option></select></div>
      </form>
      <form className="card pad" style={{ marginTop: 20 }} onSubmit={changePw}><h2>Change password</h2>
        <label htmlFor="cp">Current password</label><input id="cp" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <label htmlFor="np">New password</label><input id="np" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        <button className="btn" style={{ marginTop: 12 }}>Update password</button></form>
    </div>
  );
}

export function ReaderDashboard() {
  const { user } = useApp();
  return (
    <div className="container"><h1>Hi {user.name.split(' ')[0]} 👋</h1>
      <div className="grid g4">{[['/bookmarks', '🔖', 'Bookmarks', user.bookmarks.length], ['/following', '👥', 'Following', user.following.length], ['/history', '🕘', 'Reading history', ''], ['/notifications', '🔔', 'Notifications', '']].map(([to, i, l, n]) => <Link key={to} to={to} className="card stat" style={{ color: 'inherit' }}><b>{i} {n}</b><span>{l}</span></Link>)}</div>
      <h2 style={{ marginTop: 30 }}>Recommended for you</h2><RecList />
    </div>
  );
}
function RecList() { const { data, loading } = useFetch('/posts/recommended'); return loading ? <CardsSkeleton n={3} /> : <PostGrid posts={data.data} />; }
