import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { Avatar, Empty } from './ui.jsx';
import { fmtDate } from '../hooks.js';

function Form({ postId, parent, onDone, initial = '', editId }) {
  const [body, setBody] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { flash } = useApp();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const j = editId ? await api(`/comments/${editId}`, { method: 'PUT', body: { body } }) : await api(`/posts/${postId}/comments`, { method: 'POST', body: { body, parent } });
      if (j.message) flash(j.message);
      setBody(''); onDone(j.data);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ margin: '8px 0' }}>
      <label className="sr" htmlFor={`c-${parent || editId || 'new'}`} style={{ display: 'none' }}>Comment</label>
      <textarea id={`c-${parent || editId || 'new'}`} rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Join the discussion…" required />
      {err && <div className="error" role="alert">{err}</div>}
      <div className="row" style={{ marginTop: 6 }}><button className="btn sm" disabled={busy}>{editId ? 'Save' : parent ? 'Reply' : 'Post comment'}</button><button type="button" className="btn sm ghost" hidden={!parent && !editId} onClick={() => onDone(null)}>Cancel</button></div>
    </form>
  );
}

function Node({ c, tree, depth, postId, reload }) {
  const { user, flash } = useApp();
  const [mode, setMode] = useState(null); // 'reply' | 'edit'
  const kids = tree[c._id] || [];
  const mine = user?.id === c.author?._id;
  const done = (d) => { setMode(null); if (d) reload(); };
  const report = async () => {
    const reason = prompt('Reason: Spam, Harassment, Misinformation, Copyright issue, Inappropriate content, Other', 'Spam');
    if (!reason) return;
    try { const j = await api('/reports', { method: 'POST', body: { targetType: 'comment', targetId: c._id, reason } }); flash(j.message); } catch (e) { flash(e.message); }
  };
  const del = async () => { if (confirm('Delete this comment?')) { await api(`/comments/${c._id}`, { method: 'DELETE' }); reload(); } };
  return (
    <div className="comment">
      <div className="row" style={{ gap: 8 }}><Avatar user={c.author} /><b>{c.author?.name}</b>{c.author?.role !== 'reader' && <span className="chip">{c.author?.role}</span>}<span className="muted small">{fmtDate(c.createdAt)}{c.edited && ' · edited'}</span>{c.status === 'flagged' && <span className="chip">⏳ awaiting moderation</span>}</div>
      {mode === 'edit' ? <Form editId={c._id} initial={c.body} onDone={done} /> : <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>{c.body}</p>}
      {c.status !== 'removed' && <div className="row small">
        {user && depth < 4 && <button className="btn sm ghost" onClick={() => setMode('reply')}>Reply</button>}
        {mine && <button className="btn sm ghost" onClick={() => setMode('edit')}>Edit</button>}
        {(mine || ['editor', 'admin'].includes(user?.role)) && <button className="btn sm ghost" onClick={del}>Delete</button>}
        {user && !mine && <button className="btn sm ghost" onClick={report}>Report</button>}
      </div>}
      {mode === 'reply' && <Form postId={postId} parent={c._id} onDone={done} />}
      {kids.length > 0 && <div className="replies">{kids.map((k) => <Node key={k._id} c={k} tree={tree} depth={depth + 1} postId={postId} reload={reload} />)}</div>}
    </div>
  );
}

export default function Comments({ postId }) {
  const { user, socket } = useApp();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    api(`/posts/${postId}/comments?page=${page}`).then((j) => {
      setItems((old) => (page === 1 ? j.data : [...old, ...j.data.filter((n) => !old.some((o) => o._id === n._id))]));
      setPages(j.pagination.pages);
    }).finally(() => setLoading(false));
  }, [postId, page, tick]);

  useEffect(() => { // live comments from other readers
    if (!socket) return;
    socket.emit('post:join', postId);
    const on = (c) => setItems((old) => (old.some((o) => o._id === c._id) ? old : c.parent ? [...old, c] : [c, ...old]));
    socket.on('comment:new', on);
    return () => { socket.emit('post:leave', postId); socket.off('comment:new', on); };
  }, [socket, postId]);

  const { top, tree } = useMemo(() => {
    const tree = {}, top = [];
    items.forEach((c) => (c.parent ? (tree[c.parent] ||= []).push(c) : top.push(c)));
    return { top, tree };
  }, [items]);
  const reload = () => { setPage(1); setTick((t) => t + 1); };

  return (
    <section aria-labelledby="comments-h" className="section">
      <h2 id="comments-h">Comments</h2>
      {user ? <Form postId={postId} onDone={reload} /> : <p className="muted"><Link to="/login">Log in</Link> to join the discussion.</p>}
      {!loading && top.length === 0 && <Empty title="No comments yet" text="Be the first to share your thoughts." />}
      {top.map((c) => <Node key={c._id} c={c} tree={tree} depth={0} postId={postId} reload={reload} />)}
      {page < pages && <div className="pager"><button className="btn ghost" onClick={() => setPage(page + 1)}>Load more comments</button></div>}
    </section>
  );
}
