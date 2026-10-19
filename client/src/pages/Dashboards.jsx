import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { useFetch, setMeta, fmtDate, fmtNum } from '../hooks.js';
import { Stat, BarChart, StatusBadge, Pagination, Empty, ErrorBox, Skeleton } from '../components/ui.jsx';

const TABS = [['', 'All'], ['DRAFT', 'Drafts'], ['PENDING_REVIEW', 'Pending Review'], ['PUBLISHED', 'Published'], ['REJECTED', 'Rejected'], ['SCHEDULED', 'Scheduled']];

export function AuthorDashboard() {
  const { flash } = useApp();
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const posts = useFetch('/posts/mine' + qs({ status, page }));
  const stats = useFetch('/analytics/author');
  useEffect(() => setMeta('Author dashboard'), []);
  const del = async (id) => { if (confirm('Delete this article?')) { try { await api(`/posts/${id}`, { method: 'DELETE' }); flash('Deleted'); posts.reload(); } catch (e) { flash(e.message); } } };
  const t = stats.data?.data.totals;
  return (
    <div className="container">
      <div className="row between"><h1>Author dashboard</h1><div className="row"><Link className="btn ghost" to="/author/media">🖼 Media</Link><Link className="btn" to="/author/posts/create">+ New article</Link></div></div>
      {t ? <div className="grid g4"><Stat label="Total views" value={t.views} /><Stat label="Likes" value={t.likes} /><Stat label="Comments" value={t.comments} /><Stat label="Bookmarks" value={t.bookmarks} /><Stat label="Followers" value={t.followers} /></div> : <Skeleton h={90} />}
      <div className="grid g2" style={{ marginTop: 20 }}>
        <div className="card pad"><BarChart title="Views (last 30 days)" data={stats.data?.data.views} /></div>
        <div className="card pad"><b>Best performing</b>{stats.data?.data.best.map((b, i) => <div key={b._id} className="row between" style={{ padding: '6px 0' }}><Link to={`/blog/${b.slug}`}>{i + 1}. {b.title}</Link><span className="muted">{fmtNum(b.views)} views</span></div>)}{stats.data && !stats.data.data.best.length && <p className="muted">Publish an article to see stats.</p>}</div>
      </div>
      <h2 style={{ marginTop: 28 }}>My articles</h2>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => { setStatus(k); setPage(1); }}>{l}{k && posts.data?.counts[k] ? ` (${posts.data.counts[k]})` : ''}</button>)}</div>
      {posts.error ? <ErrorBox message={posts.error} onRetry={posts.reload} /> : posts.loading ? <Skeleton h={200} /> : posts.data.data.length === 0 ? <Empty title="No articles here" text="Start writing your first article." to="/author/posts/create" cta="Create article" /> : <>
        <div className="card tablewrap"><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th><th>Views</th><th /></tr></thead><tbody>{posts.data.data.map((p) => (
          <tr key={p._id}><td><b>{p.title}</b></td><td><StatusBadge status={p.status} /></td><td>{fmtDate(p.updatedAt)}</td><td>{p.views}</td>
            <td className="row"><Link className="btn ghost sm" to={`/author/posts/${p._id}/edit`}>Edit</Link>{p.status === 'PUBLISHED' && <Link className="btn ghost sm" to={`/blog/${p.slug}`}>View</Link>}{['DRAFT', 'REJECTED'].includes(p.status) && <button className="btn ghost sm" onClick={() => del(p._id)}>Delete</button>}</td></tr>))}</tbody></table></div>
        <Pagination pagination={posts.data.pagination} onPage={setPage} /></>}
    </div>
  );
}

export function EditorDashboard() {
  const stats = useFetch('/analytics'); const pending = useFetch('/posts/manage?status=PENDING_REVIEW&limit=5');
  useEffect(() => setMeta('Editor dashboard'), []);
  const t = stats.data?.data.totals;
  return (
    <div className="container"><h1>Editorial dashboard</h1>
      {t && <div className="grid g4"><Stat label="Articles" value={t.articles} /><Stat label="Views" value={t.views} /><Stat label="Comments" value={t.comments} /><Stat label="Likes" value={t.likes} /></div>}
      <div className="row between" style={{ marginTop: 26 }}><h2>Waiting for review</h2><Link to="/editor/review">Open review queue →</Link></div>
      {pending.data?.data.length ? pending.data.data.map((p) => <div key={p._id} className="card pad row between" style={{ marginBottom: 8 }}><span>{p.title} <span className="muted small">by {p.author?.name}</span></span><Link className="btn sm" to={`/author/posts/${p._id}/edit`}>Review</Link></div>) : <Empty title="Queue is empty" text="Nothing is waiting for review." />}
      <div className="row" style={{ marginTop: 20 }}><Link className="btn ghost" to="/editor/posts">All articles</Link><Link className="btn ghost" to="/editor/comments">Comment moderation</Link></div>
      <div className="card pad" style={{ marginTop: 20 }}><BarChart title="Views (30 days)" data={stats.data?.data.views} /></div>
    </div>
  );
}

/** Used for /editor/review (pending only), /editor/posts and /admin/posts */
export function ManagePosts({ onlyPending }) {
  const { user, flash } = useApp();
  const [status, setStatus] = useState(onlyPending ? 'PENDING_REVIEW' : ''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch('/posts/manage' + qs({ status, q, page }));
  useEffect(() => setMeta(onlyPending ? 'Review queue' : 'Articles'), [onlyPending]);
  const act = async (id, action) => { try { await api(`/posts/${id}/${action}`, { method: 'POST' }); flash('Done'); reload(); } catch (e) { flash(e.message); } };
  const del = async (id) => { if (confirm('Permanently delete this article?')) { await api(`/posts/${id}`, { method: 'DELETE' }); reload(); } };
  const feature = async (p) => { await api(`/posts/${p._id}`, { method: 'PUT', body: { featured: !p.featured } }); reload(); };
  return (
    <div className={onlyPending ? 'container' : ''}><h1>{onlyPending ? 'Review queue' : 'Articles'}</h1>
      {!onlyPending && <div className="row"><input style={{ maxWidth: 260 }} placeholder="Search title…" aria-label="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /><select style={{ width: 'auto' }} aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'].map((s) => <option key={s}>{s}</option>)}</select></div>}
      <div style={{ marginTop: 14 }}>{error ? <ErrorBox message={error} onRetry={reload} /> : loading ? <Skeleton h={200} /> : data.data.length === 0 ? <Empty title="Nothing here" text="No articles match." /> : <>
        <div className="card tablewrap"><table><thead><tr><th>Title</th><th>Author</th><th>Status</th><th>Updated</th><th /></tr></thead><tbody>{data.data.map((p) => (
          <tr key={p._id}><td><b>{p.title}</b></td><td>{p.author?.name}</td><td><StatusBadge status={p.status} /></td><td>{fmtDate(p.updatedAt)}</td>
            <td className="row"><Link className="btn ghost sm" to={`/author/posts/${p._id}/edit`}>{p.status === 'PENDING_REVIEW' ? 'Review' : 'Open'}</Link>
              {p.status === 'PENDING_REVIEW' && <button className="btn ok sm" onClick={() => act(p._id, 'approve')}>Approve</button>}
              {p.status === 'APPROVED' && <button className="btn sm" onClick={() => act(p._id, 'publish')}>Publish</button>}
              {p.status === 'PUBLISHED' && <><button className="btn ghost sm" onClick={() => feature(p)}>{p.featured ? '★' : '☆'} Feature</button><button className="btn ghost sm" onClick={() => act(p._id, 'unpublish')}>Unpublish</button></>}
              {user.role === 'admin' && <button className="btn danger sm" onClick={() => del(p._id)}>Delete</button>}</td></tr>))}</tbody></table></div>
        <Pagination pagination={data.pagination} onPage={setPage} /></>}</div>
    </div>
  );
}

export function CommentModeration() {
  const [status, setStatus] = useState('flagged'); const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(`/admin/comments?status=${status}&page=${page}`);
  const act = async (id, s) => { await api(`/admin/comments/${id}`, { method: 'PATCH', body: { status: s } }); reload(); };
  return (
    <div><h1>Comment moderation</h1>
      <div className="tabs">{[['flagged', 'AI-flagged'], ['visible', 'Visible'], ['removed', 'Removed']].map(([k, l]) => <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => { setStatus(k); setPage(1); }}>{l}</button>)}</div>
      {error ? <ErrorBox message={error} /> : loading ? <Skeleton h={120} /> : data.data.length === 0 ? <Empty title="All clear" text="No comments in this list." /> : <>
        {data.data.map((c) => <div key={c._id} className="card pad" style={{ marginBottom: 10 }}><div className="row between"><b>{c.author?.name}</b><span className="muted small">on <Link to={`/blog/${c.post?.slug}`}>{c.post?.title}</Link></span></div><p>{c.body}</p>{c.flagReason && <p className="small muted">🤖 Flagged: {c.flagReason}</p>}
          <div className="row">{c.status !== 'visible' && <button className="btn ok sm" onClick={() => act(c._id, 'visible')}>Approve</button>}{c.status !== 'removed' && <button className="btn danger sm" onClick={() => act(c._id, 'removed')}>Remove</button>}</div></div>)}
        <Pagination pagination={data.pagination} onPage={setPage} /></>}
    </div>
  );
}
