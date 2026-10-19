// Authors, notifications, categories, tags, reports, newsletter
import { Router } from 'express';
import { User, Post, Category, Notification, Report, Comment, Subscriber, Newsletter } from '../models.js';
import { protect, requireRole, STAFF } from '../middleware/auth.js';
import { ApiError, asyncHandler, slugify, notify, audit, paging, pageInfo } from '../utils/helpers.js';

export const authors = Router();
export const notifications = Router();
export const taxonomy = Router();
export const reports = Router();
export const newsletter = Router();

/* ---------- AUTHORS ---------- */
authors.get('/', asyncHandler(async (req, res) => {
  const stats = await Post.aggregate([
    { $match: { status: 'PUBLISHED' } },
    { $group: { _id: '$author', articles: { $sum: 1 }, views: { $sum: '$views' }, likes: { $sum: '$reactionTotal' } } },
    { $sort: { views: -1 } }, { $limit: 30 },
  ]);
  const users = await User.find({ _id: { $in: stats.map((s) => s._id) } }).select('name avatar bio').lean();
  const followers = await User.aggregate([{ $unwind: '$following' }, { $group: { _id: '$following', n: { $sum: 1 } } }]);
  const fMap = Object.fromEntries(followers.map((f) => [f._id, f.n]));
  res.json({ success: true, data: stats.map((s) => ({ ...users.find((u) => u._id.equals(s._id)), articles: s.articles, views: s.views, likes: s.likes, followers: fMap[s._id] || 0 })).filter((a) => a.name) });
}));

authors.get('/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('name avatar bio social role createdAt').lean();
  if (!user) throw new ApiError(404, 'Author not found.');
  const [articles, followers] = await Promise.all([Post.countDocuments({ author: user._id, status: 'PUBLISHED' }), User.countDocuments({ following: user._id })]);
  res.json({ success: true, data: { ...user, articles, followers } });
}));

authors.post('/:id/follow', protect, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw new ApiError(400, 'You cannot follow yourself.');
  const target = await User.findById(req.params.id).select('_id name');
  if (!target) throw new ApiError(404, 'Author not found.');
  const has = req.user.following.some((f) => f.equals(target._id));
  await User.updateOne({ _id: req.user._id }, has ? { $pull: { following: target._id } } : { $addToSet: { following: target._id } });
  if (!has) await notify(target._id, 'follow', `${req.user.name} started following you.`, `/author/${req.user.id}`);
  res.json({ success: true, data: { following: !has, followers: await User.countDocuments({ following: target._id }) } });
}));

/* ---------- NOTIFICATIONS ---------- */
notifications.use(protect);
notifications.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 15, 50);
  const [data, total, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments({ user: req.user._id }),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ success: true, data, unread, pagination: pageInfo(page, limit, total) });
}));
notifications.put('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ success: true });
}));
notifications.put('/:id/read', asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  res.json({ success: true });
}));

/* ---------- CATEGORIES + TAGS ---------- */
taxonomy.get('/categories', asyncHandler(async (req, res) => {
  const [cats, counts] = await Promise.all([Category.find().sort({ name: 1 }).lean(), Post.aggregate([{ $match: { status: 'PUBLISHED' } }, { $group: { _id: '$category', n: { $sum: 1 } } }])]);
  const c = Object.fromEntries(counts.map((x) => [x._id, x.n]));
  res.json({ success: true, data: cats.map((x) => ({ ...x, postCount: c[x._id] || 0 })) });
}));
taxonomy.post('/categories', protect, requireRole(...STAFF), asyncHandler(async (req, res) => {
  if (!req.body.name?.trim()) throw new ApiError(400, 'Category name is required.');
  const cat = await Category.create({ name: req.body.name.trim(), slug: slugify(req.body.name), description: req.body.description, parent: req.body.parent || null });
  await audit(req, 'created category', 'Category', cat._id, cat.name);
  res.status(201).json({ success: true, data: cat });
}));
taxonomy.delete('/categories/:id', protect, requireRole(...STAFF), asyncHandler(async (req, res) => {
  if (await Post.exists({ category: req.params.id })) throw new ApiError(400, 'This category still has articles. Move them first.');
  await Category.deleteMany({ $or: [{ _id: req.params.id }, { parent: req.params.id }] });
  await audit(req, 'deleted category', 'Category', req.params.id);
  res.json({ success: true });
}));
taxonomy.get('/tags', asyncHandler(async (req, res) => {
  const data = await Post.aggregate([{ $match: { status: 'PUBLISHED' } }, { $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: +req.query.limit || 50 }]);
  res.json({ success: true, data: data.map((t) => ({ name: t._id, count: t.count })) });
}));

/* ---------- REPORTS (user-facing create; admin handling lives in admin.js) ---------- */
reports.post('/', protect, asyncHandler(async (req, res) => {
  const { targetType, targetId, reason, details } = req.body;
  const r = await Report.create({ reporter: req.user._id, targetType, targetId, reason, details });
  res.status(201).json({ success: true, data: r, message: 'Thanks, our moderators will take a look.' });
}));

/* ---------- NEWSLETTER ---------- */
newsletter.post('/subscribe', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Please enter a valid email address.');
  await Subscriber.updateOne({ email }, { email, active: true }, { upsert: true });
  res.json({ success: true, message: 'You are subscribed to ContentHub Weekly!' });
}));
newsletter.get('/', protect, requireRole('admin'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await Newsletter.find().sort({ createdAt: -1 }).populate('posts', 'title slug').lean(), subscribers: await Subscriber.countDocuments({ active: true }) });
}));
newsletter.post('/', protect, requireRole('admin'), asyncHandler(async (req, res) => {
  const { subject, intro, posts = [], scheduledAt } = req.body;
  if (!subject?.trim()) throw new ApiError(400, 'Subject is required.');
  const n = await Newsletter.create({ subject, intro, posts, createdBy: req.user._id, status: scheduledAt ? 'SCHEDULED' : 'DRAFT', scheduledAt: scheduledAt || undefined });
  res.status(201).json({ success: true, data: n });
}));
newsletter.post('/:id/send', protect, requireRole('admin'), asyncHandler(async (req, res) => {
  const n = await Newsletter.findById(req.params.id).populate('posts', 'title slug');
  if (!n) throw new ApiError(404, 'Newsletter not found.');
  const subs = await Subscriber.find({ active: true });
  // Plug an email provider (Nodemailer, SendGrid...) in here. We log instead so it works offline.
  console.log(`📰 Sending "${n.subject}" to ${subs.length} subscribers:\n` + n.posts.map((p, i) => `  ${i + 1}. ${p.title}`).join('\n'));
  n.status = 'SENT'; n.sentAt = new Date(); n.sentTo = subs.length; await n.save();
  await audit(req, 'sent newsletter', 'Newsletter', n._id, n.subject);
  res.json({ success: true, data: n });
}));
