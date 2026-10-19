import { config } from '../config.js';
import { Post, AuditLog, Notification, User } from '../models.js';
import { getIO } from '../socket.js';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'post';

export async function uniqueSlug(title, ignoreId) {
  const base = slugify(title);
  let slug = base, n = 1;
  while (await Post.exists({ slug, _id: { $ne: ignoreId } })) slug = `${base}-${++n}`;
  return slug;
}

export const calcReadingTime = (text = '') =>
  Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / config.wordsPerMinute));

export const trendingScore = (p) => {
  const w = config.trending;
  const ageDays = (Date.now() - new Date(p.publishedAt || p.createdAt)) / 864e5;
  const recency = w.recencyMax * Math.pow(0.5, ageDays / w.halfLifeDays);
  return Math.round((p.views * w.views + p.reactionTotal * w.likes + p.commentCount * w.comments +
    p.bookmarkCount * w.bookmarks + p.shares * w.shares + Math.min(p.readingTime, 10) * w.readingTime + recency) * 10) / 10;
};

export function audit(req, action, targetType, targetId, details = '') {
  return AuditLog.create({ actor: req.user?._id, action, targetType, targetId: String(targetId || ''), details, ip: req.ip, userAgent: req.get('user-agent') }).catch(() => {});
}

/** Save a notification and push it to the user's live socket room. */
export async function notify(userId, type, message, link = '/') {
  const n = await Notification.create({ user: userId, type, message, link });
  getIO()?.to(`user:${userId}`).emit('notification', n);
  return n;
}

/** Publish a post and notify everyone who follows the author. Used by routes AND the scheduler. */
export async function publishPost(post) {
  post.status = 'PUBLISHED';
  post.publishedAt = new Date();
  post.scheduledAt = undefined;
  await post.save();
  const author = await User.findById(post.author).select('name');
  const followers = await User.find({ following: post.author, status: 'active' }).select('_id');
  await Promise.all(followers.map((f) => notify(f._id, 'new_post', `${author?.name} published a new article: ${post.title}`, `/blog/${post.slug}`)));
  await notify(post.author, 'published', `Your article "${post.title}" is now live.`, `/blog/${post.slug}`);
}

export const paging = (req, def = 10, max = 50) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(max, parseInt(req.query.limit) || def);
  return { page, limit, skip: (page - 1) * limit };
};
export const pageInfo = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
