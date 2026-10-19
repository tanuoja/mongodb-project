import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { useFetch, setMeta, fmtDate, fmtNum } from '../hooks.js';
import { Stat, BarChart, Pagination, Empty, ErrorBox, Skeleton } from '../components/ui.jsx';

const NAV = [['/admin', 'Dashboard', true], ['/admin/users', 'Users'], ['/admin/posts', 'Articles'], ['/admin/categories', 'Categories & Tags'], ['/admin/comments', 'Comments'], ['/admin/media', 'Media'], ['/admin/analytics', 'Analytics'], ['/admin/reports', 'Reports'], ['/admin/newsletters', 'Newsletters'], ['/admin/notifications', 'Notifications'], ['/admin/settings', 'Settings'], ['/admin/audit-logs', 'Audit logs']];

export function AdminLayout() {
  return <div className="container admin-layout"><nav className="sidebar" aria-label="Admin">{NAV.map(([to, l, end]) => <NavLink key={to} to={to} end={end}>{l}</NavLink>)}</nav><section style={{ minWidth: 0 }}><Outlet /></section></div>;
}

export function AdminDashboard({ full }) {
  const [period, setPeriod] = useState('daily');
  const { data, loading, error, reload } = useFetch(`/analytics?period=${period}`);
  useEffect(() => setMeta('Admin dashboard'), []);
  const pending = useFetch('/posts/manage?status=PENDING_REVIEW&limit=1');
  const reports = useFetch('/admin/reports?limit=1');
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  const d = data?.data, t = d?.totals;
  const total = d ? Object.values(d.traffic).reduce((a, b) => a + b, 0) || 1 : 1;
  return (
    <div><h1>{full ? 'Analytics' : 'Dashboard'}</h1>
      {!t ? <Skeleton h={90} /> : <div className="grid g4"><Stat label="Total users" value={t.users} /><Stat label="Total articles" value={t.articles} /><Stat label="Total views" value={t.views} /><Stat label="Total comments" value={t.comments} /><Stat label="Total likes" value={t.likes} /><Stat label="Total bookmarks" value={t.bookmarks} /></div>}
      {!full && <div className="row" style={{ margin: '16px 0' }}><Link className="btn ghost" to="/admin/posts">⏳ {pending.data?.pagination.total ?? '…'} pending reviews</Link><Link className="btn ghost" to="/admin/reports">🚩 {reports.data?.pagination.total ?? '…'} open reports</Link></div>}
      <div className="tabs">{['daily', 'weekly', 'monthly'].map((p) => <button key={p} className={`tab ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{p}</button>)}</div>
      {d && <>
        <div className="grid g2"><div className="card pad"><BarChart title={`Views (${period})`} data={d.views} /></div><div className="card pad"><BarChart title="User growth" data={d.userGrowth} /></div><div className="card pad"><BarChart title="Article growth" data={d.articleGrowth} /></div><div className="card pad"><BarChart title="Comments" data={d.comments} /></div></div>
        <div className="grid g2" style={{ marginTop: 20 }}>
          <div className="card pad"><b>Top articles</b>{d.topArticles.map((a, i) => <div key={a._id} className="row between" style={{ padding: '6px 0' }}><Link to={`/blog/${a.slug}`}>{i + 1}. {a.title}</Link><span className="muted">{a.views.toLocaleString()} views</span></div>)}</div>
          <div className="card pad"><b>Top authors (by engagement)</b>{d.topAuthors.map((a, i) => <div key={a._id} className="row between" style={{ padding: '6px 0' }}><span>{i + 1}. {a.name}</span><span className="muted">{fmtNum(a.engagement)} pts · {a.articles} posts</span></div>)}</div>
          <div className="card pad"><b>Popular categories</b>{d.popularCategories.map((c) => <div key={c._id || 'x'} style={{ padding: '6px 0' }}><div className="row between small"><span>{c.name}</span><span>{fmtNum(c.views)}</span></div><div className="hbar"><i style={{ width: `${(c.views / d.popularCategories[0].views) * 100}%` }} /></div></div>)}</div>
          <div className="card pad"><b>Traffic sources</b>{['direct', 'search', 'social', 'referral'].map((k) => <div key={k} style={{ padding: '6px 0' }}><div className="row between small"><span style={{ textTransform: 'capitalize' }}>{k}</span><span>{Math.round(((d.traffic[k] || 0) / total) * 100)}%</span></div><div className="hbar"><i style={{ width: `${((d.traffic[k] || 0) / total) * 100}%` }} /></div></div>)}</div>
        </div></>}
    </div>
  );
}

export function AdminUsers() {
  const { user, flash } = useApp();
  const [f, setF] = useState({ q: '', role: '', status: '', page: 1 });
  const { data, loading, error, reload } = useFetch('/admin/users' + qs(f));
  const patch = async (id, body) => { try { await api(`/admin/users/${id}`, { method: 'PATCH', body }); flash('Updated'); reload(); } catch (e) { flash(e.message); } };
  const del = async (u) => { if (confirm(`Delete ${u.name}? This cannot be undone.`)) { try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); reload(); } catch (e) { flash(e.message); } } };
  return (
    <div><h1>Users</h1>
      <div className="row"><input style={{ maxWidth: 240 }} placeholder="Search name or email…" aria-label="Search users" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
        <select style={{ width: 'auto' }} aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, page: 1 })}><option value="">All roles</option>{['reader', 'author', 'editor', 'admin'].map((r) => <option key={r}>{r}</option>)}</select></div>
      <div style={{ marginTop: 14 }}>{error ? <ErrorBox message={error} /> : loading ? <Skeleton h={220} /> : <>
        <div className="card tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Articles</th><th>Actions</th></tr></thead><tbody>{data.data.map((u) => (
          <tr key={u.id}><td><b>{u.name}</b></td><td>{u.email}</td>
            <td><select style={{ width: 'auto' }} aria-label={`Role of ${u.name}`} value={u.role} disabled={u.id === user.id} onChange={(e) => patch(u.id, { role: e.target.value })}>{['reader', 'author', 'editor', 'admin'].map((r) => <option key={r}>{r}</option>)}</select></td>
            <td><span className="chip">{u.status}</span></td><td>{fmtDate(u.createdAt)}</td><td>{u.articles}</td>
            <td className="row">{u.id !== user.id && <><button className="btn ghost sm" onClick={() => patch(u.id, { status: u.status === 'active' ? 'suspended' : 'active' })}>{u.status === 'active' ? 'Suspend' : 'Activate'}</button><button className="btn danger sm" onClick={() => del(u)}>Delete</button></>}</td></tr>))}</tbody></table></div>
        <Pagination pagination={data.pagination} onPage={(page) => setF({ ...f, page })} /></>}</div>
    </div>
  );
}

export function AdminCategories() {
  const cats = useFetch('/categories'); const tags = useFetch('/tags?limit=40');
  const [name, setName] = useState(''); const [parent, setParent] = useState(''); const { flash } = useApp();
  const add = async (e) => { e.preventDefault(); try { await api('/categories', { method: 'POST', body: { name, parent: parent || null } }); setName(''); cats.reload(); } catch (x) { flash(x.message); } };
  const del = async (c) => { if (confirm(`Delete ${c.name} (and its sub-categories)?`)) try { await api(`/categories/${c._id}`, { method: 'DELETE' }); cats.reload(); } catch (x) { flash(x.message); } };
  const all = cats.data?.data || [];
  return (
    <div><h1>Categories & Tags</h1>
      <form className="row card pad" onSubmit={add}><input style={{ maxWidth: 240 }} required placeholder="New category name" aria-label="Category name" value={name} onChange={(e) => setName(e.target.value)} /><select style={{ width: 'auto' }} aria-label="Parent" value={parent} onChange={(e) => setParent(e.target.value)}><option value="">Top-level</option>{all.filter((c) => !c.parent).map((c) => <option key={c._id} value={c._id}>Under {c.name}</option>)}</select><button className="btn">Add</button></form>
      <div className="card pad" style={{ marginTop: 16 }}>{all.filter((c) => !c.parent).map((p) => <div key={p._id}><div className="row between" style={{ padding: '6px 0' }}><b>{p.name} <span className="muted small">({p.postCount})</span></b><button className="btn ghost sm" onClick={() => del(p)}>Delete</button></div>{all.filter((c) => String(c.parent) === String(p._id)).map((c) => <div key={c._id} className="row between" style={{ padding: '4px 0 4px 22px' }}><span>├── {c.name} <span className="muted small">({c.postCount})</span></span><button className="btn ghost sm" onClick={() => del(c)}>Delete</button></div>)}</div>)}</div>
      <h2 style={{ marginTop: 24 }}>Tags</h2><div className="rail">{tags.data?.data.map((t) => <Link key={t.name} className="chip" to={`/tag/${t.name}`}>#{t.name} · {t.count}</Link>)}</div>
      <p className="muted small">Tags are created by authors while writing; they live inside each article document.</p>
    </div>
  );
}

export function AdminReports() {
  const [status, setStatus] = useState('open'); const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(`/admin/reports?status=${status}&page=${page}`);
  const { flash } = useApp();
  const act = async (id, action) => { try { await api(`/admin/reports/${id}`, { method: 'PATCH', body: { action } }); flash('Report updated'); reload(); } catch (e) { flash(e.message); } };
  return (
    <div><h1>Moderation queue</h1>
      <div className="tabs">{['open', 'actioned', 'dismissed'].map((s) => <button key={s} className={`tab ${status === s ? 'on' : ''}`} onClick={() => { setStatus(s); setPage(1); }}>{s}</button>)}</div>
      {error ? <ErrorBox message={error} /> : loading ? <Skeleton h={150} /> : data.data.length === 0 ? <Empty title="Queue is empty" text="No reports in this list." /> : <>
        {data.data.map((r) => <div key={r._id} className="card pad" style={{ marginBottom: 10 }}><div className="row between"><span><span className="chip">{r.targetType}</span> <b>{r.reason}</b></span><span className="muted small">by {r.reporter?.name} · {fmtDate(r.createdAt)}</span></div><p style={{ whiteSpace: 'pre-wrap' }}>“{r.preview || 'content no longer exists'}”</p>
          {status === 'open' ? <div className="row"><button className="btn ghost sm" onClick={() => act(r._id, 'dismiss')}>Dismiss</button><button className="btn danger sm" onClick={() => act(r._id, 'remove')}>Remove</button><button className="btn ghost sm" onClick={() => act(r._id, 'warn')}>Warn user</button><button className="btn ghost sm" onClick={() => act(r._id, 'suspend')}>Suspend user</button></div> : <span className="muted small">Resolution: {r.resolution}</span>}</div>)}
        <Pagination pagination={data.pagination} onPage={setPage} /></>}
    </div>
  );
}

export function AdminNewsletters() {
  const { data, reload } = useFetch('/newsletter'); const latest = useFetch('/posts/trending?limit=5');
  const [subject, setSubject] = useState('CONTENTHUB WEEKLY'); const [intro, setIntro] = useState('Our top stories this week.'); const [sel, setSel] = useState([]); const { flash } = useApp();
  const create = async (e) => { e.preventDefault(); try { await api('/newsletter', { method: 'POST', body: { subject, intro, posts: sel } }); flash('Newsletter created'); reload(); } catch (x) { flash(x.message); } };
  const send = async (id) => { try { await api(`/newsletter/${id}/send`, { method: 'POST' }); flash('Sent! (see server console)'); reload(); } catch (x) { flash(x.message); } };
  return (
    <div><h1>Newsletters</h1><p className="muted">{data?.subscribers ?? '…'} active subscribers</p>
      <form className="card pad" onSubmit={create}><label htmlFor="sj">Subject</label><input id="sj" value={subject} onChange={(e) => setSubject(e.target.value)} /><label htmlFor="in">Intro</label><textarea id="in" rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} />
        <b style={{ display: 'block', marginTop: 12 }}>🔥 Top stories — pick articles</b>{latest.data?.data.map((p) => <label key={p._id} className="row" style={{ fontWeight: 400, margin: '6px 0' }}><input type="checkbox" style={{ width: 'auto' }} checked={sel.includes(p._id)} onChange={(e) => setSel(e.target.checked ? [...sel, p._id] : sel.filter((x) => x !== p._id))} />{p.title}</label>)}
        <div className="card pad" style={{ background: 'var(--surface2)', margin: '10px 0' }}><b>Preview — {subject}</b><p>{intro}</p><ol>{latest.data?.data.filter((p) => sel.includes(p._id)).map((p) => <li key={p._id}>{p.title}</li>)}</ol><u>Read More</u></div><button className="btn">Save newsletter</button></form>
      <h2 style={{ marginTop: 24 }}>History</h2>{data?.data.map((n) => <div key={n._id} className="card pad row between" style={{ marginBottom: 8 }}><span><b>{n.subject}</b> <span className="chip">{n.status}</span> <span className="muted small">{n.posts.length} articles{n.sentTo != null && ` · sent to ${n.sentTo}`}</span></span>{n.status !== 'SENT' && <button className="btn sm" onClick={() => send(n._id)}>Send now</button>}</div>)}
    </div>
  );
}

export function AdminNotifications() {
  const [message, setMessage] = useState(''); const [link, setLink] = useState('/'); const { flash } = useApp();
  const go = async (e) => { e.preventDefault(); try { flash((await api('/admin/broadcast', { method: 'POST', body: { message, link } })).message); setMessage(''); } catch (x) { flash(x.message); } };
  return <div><h1>Broadcast notification</h1><form className="card pad" onSubmit={go}><label htmlFor="m">Message to all users</label><textarea id="m" rows={3} required value={message} onChange={(e) => setMessage(e.target.value)} /><label htmlFor="l">Link</label><input id="l" value={link} onChange={(e) => setLink(e.target.value)} /><button className="btn" style={{ marginTop: 12 }}>Send to everyone</button></form></div>;
}

export function AdminSettings() {
  const { data } = useFetch('/admin/settings');
  const s = data?.data;
  return <div><h1>Settings</h1><div className="card pad">{s ? <><p><b>Reading speed:</b> {s.wordsPerMinute} words/min <span className="muted small">(env WORDS_PER_MINUTE)</span></p><p><b>AI provider:</b> {s.aiProvider} <span className="muted small">(env AI_PROVIDER)</span></p><b>Trending weights</b><pre className="diff">{JSON.stringify(s.trending, null, 2)}</pre><p className="muted small">Edit these in server/src/config.js. Moving them into the database is a good next feature.</p></> : <Skeleton h={120} />}</div></div>;
}

export function AdminAudit() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useFetch(`/admin/audit-logs?page=${page}`);
  return (
    <div><h1>Audit logs</h1>{error ? <ErrorBox message={error} /> : loading ? <Skeleton h={220} /> : data.data.length === 0 ? <Empty title="No activity yet" text="Admin and editor actions are recorded here." /> : <>
      <div className="card tablewrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Target</th><th>IP</th></tr></thead><tbody>{data.data.map((l) => <tr key={l._id}><td>{new Date(l.createdAt).toLocaleString()}</td><td>{l.actor?.name} <span className="muted small">({l.actor?.role})</span></td><td>{l.action}{l.details && <span className="muted small"> — {l.details}</span>}</td><td>{l.targetType}</td><td>{l.ip}</td></tr>)}</tbody></table></div>
      <Pagination pagination={data.pagination} onPage={setPage} /></>}</div>
  );
}
