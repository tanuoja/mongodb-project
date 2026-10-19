import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { noSqlSanitize, notFound, errorHandler } from './middleware/security.js';
import { UPLOAD_DIR } from './services/storage.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import commentRoutes from './routes/comments.js';
import meRoutes from './routes/me.js';
import aiRoutes from './routes/ai.js';
import mediaRoutes from './routes/media.js';
import { admin, analytics } from './routes/admin.js';
import { authors, notifications, taxonomy, reports, newsletter } from './routes/community.js';
import { Post } from './models.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(noSqlSanitize);
if (!config.isProd) app.use(morgan('dev'));

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many requests. Please slow down.' } }));
const strict = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { success: false, message: 'Too many attempts. Try again in a few minutes.' } });
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password'], strict);
app.use('/api/ai', rateLimit({ windowMs: 60 * 1000, limit: 30, message: { success: false, message: 'AI rate limit reached. Try again shortly.' } }));

app.use('/uploads', express.static(UPLOAD_DIR));
app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api', commentRoutes);
app.use('/api/me', meRoutes);
app.use('/api/authors', authors);
app.use('/api/notifications', notifications);
app.use('/api', taxonomy);
app.use('/api/reports', reports);
app.use('/api/newsletter', newsletter);
app.use('/api/admin', admin);
app.use('/api/analytics', analytics);
app.use('/api/ai', aiRoutes);
app.use('/api/media', mediaRoutes);

// SEO: sitemap.xml and robots.txt
app.get('/sitemap.xml', async (req, res) => {
  const posts = await Post.find({ status: 'PUBLISHED' }).select('slug updatedAt').lean();
  const urls = posts.map((p) => `<url><loc>${config.clientUrl}/blog/${p.slug}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${config.clientUrl}/</loc></url>${urls}</urlset>`);
});
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /author\nDisallow: /editor\nSitemap: ${config.clientUrl}/sitemap.xml\n`));

app.use(notFound);
app.use(errorHandler);
export default app;
