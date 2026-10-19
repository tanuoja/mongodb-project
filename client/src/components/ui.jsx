import { Link } from 'react-router-dom';
import { fmtDate, fmtNum } from '../hooks.js';

export const Skeleton = ({ h = 20, w = '100%' }) => <div className="skeleton" style={{ height: h, width: w }} />;
export const CardsSkeleton = ({ n = 6 }) => (
  <div className="grid g3" aria-busy="true" aria-label="Loading">{Array.from({ length: n }).map((_, i) => <div key={i} className="card"><Skeleton h={170} /><div className="pad grid" style={{ gap: 10 }}><Skeleton w="40%" /><Skeleton h={26} /><Skeleton /></div></div>)}</div>
);
export const ErrorBox = ({ message, onRetry }) => <div className="error" role="alert">{message} {onRetry && <button className="btn sm ghost" onClick={onRetry}>Try again</button>}</div>;
export const Empty = ({ title, text, to, cta }) => (
  <div className="empty"><h3>{title}</h3><p>{text}</p>{to && <Link className="btn" to={to}>{cta}</Link>}</div>
);

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null;
  const { page, pages } = pagination;
  return (
    <nav className="pager" aria-label="Pagination">
      <button className="btn ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span className="muted small">Page {page} of {pages}</span>
      <button className="btn ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </nav>
  );
}

export const Avatar = ({ user, size }) => <img className={`avatar ${size || ''}`} src={user?.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.name || '?')}`} alt="" />;

export function PostCard({ post }) {
  return (
    <article className="card pcard">
      <Link to={`/blog/${post.slug}`} tabIndex={-1} aria-hidden="true"><img src={post.coverImage || `https://picsum.photos/seed/${post.slug}/800/450`} alt="" loading="lazy" /></Link>
      <div className="body">
        <div className="row">{post.category && <Link className="chip" to={`/category/${post.category.slug}`}>{post.category.name}</Link>}{post.trendingScore != null && <span className="chip">🔥 {Math.round(post.trendingScore)}</span>}</div>
        <h3><Link to={`/blog/${post.slug}`}>{post.title}</Link></h3>
        <p className="muted small" style={{ margin: 0 }}>{post.summary}</p>
        <div className="grow" />
        <div className="meta">
          <Link to={`/author/${post.author?._id}`} className="row" style={{ gap: 6 }}><Avatar user={post.author} />{post.author?.name}</Link>
          <span>{fmtDate(post.publishedAt)}</span><span>{post.readingTime} min read</span>
        </div>
        <div className="meta"><span>👁 {fmtNum(post.views)}</span><span>❤️ {fmtNum(post.reactionTotal)}</span><span>💬 {post.commentCount}</span><span>🔖 {fmtNum(post.bookmarkCount)}</span></div>
      </div>
    </article>
  );
}

export const PostGrid = ({ posts }) => <div className="grid g3">{posts.map((p) => <PostCard key={p._id} post={p} />)}</div>;

export function BarChart({ data = [], height = 140, title }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure style={{ margin: 0 }}>
      {title && <figcaption><b>{title}</b></figcaption>}
      <div className="bars" style={{ height }} role="img" aria-label={`${title || 'Chart'}: ${data.length} data points`}>
        {data.length === 0 && <span className="muted small">No data yet</span>}
        {data.map((d) => <div key={d.label} title={`${d.label}: ${d.value}`} style={{ height: `${(d.value / max) * 100}%` }} />)}
      </div>
      {data.length > 0 && <div className="row between muted small"><span>{data[0].label}</span><span>{data[data.length - 1].label}</span></div>}
    </figure>
  );
}

export const StatusBadge = ({ status }) => <span className={`status s-${status}`}>{status.replace('_', ' ')}</span>;
export const Stat = ({ label, value }) => <div className="card stat"><b>{typeof value === 'number' ? value.toLocaleString() : value}</b><span>{label}</span></div>;
