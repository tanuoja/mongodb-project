import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { useFetch, setMeta, fmtDate } from '../hooks.js';
import { renderMarkdown } from '../markdown.js';
import { StatusBadge, ErrorBox } from '../components/ui.jsx';

/* Toolbar actions: wrap the selection, prefix lines, or insert a block */
const TOOLS = [
  ['H1', 'Heading 1', { line: '# ' }], ['H2', 'Heading 2', { line: '## ' }], ['H3', 'Heading 3', { line: '### ' }],
  ['B', 'Bold', { wrap: ['**', '**', 'bold text'] }], ['I', 'Italic', { wrap: ['*', '*', 'italic text'] }], ['U', 'Underline', { wrap: ['<u>', '</u>', 'underlined'] }], ['S', 'Strikethrough', { wrap: ['~~', '~~', 'strikethrough'] }],
  ['⇤', 'Align left', { wrap: ['<div style="text-align:left">\n\n', '\n\n</div>', 'text'] }], ['↔', 'Align center', { wrap: ['<div style="text-align:center">\n\n', '\n\n</div>', 'text'] }], ['⇥', 'Align right', { wrap: ['<div style="text-align:right">\n\n', '\n\n</div>', 'text'] }],
  ['1.', 'Ordered list', { line: '1. ' }], ['•', 'Bullet list', { line: '- ' }], ['🔗', 'Link', { wrap: ['[', '](https://)', 'link text'] }],
  ['❝', 'Quote', { line: '> ' }], ['</>', 'Code block', { wrap: ['\n```js\n', '\n```\n', 'code here'] }], ['―', 'Horizontal line', { insert: '\n\n---\n\n' }],
  ['▦', 'Table', { insert: '\n\n| Column A | Column B |\n| --- | --- |\n| Cell | Cell |\n\n' }],
  ['▶', 'YouTube video', { insert: '\n\n<iframe src="https://www.youtube.com/embed/VIDEO_ID" title="Video" allowfullscreen></iframe>\n\n' }],
];

export default function PostEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, socket, flash } = useApp();
  const staff = ['editor', 'admin'].includes(user.role);
  const cats = useFetch('/categories');
  const [p, setP] = useState({ title: '', summary: '', content: '', coverImage: '', category: '', tags: '', seo: { title: '', description: '', keywords: '' } });
  const [meta, setMetaState] = useState(null); // status, feedback, scheduledAt...
  const [tab, setTab] = useState('edit');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(!id);
  const [drag, setDrag] = useState(false);
  const [editors, setEditors] = useState([]);
  const [panel, setPanel] = useState('ai');
  const area = useRef(); const undo = useRef([]); const redo = useRef([]);

  useEffect(() => setMeta(id ? 'Edit article' : 'New article'), [id]);
  useEffect(() => {
    if (!id) return;
    api(`/posts/${id}`).then((j) => { const d = j.data; setP({ title: d.title, summary: d.summary, content: d.content, coverImage: d.coverImage || '', category: d.category || '', tags: d.tags.join(', '), seo: { title: d.seo?.title || '', description: d.seo?.description || '', keywords: (d.seo?.keywords || []).join(', ') } }); setMetaState(d); setLoaded(true); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { // who else is editing right now?
    if (!socket || !id) return;
    socket.emit('editing:join', { postId: id, name: user.name });
    socket.on('editing:update', setEditors);
    return () => { socket.emit('editing:leave'); socket.off('editing:update', setEditors); };
  }, [socket, id, user.name]);

  const html = useMemo(() => renderMarkdown(p.content).html, [p.content]);
  const words = p.content.trim().split(/\s+/).filter(Boolean).length;
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const setContent = (v) => { undo.current.push(p.content); if (undo.current.length > 100) undo.current.shift(); redo.current = []; set('content', v); };
  const doUndo = () => { if (!undo.current.length) return; redo.current.push(p.content); set('content', undo.current.pop()); };
  const doRedo = () => { if (!redo.current.length) return; undo.current.push(p.content); set('content', redo.current.pop()); };

  const apply = (a) => {
    const t = area.current, s = t.selectionStart, e = t.selectionEnd, v = p.content, sel = v.slice(s, e);
    let out, cursor;
    if (a.wrap) { const [b, af, ph] = a.wrap; out = v.slice(0, s) + b + (sel || ph) + af + v.slice(e); cursor = s + b.length + (sel || ph).length + af.length; }
    else if (a.line) { const ls = v.lastIndexOf('\n', s - 1) + 1; out = v.slice(0, ls) + a.line + v.slice(ls); cursor = e + a.line.length; }
    else { out = v.slice(0, s) + a.insert + v.slice(e); cursor = s + a.insert.length; }
    setContent(out); requestAnimationFrame(() => { t.focus(); t.setSelectionRange(cursor, cursor); });
  };
  const insertText = (txt) => { const t = area.current, s = t.selectionStart; setContent(p.content.slice(0, s) + txt + p.content.slice(t.selectionEnd)); };

  const uploadImage = async (file) => {
    if (!file?.type.startsWith('image/')) return flash('Only images can be dropped here.');
    const fd = new FormData(); fd.append('file', file); fd.append('altText', file.name);
    try { const j = await api('/media', { method: 'POST', form: fd }); insertText(`\n![${file.name.replace(/\.\w+$/, '')}](${j.data.url})\n`); } catch (e) { setErr(e.message); }
  };
  const uploadCover = async (file) => { const fd = new FormData(); fd.append('file', file); try { set('coverImage', (await api('/media', { method: 'POST', form: fd })).data.url); } catch (e) { setErr(e.message); } };

  const voice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return flash('Voice input is not supported in this browser (try Chrome).');
    const r = new SR(); r.lang = 'en-IN'; r.interimResults = false;
    r.onresult = (ev) => insertText(' ' + ev.results[0][0].transcript + ' '); r.onerror = () => flash('Could not hear anything.'); r.start(); flash('🎤 Listening…');
  };

  const payload = () => ({
    title: p.title, summary: p.summary, content: p.content, coverImage: p.coverImage, category: p.category || null,
    tags: p.tags.split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean),
    seo: { title: p.seo.title, description: p.seo.description, keywords: p.seo.keywords.split(',').map((k) => k.trim()).filter(Boolean), ogTitle: p.seo.title, ogDescription: p.seo.description, ogImage: p.coverImage },
  });
  const save = async (after) => {
    setErr(''); setBusy(true);
    try {
      if (!p.title.trim()) throw new Error('Please add a title.');
      if (id) { const j = await api(`/posts/${id}`, { method: 'PUT', body: payload() }); setMetaState(j.data); flash('Saved'); return id; }
      const j = await api('/posts', { method: 'POST', body: payload() }); flash('Draft created'); nav(`/author/posts/${j.data._id}/edit`, { replace: true }); return j.data._id;
    } catch (e) { setErr(e.message); return null; } finally { setBusy(false); }
  };
  const workflow = async (action, body) => {
    const pid = await save(); if (!pid) return;
    try { const j = await api(`/posts/${pid}/${action}`, { method: 'POST', body }); setMetaState(j.data); flash('Done: ' + action); } catch (e) { setErr(e.message); }
  };

  if (!loaded) return <div className="container">{err ? <ErrorBox message={err} /> : <p>Loading…</p>}</div>;
  const locked = meta && !staff && !['DRAFT', 'REJECTED'].includes(meta.status);

  return (
    <div className="container">
      <div className="row between"><h1>{id ? 'Edit article' : 'New article'} {meta && <StatusBadge status={meta.status} />}</h1>
        {editors.length > 0 && <div className="small" aria-live="polite">Currently editing: {editors.map((n, i) => <span key={i} className="chip">🟢 {n}</span>)}</div>}</div>
      {meta?.status === 'REJECTED' && <div className="error" role="alert"><b>Editor feedback:</b> {meta.rejectionFeedback}</div>}
      {locked && <div className="error">This article is {meta.status.replace('_', ' ').toLowerCase()} and can't be edited by the author.</div>}
      {err && <div className="error" role="alert">{err}</div>}

      <div className="editor-grid">
        <div>
          <label htmlFor="title">Title</label><input id="title" value={p.title} onChange={(e) => set('title', e.target.value)} maxLength={200} disabled={locked} style={{ fontSize: '1.3rem', fontWeight: 700 }} />
          <label htmlFor="summary">Summary</label><textarea id="summary" rows={2} maxLength={500} value={p.summary} onChange={(e) => set('summary', e.target.value)} disabled={locked} />
          <div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'edit'} className={`tab ${tab === 'edit' ? 'on' : ''}`} onClick={() => setTab('edit')}>Edit</button><button role="tab" aria-selected={tab === 'preview'} className={`tab ${tab === 'preview' ? 'on' : ''}`} onClick={() => setTab('preview')}>Preview</button><span className="muted small" style={{ alignSelf: 'center' }}>{words} words · ~{Math.max(1, Math.ceil(words / 200))} min read</span></div>
          {tab === 'edit' ? <>
            <div className="toolbar" role="toolbar" aria-label="Formatting">
              {TOOLS.map(([l, n, a]) => <button key={n} type="button" title={n} aria-label={n} onClick={() => apply(a)} disabled={locked}>{l}</button>)}
              <button type="button" title="Image" aria-label="Insert image" onClick={() => document.getElementById('img-up').click()}>🖼</button>
              <button type="button" title="Undo" aria-label="Undo" onClick={doUndo}>↶</button><button type="button" title="Redo" aria-label="Redo" onClick={doRedo}>↷</button>
              <button type="button" title="Voice to article" aria-label="Dictate" onClick={voice}>🎤</button>
              <input id="img-up" type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0])} />
            </div>
            <textarea ref={area} className={`md-area ${drag ? 'drag' : ''}`} aria-label="Article content (Markdown)" value={p.content} onChange={(e) => setContent(e.target.value)} disabled={locked}
              placeholder="Write in Markdown… drag & drop images here." onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); uploadImage(e.dataTransfer.files[0]); }} />
          </> : <div className="card pad prose" style={{ minHeight: 420 }} dangerouslySetInnerHTML={{ __html: html || '<p class="muted">Nothing to preview yet.</p>' }} />}

          <div className="card pad" style={{ marginTop: 18 }}>
            <h2>Details & SEO</h2>
            <div className="row"><div className="grow"><label htmlFor="cat">Category</label><select id="cat" value={p.category} onChange={(e) => set('category', e.target.value)}><option value="">— none —</option>{cats.data?.data.map((c) => <option key={c._id} value={c._id}>{c.parent ? '— ' : ''}{c.name}</option>)}</select></div>
              <div className="grow"><label htmlFor="tags">Tags (comma separated)</label><input id="tags" value={p.tags} onChange={(e) => set('tags', e.target.value)} placeholder="ai, react, education" /></div></div>
            <label htmlFor="cover">Cover image URL</label><div className="row"><input id="cover" className="grow" value={p.coverImage} onChange={(e) => set('coverImage', e.target.value)} placeholder="https://… or upload →" /><input type="file" accept="image/*" aria-label="Upload cover" style={{ maxWidth: 220 }} onChange={(e) => e.target.files[0] && uploadCover(e.target.files[0])} /></div>
            <label htmlFor="seot">SEO title</label><input id="seot" value={p.seo.title} onChange={(e) => set('seo', { ...p.seo, title: e.target.value })} />
            <label htmlFor="seod">Meta description ({p.seo.description.length}/160)</label><textarea id="seod" rows={2} maxLength={160} value={p.seo.description} onChange={(e) => set('seo', { ...p.seo, description: e.target.value })} />
            <label htmlFor="seok">Keywords</label><input id="seok" value={p.seo.keywords} onChange={(e) => set('seo', { ...p.seo, keywords: e.target.value })} />
            {meta && <p className="muted small">URL: /blog/{meta.slug}</p>}
          </div>
        </div>

        <aside className="grid" style={{ gap: 16 }}>
          <div className="card pad"><h2>Publish</h2>
            <div className="grid" style={{ gap: 8 }}>
              <button className="btn" disabled={busy || locked} onClick={() => save()}>💾 Save draft</button>
              {(!meta || ['DRAFT', 'REJECTED'].includes(meta.status)) && <button className="btn ok" disabled={busy} onClick={() => workflow('submit')}>📤 Submit for review</button>}
              {staff && meta && <StaffActions meta={meta} workflow={workflow} />}
            </div>
          </div>
          <div className="card pad">
            <div className="tabs" style={{ margin: 0 }}><button className={`tab ${panel === 'ai' ? 'on' : ''}`} onClick={() => setPanel('ai')}>✨ AI Assistant</button>{id && <button className={`tab ${panel === 'ver' ? 'on' : ''}`} onClick={() => setPanel('ver')}>Versions</button>}</div>
            {panel === 'ai' ? <AIPanel p={p} set={set} setContent={setContent} id={id} /> : <Versions id={id} current={p.content} onRestored={(d) => { setP((x) => ({ ...x, title: d.title, content: d.content })); setMetaState(d); }} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StaffActions({ meta, workflow }) {
  const [when, setWhen] = useState({ date: '', time: '09:00' }); const [mode, setMode] = useState('now'); const [fb, setFb] = useState('');
  return (
    <div className="suggest">
      <b>Editorial actions</b>
      {meta.status === 'PENDING_REVIEW' && <>
        <button className="btn ok sm" style={{ margin: '8px 6px 8px 0' }} onClick={() => workflow('approve')}>✓ Approve</button>
        <textarea rows={2} placeholder="Feedback for the author…" value={fb} onChange={(e) => setFb(e.target.value)} aria-label="Rejection feedback" />
        <button className="btn danger sm" style={{ marginTop: 6 }} onClick={() => workflow('reject', { feedback: fb })}>✗ Reject with feedback</button></>}
      {['APPROVED', 'SCHEDULED', 'DRAFT', 'REJECTED'].includes(meta.status) && <div>
        <div className="row" style={{ margin: '8px 0' }}><label className="row" style={{ margin: 0, fontWeight: 400 }}><input type="radio" style={{ width: 'auto' }} checked={mode === 'now'} onChange={() => setMode('now')} /> Immediately</label><label className="row" style={{ margin: 0, fontWeight: 400 }}><input type="radio" style={{ width: 'auto' }} checked={mode === 'later'} onChange={() => setMode('later')} /> Schedule</label></div>
        {mode === 'later' && <div className="row"><input type="date" aria-label="Date" value={when.date} onChange={(e) => setWhen({ ...when, date: e.target.value })} /><input type="time" aria-label="Time" value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value })} /></div>}
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => (mode === 'now' ? workflow('publish') : workflow('schedule', { scheduledAt: new Date(`${when.date}T${when.time}`).toISOString() }))}>{mode === 'now' ? '🚀 Publish now' : '🗓 Schedule'}</button></div>}
      {meta.status === 'SCHEDULED' && <p className="small">Scheduled for {new Date(meta.scheduledAt).toLocaleString()}</p>}
      {meta.status === 'PUBLISHED' && <button className="btn ghost sm" onClick={() => workflow('unpublish')}>Unpublish</button>}
    </div>
  );
}

/* Every AI result is only a SUGGESTION. Nothing is applied until the user clicks Accept. */
function AIPanel({ p, set, setContent, id }) {
  const [out, setOut] = useState(null); const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [mode, setMode] = useState('clarity'); const [lang, setLang] = useState('ta');
  const { flash } = useApp();
  const run = async (key, path, body, kind) => {
    setErr(''); setBusy(key);
    try { const j = await api('/ai/' + path, { method: 'POST', body: { text: p.content || p.summary, ...body } }); setOut({ kind, data: j.data, extra: j }); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const saveTranslation = async () => { try { await api(`/posts/${id}/translations`, { method: 'PUT', body: { lang, title: p.title, summary: p.summary, content: out.data } }); flash('Translation saved'); setOut(null); } catch (e) { setErr(e.message); } };
  const B = ({ k, label, ...r }) => <button className="btn ghost sm" disabled={!!busy} onClick={() => run(k, r.path, r.body, r.kind)}>{busy === k ? '…' : label}</button>;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="row"><B k="t" label="Titles" path="title" kind="titles" /><B k="s" label="Summary" path="summarize" kind="summary" /><B k="g" label="Tags" path="tags" kind="tags" /><B k="d" label="SEO desc" path="seo" kind="seo" /><B k="r" label="Related" path="related" kind="related" /></div>
      <label htmlFor="mode">Improve writing</label>
      <div className="row"><select id="mode" style={{ flex: 1 }} value={mode} onChange={(e) => setMode(e.target.value)}><option value="clarity">Improve clarity</option><option value="professional">Make professional</option><option value="concise">Make concise</option><option value="grammar">Fix grammar</option><option value="simple">Simplify language</option></select><B k="i" label="Run" path="improve" body={{ mode }} kind="improve" /></div>
      <label htmlFor="lang">Translate</label>
      <div className="row"><select id="lang" style={{ flex: 1 }} value={lang} onChange={(e) => setLang(e.target.value)}><option value="ta">Tamil</option><option value="hi">Hindi</option></select><B k="x" label="Translate" path="translate" body={{ lang }} kind="translate" /></div>
      {err && <div className="error" role="alert">{err}</div>}
      {out && <div className="suggest" aria-live="polite">
        <b>Suggestion (not applied yet)</b>
        {out.kind === 'titles' && out.data.map((t) => <div key={t}><button className="btn ghost sm" style={{ margin: '4px 0', textAlign: 'left' }} onClick={() => { set('title', t); setOut(null); }}>{t}</button></div>)}
        {out.kind === 'tags' && <div className="rail" style={{ margin: '8px 0' }}>{out.data.map((t) => <button key={t} className="chip" onClick={() => set('tags', [p.tags, t].filter(Boolean).join(', '))}>+ {t}</button>)}</div>}
        {out.kind === 'related' && <ul>{out.data.map((r) => <li key={r._id}>{r.title}</li>)}{!out.data.length && <li>No related articles yet.</li>}</ul>}
        {['summary', 'seo', 'improve', 'translate'].includes(out.kind) && <><p style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{out.data}</p>
          <div className="row">
            {out.kind === 'summary' && <button className="btn sm" onClick={() => { set('summary', out.data); setOut(null); }}>Accept as summary</button>}
            {out.kind === 'seo' && <button className="btn sm" onClick={() => { set('seo', { ...p.seo, description: out.data.slice(0, 160) }); setOut(null); }}>Accept as meta description</button>}
            {out.kind === 'improve' && <button className="btn sm" onClick={() => { setContent(out.data); setOut(null); }}>Replace content</button>}
            {out.kind === 'translate' && (id ? <button className="btn sm" onClick={saveTranslation}>Save translation</button> : <span className="small muted">Save the draft first</span>)}</div></>}
        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setOut(null)}>Discard</button>
      </div>}
    </div>
  );
}

function diffLines(a, b) {
  const A = a.split('\n'), B = b.split('\n'), setA = new Set(A), setB = new Set(B);
  return [...A.filter((l) => !setB.has(l)).map((l) => ({ t: 'del', l })), ...B.filter((l) => !setA.has(l)).map((l) => ({ t: 'add', l }))];
}

function Versions({ id, current, onRestored }) {
  const { data, loading, reload } = useFetch(`/posts/${id}/versions`);
  const { flash } = useApp();
  const [view, setView] = useState(null); const [cmp, setCmp] = useState(null);
  const restore = async (n) => { if (!confirm(`Restore version ${n}? The current text is kept as a new version.`)) return; const j = await api(`/posts/${id}/versions/${n}/restore`, { method: 'POST' }); onRestored(j.data); flash('Restored'); reload(); };
  if (loading) return <p>Loading…</p>;
  return (
    <div style={{ marginTop: 12 }}>
      {data.data.map((v) => <div key={v.versionNumber} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
        <b>Version {v.versionNumber}</b> <span className="muted small">{v.editedBy?.name} · {fmtDate(v.at)}</span><div className="small">{v.changeNote}</div>
        <div className="row"><button className="btn ghost sm" onClick={() => { setView(v); setCmp(null); }}>View</button><button className="btn ghost sm" onClick={() => { setCmp(v); setView(null); }}>Compare</button><button className="btn ghost sm" onClick={() => restore(v.versionNumber)}>Restore</button></div></div>)}
      {view && <pre className="diff">{view.content}</pre>}
      {cmp && <pre className="diff">{diffLines(cmp.content, current).map((d, i) => <span key={i} className={d.t === 'add' ? 'diff-add' : 'diff-del'}>{d.t === 'add' ? '+ ' : '- '}{d.l}</span>)}{diffLines(cmp.content, current).length === 0 && 'No differences from the current text.'}</pre>}
    </div>
  );
}
