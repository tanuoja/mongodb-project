import { Router } from 'express';
import { User, Post, Comment, Report, AuditLog, Analytics, Category } from '../models.js';
import { protect, requireRole, STAFF } from '../middleware/auth.js';
import { ApiError, asyncHandler, escapeRx, audit, notify, paging, pageInfo } from '../utils/helpers.js';

export const admin = Router();
export const analytics = Router();
admin.use(protect);
analytics.use(protect);

/* ---------- USERS (admin only) ---------- */
admin.get('/users', requireRole('admin'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 10);
  const filter = {};
  if (req.query.role) filter.role = String(req.query.role);
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) { const rx = new RegExp(escapeRx(String(req.query.q)), 'i'); filter.$or = [{ name: rx }, { email: rx }]; }
  const [users, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), User.countDocuments(filter)]);
  const counts = await Post.aggregate([{ $match: { author: { $in: users.map((u) => u._id) } } }, { $group: { _id: '$author', n: { $sum: 1 } } }]);
  const c = Object.fromEntries(counts.map((x) => [x._id, x.n]));
  res.json({ success: true, data: users.map((u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, createdAt: u.createdAt, articles: c[u._id] || 0, lastRead: u.history?.slice(-1)[0]?.at })), pagination: pageInfo(page, limit, total) });
}));

admin.patch('/users/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found.');
  if (user.id === req.user.id) throw new ApiError(400, 'You cannot change your own role or status.');
  const { role, status } = req.body;
  if (role) { await audit(req, `changed ${user.name}'s role from ${user.role} to ${role}`, 'User', user._id); user.role = role; }
  if (status) { await audit(req, `${status === 'suspended' ? 'suspended' : 'activated'} ${user.name}`, 'User', user._id); user.status = status; }
  await user.save();
  res.json({ success: true });
}));

admin.delete('/users/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw new ApiError(400, 'You cannot delete your own account here.');
  const user = await User.findByIdAndDelete(req.params.id);
  if (user) await audit(req, `deleted user ${user.name}`, 'User', user._id);
  res.json({ success: true });
}));

/* ---------- COMMENT MODERATION (editor + admin) ---------- */
admin.get('/comments', requireRole(...STAFF), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 10);
  const filter = { status: req.query.status || 'flagged' };
  const [data, total] = await Promise.all([
    Comment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author', 'name email').populate('post', 'title slug').lean(),
    Comment.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: pageInfo(page, limit, total) });
}));

admin.patch('/comments/:id', requireRole(...STAFF), asyncHandler(async (req, res) => {
  const c = await Comment.findById(req.params.id);
  if (!c) throw new ApiError(404, 'Comment not found.');
  const { status } = req.body; // visible | removed
  if (c.status !== 'visible' && status === 'visible') await Post.updateOne({ _id: c.post }, { $inc: { commentCount: 1 } });
  if (c.status === 'visible' && status === 'removed') await Post.updateOne({ _id: c.post }, { $inc: { commentCount: -1 } });
  c.status = status; if (status === 'visible') c.flagReason = undefined; await c.save();
  await audit(req, `${status === 'visible' ? 'approved' : 'removed'} comment`, 'Comment', c._id);
  res.json({ success: true });
}));

/* ---------- REPORTS / MODERATION QUEUE ---------- */
admin.get('/reports', requireRole(...STAFF), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 10);
  const filter = { status: req.query.status || 'open' };
  const [reports, total] = await Promise.all([Report.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('reporter', 'name').lean(), Report.countDocuments(filter)]);
  // Attach a small preview of whatever was reported
  for (const r of reports) {
    if (r.targetType === 'comment') r.preview = (await Comment.findById(r.targetId).select('body').lean())?.body;
    if (r.targetType === 'article') r.preview = (await Post.findById(r.targetId).select('title').lean())?.title;
    if (r.targetType === 'user') r.preview = (await User.findById(r.targetId).select('name').lean())?.name;
  }
  res.json({ success: true, data: reports, pagination: pageInfo(page, limit, total) });
}));

admin.patch('/reports/:id', requireRole(...STAFF), asyncHandler(async (req, res) => {
  const r = await Report.findById(req.params.id);
  if (!r) throw new ApiError(404, 'Report not found.');
  const { action } = req.body; // dismiss | remove | warn | suspend
  let ownerId;
  if (r.targetType === 'comment') ownerId = (await Comment.findById(r.targetId))?.author;
  if (r.targetType === 'article') ownerId = (await Post.findById(r.targetId))?.author;
  if (r.targetType === 'user') ownerId = r.targetId;

  if (action === 'remove') {
    if (r.targetType === 'comment') await Comment.updateOne({ _id: r.targetId }, { status: 'removed', body: '[removed by moderator]' });
    if (r.targetType === 'article') await Post.updateOne({ _id: r.targetId }, { status: 'ARCHIVED' });
  }
  if (action === 'warn' && ownerId) { await User.updateOne({ _id: ownerId }, { $inc: { warnings: 1 } }); await notify(ownerId, 'warning', `Moderator warning: your content was reported for "${r.reason}".`, '/'); }
  if (action === 'suspend' && ownerId) {
    if (req.user.role !== 'admin') throw new ApiError(403, 'Only admins can suspend users.');
    await User.updateOne({ _id: ownerId }, { status: 'suspended' });
  }
  r.status = action === 'dismiss' ? 'dismissed' : 'actioned'; r.resolution = action; await r.save();
  await audit(req, `report ${action}`, r.targetType, r.targetId, r.reason);
  res.json({ success: true });
}));

/* ---------- AUDIT LOGS ---------- */
admin.get('/audit-logs', requireRole('admin'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 20, 100);
  const [data, total] = await Promise.all([AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor', 'name role').lean(), AuditLog.countDocuments()]);
  res.json({ success: true, data, pagination: pageInfo(page, limit, total) });
}));

/* ---------- ANALYTICS ---------- */
const FORMATS = { daily: ['%Y-%m-%d', 30], weekly: ['%G-W%V', 84], monthly: ['%Y-%m', 365] };
const since = (d) => new Date(Date.now() - d * 864e5);

analytics.get('/', requireRole(...STAFF), asyncHandler(async (req, res) => {
  const [fmt, days] = FORMATS[req.query.period] || FORMATS.daily;
  const [users, posts, sums, viewsSeries, userGrowth, postGrowth, topArticles, topAuthors, popularCategories, traffic, commentSeries] = await Promise.all([
    User.countDocuments(),
    Post.countDocuments(),
    Post.aggregate([{ $group: { _id: null, views: { $sum: '$views' }, likes: { $sum: '$reactionTotal' }, comments: { $sum: '$commentCount' }, bookmarks: { $sum: '$bookmarkCount' }, shares: { $sum: '$shares' } } }]),
    Analytics.aggregate([{ $match: { date: { $gte: since(days) } } }, { $group: { _id: { $dateToString: { format: fmt, date: '$date' } }, v: { $sum: '$views' } } }, { $sort: { _id: 1 } }]),
    User.aggregate([{ $match: { createdAt: { $gte: since(days) } } }, { $group: { _id: { $dateToString: { format: fmt, date: '$createdAt' } }, v: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Post.aggregate([{ $match: { createdAt: { $gte: since(days) } } }, { $group: { _id: { $dateToString: { format: fmt, date: '$createdAt' } }, v: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Post.find({ status: 'PUBLISHED' }).sort({ views: -1 }).limit(5).select('title slug views').lean(),
    Post.aggregate([
      { $match: { status: 'PUBLISHED' } },
      { $group: { _id: '$author', articles: { $sum: 1 }, views: { $sum: '$views' }, engagement: { $sum: { $add: [{ $multiply: ['$reactionTotal', 3] }, { $multiply: ['$commentCount', 4] }, { $multiply: ['$bookmarkCount', 5] }] } } } },
      { $sort: { engagement: -1 } }, { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } }, { $unwind: '$u' },
      { $project: { name: '$u.name', articles: 1, views: 1, engagement: 1 } },
    ]),
    Post.aggregate([{ $match: { status: 'PUBLISHED' } }, { $group: { _id: '$category', views: { $sum: '$views' } } }, { $sort: { views: -1 } }, { $limit: 6 }, { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } }, { $project: { name: { $ifNull: [{ $arrayElemAt: ['$c.name', 0] }, 'Uncategorised'] }, views: 1 } }]),
    Analytics.aggregate([{ $group: { _id: null, direct: { $sum: '$sources.direct' }, search: { $sum: '$sources.search' }, social: { $sum: '$sources.social' }, referral: { $sum: '$sources.referral' } } }]),
    Comment.aggregate([{ $match: { createdAt: { $gte: since(days) } } }, { $group: { _id: { $dateToString: { format: fmt, date: '$createdAt' } }, v: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  const s = sums[0] || {};
  const series = (a) => a.map((x) => ({ label: x._id, value: x.v }));
  res.json({ success: true, data: {
    totals: { users, articles: posts, views: s.views || 0, comments: s.comments || 0, likes: s.likes || 0, bookmarks: s.bookmarks || 0, shares: s.shares || 0 },
    views: series(viewsSeries), userGrowth: series(userGrowth), articleGrowth: series(postGrowth), comments: series(commentSeries),
    topArticles, topAuthors, popularCategories, traffic: traffic[0] ? { direct: traffic[0].direct, search: traffic[0].search, social: traffic[0].social, referral: traffic[0].referral } : {},
  } });
}));

analytics.get('/author', requireRole('author', 'editor', 'admin'), asyncHandler(async (req, res) => {
  const mine = await Post.find({ author: req.user._id }).select('title slug status views reactionTotal commentCount bookmarkCount').lean();
  const published = mine.filter((p) => p.status === 'PUBLISHED');
  const sum = (k) => published.reduce((a, p) => a + p[k], 0);
  const series = await Analytics.aggregate([
    { $match: { post: { $in: mine.map((p) => p._id) }, date: { $gte: since(30) } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, v: { $sum: '$views' } } }, { $sort: { _id: 1 } },
  ]);
  res.json({ success: true, data: {
    totals: { views: sum('views'), likes: sum('reactionTotal'), comments: sum('commentCount'), bookmarks: sum('bookmarkCount'), followers: await User.countDocuments({ following: req.user._id }) },
    best: [...published].sort((a, b) => b.views - a.views).slice(0, 5),
    views: series.map((x) => ({ label: x._id, value: x.v })),
  } });
}));

/* ---------- BROADCAST + SETTINGS (admin) ---------- */
admin.post('/broadcast', requireRole('admin'), asyncHandler(async (req, res) => {
  const { message, link = '/' } = req.body;
  if (!message?.trim()) throw new ApiError(400, 'Message is required.');
  const users = await User.find({ status: 'active' }).select('_id');
  await Promise.all(users.map((u) => notify(u._id, 'announcement', message, link)));
  await audit(req, 'sent broadcast notification', 'Notification', '', message);
  res.json({ success: true, message: `Sent to ${users.length} users.` });
}));

admin.get('/settings', requireRole('admin'), asyncHandler(async (req, res) => {
  const { config } = await import('../config.js');
  res.json({ success: true, data: { wordsPerMinute: config.wordsPerMinute, trending: config.trending, aiProvider: config.ai.provider } });
}));
