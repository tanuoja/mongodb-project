import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { api, qs } from '../api.js';
import { useFetch, setMeta, fmtDate, fmtNum } from '../hooks.js';
import { CardsSkeleton, ErrorBox, Empty, PostGrid, Pagination, Avatar, Skeleton } from '../components/ui.jsx';

function Section({ title, to, children }) {
  return <section className="section"><div className="row between"><h2>{title}</h2>{to && <Link to={to}>View all →</Link>}</div>{children}</section>;
}
function Posts({ path, empty = 'Nothing here yet.' }) {
  const { data, loading, error, reload } = useFetch(path);
  if (loading) return <CardsSkeleton n={3} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data.data.length) return <Empty title={empty} text="Check back soon." />;
  return <PostGrid posts={data.data} />;
}

export function Home() {
  const { user, t } = useApp();
  const feat = useFetch('/posts?featured=1&limit=1');
  const latest = useFetch('/posts?limit=1');
  const cats = useFetch('/categories');
  const authors = useFetch('/authors');
  const hist = useFetch(user ? '/me/history' : null);
  const follow = useFetch(user ? '/me/following' : null);
  const hero = feat.data?.data[0] || latest.data?.data[0];
  const hour = new Date().getHours();
  useEffect(() => setMeta('Home', 'ContentHub - an intelligent publishing platform.'), []);

  return (
    <div className="container">
      {user && <h1>{hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, {user.name.split(' ')[0]}!</h1>}
      {!hero && !feat.error ? <div className="card"><Skeleton h={320} /></div> : hero && (
        <article className="card hero">
          <img src={hero.coverImage} alt="" />
          <div className="txt">
            <div className="row"><span className="chip">⭐ Featured</span>{hero.category && <span className="chip">{hero.category.name}</span>}</div>
            <h1>{hero.title}</h1><p className="muted">{hero.summary}</p>
            <div className="meta"><Avatar user={hero.author} />{hero.author.name}<span>{fmtDate(hero.publishedAt)}</span><span>{hero.readingTime} min read</span><span>👁 {fmtNum(hero.views)}</span></div>
            <div><Link className="btn" to={`/blog/${hero.slug}`}>{t('read')}</Link></div>
          </div>
        </article>
      )}
      {user && <Section title="✨ Recommended for you"><Posts path="/posts/recommended" /></Section>}
      <Section title="🔥 Trending Now" to="/trending"><Posts path="/posts/trending?limit=3" /></Section>
      {user && follow.data?.posts.length > 0 && <Section title="From authors you follow" to="/following"><PostGrid posts={follow.data.posts.slice(0, 3)} /></Section>}
      {user && hist.data?.data.length > 0 && <Section title="Continue reading" to="/history"><PostGrid posts={hist.data.data.slice(0, 3)} /></Section>}
      <Section title="Latest Posts" to="/blog"><Posts path="/posts?limit=6" /></Section>
      <Section title="💬 Most Discussed"><Posts path="/posts?sort=commented&limit=3" /></Section>
      <Section title="🔖 Most Bookmarked"><Posts path="/posts?sort=bookmarked&limit=3" /></Section>
      <Section title="Popular Categories">
        <div className="rail">{cats.data?.data.filter((c) => c.postCount > 0).sort((a, b) => b.postCount - a.postCount).map((c) => <Link key={c._id} className="chip" to={`/category/${c.slug}`}>{c.name} ({c.postCount})</Link>)}</div>
      </Section>
      <Section title="Popular Authors" to="/authors">
        <div className="grid g3">{authors.data?.data.slice(0, 3).map((a) => <Link key={a._id} to={`/author/${a._id}`} className="card pad row" style={{ color: 'inherit' }}><Avatar user={a} size="lg" /><div><b>{a.name}</b><div className="muted small">{a.articles} articles · {a.followers} followers</div></div></Link>)}</div>
      </Section>
      <NewsletterBox />
    </div>
  );
}

export function NewsletterBox() {
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setErr(''); try { setMsg((await api('/newsletter/subscribe', { method: 'POST', body: { email } })).message); setEmail(''); } catch (x) { setErr(x.message); } };
  return (
    <section className="card pad section" aria-labelledby="nl"><h2 id="nl">📰 ContentHub Weekly</h2><p className="muted">The top stories, once a week.</p>
      <form className="row" onSubmit={go}><input style={{ maxWidth: 320 }} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email address" /><button className="btn">Subscribe</button></form>
      {msg && <div className="success">{msg}</div>}{err && <div className="error">{err}</div>}
    </section>
  );
}

/** One page powers /blog, /search, /category/:slug and /tag/:slug */
export function Blog() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const path = useLocation().pathname;
  const base = path.startsWith('/category') ? { category: slug } : path.startsWith('/tag') ? { tag: slug } : {};
  const f = { q: sp.get('q') || '', sort: sp.get('sort') || 'recent', page: sp.get('page') || 1, minRead: sp.get('minRead') || '', maxRead: sp.get('maxRead') || '', from: sp.get('from') || '', author: sp.get('author') || '' };
  const { data, loading, error, reload } = useFetch('/posts' + qs({ ...base, ...f, limit: 9 }));
  const cats = useFetch('/categories');
  const { user, toggleIn, flash } = useApp();
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };
  const title = base.category ? 'Category: ' + (cats.data?.data.find((c) => c.slug === slug)?.name || slug) : base.tag ? `#${slug}` : f.q ? `Results for “${f.q}”` : 'All Articles';
  useEffect(() => setMeta(title), [title]);
  const recent = JSON.parse(localStorage.getItem('recentSearches') || '[]');
  const followTag = async () => { try { await api('/me/follow-tag', { method: 'POST', body: { tag: slug } }); toggleIn('followingTags', slug); flash('Updated tag follow'); } catch (e) { flash(e.message); } };
  const followCat = async () => { const c = cats.data.data.find((x) => x.slug === slug); await api('/me/follow-category', { method: 'POST', body: { category: c._id } }); toggleIn('followingCategories', c._id); flash('Updated category follow'); };

  return (
    <div className="container">
      <div className="row between"><h1>{title}</h1>
        {user && base.tag && <button className="btn ghost" onClick={followTag}>{user.followingTags.includes(slug) ? '✓ Following tag' : '+ Follow tag'}</button>}
        {user && base.category && cats.data && <button className="btn ghost" onClick={followCat}>Follow category</button>}
      </div>
      <div className="card pad" role="search" aria-label="Filter articles">
        <div className="row">
          <input style={{ flex: 2, minWidth: 180 }} value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Search title, content, author, category or tag…" aria-label="Search" />
          <select style={{ flex: 1, minWidth: 150 }} value={f.sort} onChange={(e) => set('sort', e.target.value)} aria-label="Sort by"><option value="recent">Most recent</option><option value="popular">Most viewed</option><option value="liked">Most liked</option><option value="commented">Most commented</option><option value="bookmarked">Most bookmarked</option></select>
          <select style={{ flex: 1, minWidth: 150 }} value={f.maxRead} onChange={(e) => { set('maxRead', e.target.value); }} aria-label="Reading time"><option value="">Any reading time</option><option value="3">≤ 3 min</option><option value="5">≤ 5 min</option><option value="10">≤ 10 min</option></select>
          <select style={{ flex: 1, minWidth: 150 }} value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="Published date"><option value="">Any date</option><option value={new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)}>Past week</option><option value={new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}>Past month</option><option value={new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)}>Past year</option></select>
          <button className="btn ghost" onClick={() => setSp({})}>Clear filters</button>
        </div>
        {!f.q && recent.length > 0 && <div className="row small" style={{ marginTop: 10 }}><span className="muted">Recent:</span>{recent.map((r) => <button key={r} className="chip" style={{ cursor: 'pointer' }} onClick={() => set('q', r)}>{r}</button>)}</div>}
      </div>
      <div style={{ marginTop: 22 }}>
        {loading ? <CardsSkeleton /> : error ? <ErrorBox message={error} onRetry={reload} /> : data.data.length === 0
          ? <Empty title="No articles found" text="Try different keywords or clear the filters." to="/blog" cta="Browse all articles" />
          : <><p className="muted small">{data.pagination.total} article(s)</p><PostGrid posts={data.data} /><Pagination pagination={data.pagination} onPage={(p) => set('page', p)} /></>}
      </div>
    </div>
  );
}

export function Trending() {
  useEffect(() => setMeta('Trending'), []);
  const tags = useFetch('/tags?limit=15');
  return (
    <div className="container"><h1>🔥 Trending Now</h1>
      <p className="muted">Ranked by views, reactions, comments, bookmarks, shares and recency, not just views.</p>
      <div className="rail" style={{ margin: '12px 0 24px' }}>{tags.data?.data.map((t) => <Link key={t.name} className="chip" to={`/tag/${t.name}`}>#{t.name} · {t.count}</Link>)}</div>
      <Posts path="/posts/trending?limit=12" />
    </div>
  );
}

export function Authors() {
  const { data, loading, error } = useFetch('/authors');
  useEffect(() => setMeta('Authors'), []);
  return (
    <div className="container"><h1>Authors</h1>
      {loading ? <CardsSkeleton n={3} /> : error ? <ErrorBox message={error} /> : <div className="grid g3">{data.data.map((a) => (
        <Link key={a._id} to={`/author/${a._id}`} className="card pad" style={{ color: 'inherit' }}><div className="row"><Avatar user={a} size="lg" /><div><h3 style={{ margin: 0 }}>{a.name}</h3><div className="muted small">{a.articles} articles · {fmtNum(a.views)} views</div><div className="muted small">{a.followers} followers</div></div></div><p className="muted small">{a.bio}</p></Link>))}</div>}
    </div>
  );
}

export function AuthorProfile() {
  const { id } = useParams();
  const { user, toggleIn, flash } = useApp();
  const a = useFetch(`/authors/${id}`);
  const [page, setPage] = useState(1);
  const posts = useFetch(`/posts?author=${id}&page=${page}`);
  const [followers, setFollowers] = useState(null);
  const nav = useNavigate();
  useEffect(() => { if (a.data) setMeta(a.data.data.name); }, [a.data]);
  if (a.loading) return <div className="container"><Skeleton h={160} /></div>;
  if (a.error) return <div className="container"><ErrorBox message={a.error} /></div>;
  const au = a.data.data, following = user?.following.includes(id);
  const follow = async () => {
    if (!user) return nav('/login');
    try { const j = await api(`/authors/${id}/follow`, { method: 'POST' }); toggleIn('following', id); setFollowers(j.data.followers); flash(j.data.following ? `Following ${au.name}` : 'Unfollowed'); } catch (e) { flash(e.message); }
  };
  return (
    <div className="container">
      <div className="card pad row" style={{ gap: 24 }}><Avatar user={au} size="lg" />
        <div className="grow"><h1 style={{ marginBottom: 4 }}>{au.name}</h1><p className="muted">{au.bio}</p>
          <div className="row"><b>{followers ?? au.followers}</b> followers · <b>{au.articles}</b> articles
            {au.social?.twitter && <a href={au.social.twitter} rel="noopener noreferrer">X</a>}{au.social?.linkedin && <a href={au.social.linkedin} rel="noopener noreferrer">LinkedIn</a>}{au.social?.website && <a href={au.social.website} rel="noopener noreferrer">Website</a>}</div></div>
        {user?.id !== id && <button className={`btn ${following ? 'ghost' : ''}`} onClick={follow} aria-pressed={!!following}>{following ? '✓ Following' : '+ Follow'}</button>}
      </div>
      <h2 style={{ marginTop: 30 }}>Articles</h2>
      {posts.loading ? <CardsSkeleton n={3} /> : posts.data?.data.length ? <><PostGrid posts={posts.data.data} /><Pagination pagination={posts.data.pagination} onPage={setPage} /></> : <Empty title="No articles yet" text="This author hasn't published anything." />}
    </div>
  );
}
