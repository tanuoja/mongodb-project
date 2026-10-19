import { useRef, useState } from 'react';
import { api, qs } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { useFetch } from '../hooks.js';
import { Pagination, Empty, ErrorBox, Skeleton } from '../components/ui.jsx';

export default function MediaLibrary() {
  const [f, setF] = useState({ q: '', type: '', page: 1 }); const [busy, setBusy] = useState(false); const [sel, setSel] = useState(null);
  const { data, loading, error, reload } = useFetch('/media' + qs({ ...f, limit: 12 }));
  const { flash } = useApp(); const input = useRef();
  const upload = async (files) => {
    setBusy(true);
    for (const file of files) { const fd = new FormData(); fd.append('file', file); fd.append('altText', file.name.replace(/\.\w+$/, '')); try { await api('/media', { method: 'POST', form: fd }); } catch (e) { flash(e.message); } }
    setBusy(false); reload();
  };
  const del = async (m) => { if (confirm('Delete this file?')) { await api(`/media/${m._id}`, { method: 'DELETE' }); setSel(null); reload(); } };
  const saveAlt = async () => { await api(`/media/${sel._id}`, { method: 'PUT', body: { altText: sel.altText } }); flash('Alt text saved'); reload(); };
  const thumb = (m) => m.type === 'image' ? <img src={m.url} alt={m.altText} style={{ width: '100%', height: 110, objectFit: 'cover' }} loading="lazy" /> : <div style={{ height: 110, display: 'grid', placeItems: 'center', fontSize: 38 }}>{{ video: '🎞', audio: '🎵', document: '📄' }[m.type]}</div>;
  return (
    <div className="container"><h1>🖼 Media library</h1>
      <div className="row"><input style={{ maxWidth: 220 }} placeholder="Search files…" aria-label="Search media" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
        <select style={{ width: 'auto' }} aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, page: 1 })}><option value="">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option><option value="document">Documents</option></select>
        <button className="btn" disabled={busy} onClick={() => input.current.click()}>{busy ? 'Uploading…' : '⬆ Upload'}</button><input ref={input} hidden multiple type="file" onChange={(e) => upload([...e.target.files])} /></div>
      <div className="editor-grid" style={{ marginTop: 16 }}>
        <div>{error ? <ErrorBox message={error} /> : loading ? <Skeleton h={200} /> : data.data.length === 0 ? <Empty title="No files yet" text="Upload images, videos, audio or PDFs (max 10 MB)." /> : <>
          <div className="grid g4">{data.data.map((m) => <button key={m._id} className="card" style={{ padding: 0, cursor: 'pointer', textAlign: 'left', outline: sel?._id === m._id ? '3px solid var(--primary)' : 'none' }} onClick={() => setSel({ ...m })}>{thumb(m)}<div className="small" style={{ padding: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fileName}</div></button>)}</div>
          <Pagination pagination={data.pagination} onPage={(page) => setF({ ...f, page })} /></>}</div>
        <aside className="card pad">{sel ? <><b>{sel.fileName}</b><p className="muted small">{sel.type} · {(sel.size / 1024).toFixed(0)} KB · {sel.uploadedBy?.name}</p>
          {sel.type === 'image' && <img src={sel.url} alt={sel.altText} style={{ width: '100%', borderRadius: 10 }} />}{sel.type === 'video' && <video src={sel.url} controls style={{ width: '100%' }} />}{sel.type === 'audio' && <audio src={sel.url} controls />}
          <label htmlFor="alt">Alt text</label><input id="alt" value={sel.altText} onChange={(e) => setSel({ ...sel, altText: e.target.value })} />
          <label htmlFor="url">URL (copy to reuse)</label><input id="url" readOnly value={window.location.origin + sel.url} onFocus={(e) => e.target.select()} />
          <div className="row" style={{ marginTop: 12 }}><button className="btn sm" onClick={saveAlt}>Save alt</button><button className="btn danger sm" onClick={() => del(sel)}>Delete</button></div></> : <p className="muted">Select a file to preview it.</p>}</aside>
      </div>
    </div>
  );
}
