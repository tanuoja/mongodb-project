import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { useApp } from './context/AppContext.jsx';
import Navbar from './components/Navbar.jsx';
import { Skeleton } from './components/ui.jsx';
import { Home, Blog, Trending, Authors, AuthorProfile } from './pages/Public.jsx';
import { Login, Register, Forgot, Reset, Verify } from './pages/Auth.jsx';
import { Bookmarks, History, Following, Notifications, Profile, ReaderDashboard } from './pages/Reader.jsx';
import { AuthorDashboard, EditorDashboard, ManagePosts, CommentModeration } from './pages/Dashboards.jsx';
import { AdminLayout, AdminDashboard, AdminUsers, AdminCategories, AdminReports, AdminNewsletters, AdminNotifications, AdminSettings, AdminAudit } from './pages/Admin.jsx';

// Code splitting: heavy pages load only when visited
const Article = lazy(() => import('./pages/Article.jsx'));
const PostEditor = lazy(() => import('./pages/Editor.jsx'));
const MediaLibrary = lazy(() => import('./pages/Media.jsx'));

/** Client-side guard. The SERVER still enforces roles; this only hides pages from people who can't use them. */
function Guard({ roles, children }) {
  const { user, ready } = useApp();
  const loc = useLocation();
  if (!ready) return <div className="container"><Skeleton h={200} /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <div className="container"><div className="error" role="alert">You are not authorized to view this page.</div><Link to="/">Go home</Link></div>;
  return children;
}
const A = ['author', 'editor', 'admin'], S = ['editor', 'admin'];

export default function App() {
  const { toast } = useApp();
  return (<>
    <a className="skip" href="#main">Skip to content</a>
    <Navbar />
    <main id="main" tabIndex={-1}>
      <Suspense fallback={<div className="container"><Skeleton h={300} /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<Forgot />} /><Route path="/reset-password/:token" element={<Reset />} /><Route path="/verify/:token" element={<Verify />} />
          <Route path="/blog" element={<Blog />} /><Route path="/blog/:slug" element={<Article />} />
          <Route path="/search" element={<Blog />} /><Route path="/category/:slug" element={<Blog />} /><Route path="/tag/:slug" element={<Blog />} />
          <Route path="/trending" element={<Trending />} /><Route path="/authors" element={<Authors />} /><Route path="/author/:id" element={<AuthorProfile />} />

          <Route path="/dashboard" element={<Guard><ReaderDashboard /></Guard>} />
          <Route path="/bookmarks" element={<Guard><Bookmarks /></Guard>} /><Route path="/history" element={<Guard><History /></Guard>} />
          <Route path="/following" element={<Guard><Following /></Guard>} /><Route path="/notifications" element={<Guard><Notifications /></Guard>} />
          <Route path="/profile" element={<Guard><Profile /></Guard>} /><Route path="/settings" element={<Navigate to="/profile" replace />} />

          <Route path="/author/dashboard" element={<Guard roles={A}><AuthorDashboard /></Guard>} />
          <Route path="/author/posts" element={<Navigate to="/author/dashboard" replace />} />
          <Route path="/author/analytics" element={<Navigate to="/author/dashboard" replace />} />
          <Route path="/author/posts/create" element={<Guard roles={A}><PostEditor /></Guard>} />
          <Route path="/author/posts/:id/edit" element={<Guard roles={A}><PostEditor /></Guard>} />
          <Route path="/author/media" element={<Guard roles={A}><MediaLibrary /></Guard>} />

          <Route path="/editor/dashboard" element={<Guard roles={S}><EditorDashboard /></Guard>} />
          <Route path="/editor/review" element={<Guard roles={S}><ManagePosts onlyPending /></Guard>} />
          <Route path="/editor/posts" element={<Guard roles={S}><div className="container"><ManagePosts /></div></Guard>} />
          <Route path="/editor/comments" element={<Guard roles={S}><div className="container"><CommentModeration /></div></Guard>} />

          <Route path="/admin" element={<Guard roles={['admin']}><AdminLayout /></Guard>}>
            <Route index element={<AdminDashboard />} /><Route path="users" element={<AdminUsers />} /><Route path="posts" element={<ManagePosts />} />
            <Route path="categories" element={<AdminCategories />} /><Route path="tags" element={<AdminCategories />} /><Route path="comments" element={<CommentModeration />} />
            <Route path="media" element={<MediaLibrary />} /><Route path="analytics" element={<AdminDashboard full />} /><Route path="reports" element={<AdminReports />} />
            <Route path="newsletters" element={<AdminNewsletters />} /><Route path="notifications" element={<AdminNotifications />} />
            <Route path="settings" element={<AdminSettings />} /><Route path="audit-logs" element={<AdminAudit />} />
          </Route>
          <Route path="*" element={<div className="container empty"><h1>404</h1><p>That page doesn't exist.</p><Link className="btn" to="/">Back home</Link></div>} />
        </Routes>
      </Suspense>
    </main>
    <footer><div className="container row between"><span>© {new Date().getFullYear()} ContentHub</span><span className="small">React · Express · MongoDB · Socket.IO</span></div></footer>
    {toast && <div className="toast" role="status">{toast}</div>}
  </>);
}
