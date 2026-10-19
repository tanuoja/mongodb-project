import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import { useFetch, setMeta, fmtDate, fmtNum } from '../hooks.js';
import { renderMarkdown } from '../markdown.js';
import { Avatar, ErrorBox, PostGrid, Skeleton } from '../components/ui.jsx';
import Comments from '../components/Comments.jsx';

const REACTIONS = [['like', '❤️', 'Like'], ['helpful', '👏', 'Helpful'], ['interesting', '🔥', 'Interesting'], ['informative', '💡', 'Informative'], ['surprising', '😮', 'Surprising']];

function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const on = () => { const h = document.documentElement; setPct(Math.min(100, Math.round((h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100))); };
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const filled = Math.round(pct / 100 * 16);
  return (<>
    <div className="progress" style={{ width: pct + '%' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Reading progress" />
    <div className="progress-label" aria-hidden="true">{'█'.repeat(filled) + '░'.repeat(16 - filled)} {pct}%</div>
  </>);
}

export default function Article() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const lang = sp.get('lang') || 'en';
  const { user, toggleIn, flash } = useApp();
  const nav = useNavigate();
  const { data, loading, error } = useFetch(`/posts/slug/${slug}` + (lang !== 'en' ? `?lang=${lang}` : ''));
  const related = useFetch(`/posts/slug/${slug}/related`);
  const [post, setPost] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [share, setShare] = useState(false);
  const utter = useRef();

  useEffect(() => { if (data) { setPost(data.data); const p = data.data; setMeta(p.seo?.title || p.title, p.seo?.description || p.summary, p.seo?.ogImage || p.coverImage); } window.scrollTo(0, 0); }, [data]);
  useEffect(() => () => speechSynthesis.cancel(), []);
  const { html, toc } = useMemo(() => renderMarkdown(post?.content), [post?.content]);

  if (loading && !post) return <div className="container narrow"><Skeleton h={40} /><br /><Skeleton h={320} /></div>;
  if (error) return <div className="container narrow"><ErrorBox message={error} /><Link to="/blog">← Back to articles</Link></div>;
  if (!post) return null;
  const needLogin = () => { flash('Please log in first.'); nav('/login'); };

  const react = async (type) => {
    if (!user) return needLogin();
    try { const j = await api(`/posts/${post._id}/reactions`, { method: 'POST', body: { type } }); setPost({ ...post, ...j.data }); } catch (e) { flash(e.message); }
  };
  const bookmark = async () => {
    if (!user) return needLogin();
    try { const j = await api(`/posts/${post._id}/bookmark`, { method: 'POST' }); toggleIn('bookmarks', post._id); setPost({ ...post, bookmarked: j.data.bookmarked, bookmarkCount: post.bookmarkCount + (j.data.bookmarked ? 1 : -1) }); flash(j.data.bookmarked ? 'Bookmarked' : 'Bookmark removed'); } catch (e) { flash(e.message); }
  };
  const url = window.location.origin + `/blog/${post.slug}`;
  const doShare = async (net) => {
    const links = { whatsapp: `https://wa.me/?text=${encodeURIComponent(post.title + ' ' + url)}`, linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` };
    if (net === 'copy') { await navigator.clipboard.writeText(url); flash('Link copied'); } else window.open(links[net], '_blank', 'noopener');
    api(`/posts/${post._id}/share`, { method: 'POST' }).then((j) => setPost((p) => ({ ...p, shares: j.data.shares }))).catch(() => {});
    setShare(false);
  };
  const listen = () => {
    if (speaking) { speechSynthesis.cancel(); return setSpeaking(false); }
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent;
    utter.current = new SpeechSynthesisUtterance(`${post.title}. ${text}`);
    utter.current.lang = { ta: 'ta-IN', hi: 'hi-IN', en: 'en-US' }[lang];
    utter.current.onend = () => setSpeaking(false);
    speechSynthesis.speak(utter.current); setSpeaking(true);
  };
  const reportArticle = async () => {
    if (!user) return needLogin();
    const reason = prompt('Reason: Spam, Harassment, Misinformation, Copyright issue, Inappropriate content, Other', 'Misinformation');
    if (reason) try { flash((await api('/reports', { method: 'POST', body: { targetType: 'article', targetId: post._id, reason } })).message); } catch (e) { flash(e.message); }
  };

  return (
    <div className="container">
      <ReadingProgress />
      {post.status !== 'PUBLISHED' && <div className="error">Preview: this article is {post.status.replace('_', ' ').toLowerCase()} and is not public yet.</div>}
      <article>
        <header className="narrow" style={{ margin: '0 auto 24px' }}>
          <div className="row">{post.category && <Link className="chip" to={`/category/${post.category.slug}`}>{post.category.name}</Link>}
            <div className="grow" />
            <div role="group" aria-label="Language" className="row">{[['en', 'English'], ['ta', 'தமிழ்'], ['hi', 'हिन्दी']].map(([c, n]) => <button key={c} className={`tab ${lang === c ? 'on' : ''}`} disabled={!post.availableLanguages?.includes(c)} title={post.availableLanguages?.includes(c) ? '' : 'Translation not available yet'} onClick={() => setSp(c === 'en' ? {} : { lang: c })}>{n}</button>)}</div>
          </div>
          <h1 style={{ fontSize: '2.4rem', marginTop: 12 }}>{post.title}</h1>
          <p className="muted" style={{ fontSize: '1.2rem' }}>{post.summary}</p>
          <div className="meta" style={{ fontSize: '.95rem' }}>
            <Link to={`/author/${post.author._id}`} className="row" style={{ gap: 8 }}><Avatar user={post.author} /><b>{post.author.name}</b></Link>
            <span>Published {fmtDate(post.publishedAt)}</span>{post.updatedAt && <span>Updated {fmtDate(post.updatedAt)}</span>}<span>{post.readingTime} min read</span><span>👁 {fmtNum(post.views)}</span><span>❤️ {fmtNum(post.reactionTotal)}</span><span>💬 {post.commentCount}</span>
          </div>
        </header>
        {post.coverImage && <img src={post.coverImage} alt={post.title} style={{ width: '100%', maxHeight: 460, objectFit: 'cover', borderRadius: 16 }} />}

        <div className="row" style={{ margin: '18px 0' }}>
          <button className={`btn ghost ${post.bookmarked ? 'on' : ''}`} aria-pressed={post.bookmarked} onClick={bookmark}>{post.bookmarked ? '🔖 Saved' : '🔖 Bookmark'}</button>
          <div className="rel"><button className="btn ghost" aria-expanded={share} onClick={() => setShare(!share)}>🔗 Share ({post.shares})</button>
            {share && <div className="menu" style={{ left: 0, right: 'auto' }}>{[['whatsapp', 'WhatsApp'], ['linkedin', 'LinkedIn'], ['x', 'X'], ['facebook', 'Facebook'], ['copy', 'Copy link']].map(([k, n]) => <button key={k} onClick={() => doShare(k)}>{n}</button>)}</div>}</div>
          <button className="btn ghost" onClick={listen}>{speaking ? '⏹ Stop' : '🔊 Listen to Article'}</button>
          <button className="btn ghost" onClick={reportArticle}>🚩 Report</button>
        </div>

        <div className="article-layout">
          <aside className="toc" aria-label="Table of contents">{toc.length > 0 && <><b>On this page</b>{toc.map((h) => <a key={h.id} href={`#${h.id}`} className={`l${h.level}`} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{h.text}</a>)}</>}</aside>
          <div>
            <div className="prose" dangerouslySetInnerHTML={{ __html: html /* sanitized with DOMPurify in renderMarkdown */ }} />
            <div className="row" style={{ margin: '14px 0' }}>{post.tags.map((t) => <Link key={t} className="chip" to={`/tag/${t}`}>#{t}</Link>)}</div>
            <div className="card pad"><b>What did you think?</b>
              <div className="reactions" style={{ marginTop: 10 }} role="group" aria-label="Reactions">{REACTIONS.map(([k, e, n]) => <button key={k} className={`react ${post.myReaction === k ? 'on' : ''}`} aria-pressed={post.myReaction === k} onClick={() => react(k)}>{e} {n} · {post.reactionCounts?.[k] || 0}</button>)}</div></div>
            {post.status === 'PUBLISHED' && <Comments postId={post._id} />}
          </div>
        </div>
      </article>
      {related.data?.data.length > 0 && <section className="section"><h2>Related articles</h2><PostGrid posts={related.data.data} /></section>}
    </div>
  );
}
