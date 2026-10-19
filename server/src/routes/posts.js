import { Router } from 'express';
import mongoose from 'mongoose';
import { Post, User, Category, Comment, Analytics, REACTIONS } from '../models.js';
import { protect, optionalAuth, requireRole, AUTHORS, STAFF } from '../middleware/auth.js';
import { ApiError, asyncHandler, escapeRx, uniqueSlug, calcReadingTime, trendingScore, notify, publishPost, audit, paging, pageInfo } from '../utils/helpers.js';

const router = Router();
const LIST = '-content -versions -translations -reactions -seo';
const refs = (q) => q.populate('author', 'name avatar').populate('category', 'name slug');
const isStaff = (u) => u && STAFF.includes(u.role);
const canEdit = (u, post) => isStaff(u) || post.author.equals(u._id);

const SORTS = {
  recent: { publishedAt: -1 }, popular: { views: -1 }, liked: { reactionTotal: -1 },
  commented: { commentCount: -1 }, bookmarked: { bookmarkCount: -1 },
};

/* ------------------------- PUBLIC LISTING + SEARCH ------------------------- */
router.get('/', asyncHandler(async (req, res) => {
  const { q, category, tag, author, sort = 'recent', minRead, maxRead, from, to, featured } = req.query;
  const { page, limit, skip } = paging(req, 9, 30);
  const filter = { status: 'PUBLISHED' };

  if (category) {
    const c = await Category.findOne({ slug: String(category) });
    if (!c) return res.json({ success: true, data: [], pagination: pageInfo(page, limit, 0) });
    const ids = (await Category.find({ $or: [{ _id: c._id }, { parent: c._id }] }).select('_id')).map((x) => x._id);
    filter.category = { $in: ids };
  }
  if (tag) filter.tags = String(tag).toLowerCase();
  if (author && mongoose.isValidObjectId(author)) filter.author = author;
  if (featured) filter.featured = true;
  if (minRead || maxRead) {
    filter.readingTime = {};
    if (minRead) filter.readingTime.$gte = +minRead;
    if (maxRead) filter.readingTime.$lte = +maxRead;
  }
  if (from || to) {
    filter.publishedAt = {};
    if (from) filter.publishedAt.$gte = new Date(from);
    if (to) filter.publishedAt.$lte = new Date(to);
  }
  if (q) {
    const rx = new RegExp(escapeRx(String(q).slice(0, 60)), 'i');
    const [authors, cats] = await Promise.all([User.find({ name: rx }).select('_id'), Category.find({ name: rx }).select('_id')]);
    filter.$or = [{ title: rx }, { summary: rx }, { content: rx }, { tags: rx },
      { author: { $in: authors.map((a) => a._id) } }, { category: { $in: cats.map((c) => c._id) } }];
  }
  const [data, total] = await Promise.all([
    refs(Post.find(filter).select(LIST).sort(SORTS[sort] || SORTS.recent).skip(skip).limit(limit)).lean(),
    Post.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: pageInfo(page, limit, total) });
}));

router.get('/suggest', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ success: true, data: [] });
  const rx = new RegExp('^' + escapeRx(q), 'i');
  const [titles, tags] = await Promise.all([
    Post.find({ status: 'PUBLISHED', title: new RegExp(escapeRx(q), 'i') }).select('title slug').limit(5).lean(),
    Post.distinct('tags', { status: 'PUBLISHED', tags: rx }),
  ]);
  res.json({ success: true, data: [...titles.map((t) => ({ type: 'article', label: t.title, slug: t.slug })), ...tags.slice(0, 3).map((t) => ({ type: 'tag', label: '#' + t }))] });
}));

/* ------------------------- TRENDING + RECOMMENDATIONS ------------------------- */
async function trending(limit = 6) {
  const since = new Date(Date.now() - 90 * 864e5);
  const posts = await refs(Post.find({ status: 'PUBLISHED', publishedAt: { $gte: since } }).select(LIST).limit(300)).lean();
  return posts.map((p) => ({ ...p, trendingScore: trendingScore(p) })).sort((a, b) => b.trendingScore - a.trendingScore).slice(0, limit);
}

router.get('/trending', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await trending(Math.min(30, +req.query.limit || 6)) });
}));

router.get('/recommended', protect, asyncHandler(async (req, res) => {
  const u = req.user;
  const seenIds = [...u.history.map((h) => h.post), ...u.bookmarks];
  const seen = await Post.find({ _id: { $in: seenIds } }).select('category tags').lean();
  const catW = {}, tagW = {};
  seen.forEach((p) => { if (p.category) catW[p.category] = (catW[p.category] || 0) + 1; p.tags.forEach((t) => (tagW[t] = (tagW[t] || 0) + 1)); });
  u.followingCategories.forEach((c) => (catW[c] = (catW[c] || 0) + 3));
  u.followingTags.forEach((t) => (tagW[t] = (tagW[t] || 0) + 3));
  const hasSignal = Object.keys(catW).length || Object.keys(tagW).length || u.following.length;
  if (!hasSignal) return res.json({ success: true, data: await trending(6), personalized: false });

  const readIds = new Set(u.history.map((h) => String(h.post)));
  const cands = await refs(Post.find({ status: 'PUBLISHED', _id: { $nin: [...readIds] } }).select(LIST).sort({ publishedAt: -1 }).limit(150)).lean();
  const scored = cands.map((p) => {
    let s = (catW[p.category?._id] || 0) * 3 + p.tags.reduce((a, t) => a + (tagW[t] || 0) * 2, 0);
    if (u.following.some((f) => f.equals(p.author._id))) s += 6;
    return { ...p, score: s + trendingScore(p) / 100 };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
  res.json({ success: true, data: scored, personalized: true });
}));

/* ------------------------- AUTHOR / STAFF LISTS ------------------------- */
router.get('/mine', protect, requireRole(...AUTHORS), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 10);
  const filter = { author: req.user._id };
  if (req.query.status) filter.status = String(req.query.status);
  const [data, total, counts] = await Promise.all([
    refs(Post.find(filter).select(LIST).sort({ updatedAt: -1 }).skip(skip).limit(limit)).lean(),
    Post.countDocuments(filter),
    Post.aggregate([{ $match: { author: req.user._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({ success: true, data, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])), pagination: pageInfo(page, limit, total) });
}));

router.get('/manage', protect, requireRole(...STAFF), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 10);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) filter.title = new RegExp(escapeRx(String(req.query.q)), 'i');
  const [data, total] = await Promise.all([
    refs(Post.find(filter).select(LIST).sort({ updatedAt: -1 }).skip(skip).limit(limit)).lean(),
    Post.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: pageInfo(page, limit, total) });
}));

/* ------------------------- READ ONE ARTICLE (by slug) ------------------------- */
const sourceOf = (ref = '') => {
  if (/google|bing|duckduckgo/i.test(ref)) return 'search';
  if (/facebook|twitter|x\.com|t\.co|linkedin|whatsapp|instagram/i.test(ref)) return 'social';
  return ref && !ref.includes('localhost') ? 'referral' : 'direct';
};

router.get('/slug/:slug', optionalAuth, asyncHandler(async (req, res) => {
  const post = await refs(Post.findOne({ slug: req.params.slug }).select('-versions'));
  if (!post) throw new ApiError(404, 'Article not found.');
  const mine = req.user && post.author._id.equals(req.user._id);
  if (post.status !== 'PUBLISHED' && !isStaff(req.user) && !mine) throw new ApiError(404, 'Article not found.');

  if (post.status === 'PUBLISHED') {
    const day = new Date(new Date().toISOString().slice(0, 10));
    const src = sourceOf(req.get('referer') || req.query.ref);
    await Promise.all([
      Post.updateOne({ _id: post._id }, { $inc: { views: 1 } }),
      Analytics.updateOne({ post: post._id, date: day }, { $inc: { views: 1, [`sources.${src}`]: 1 } }, { upsert: true }).catch(() => {}),
    ]);
    post.views += 1;
    if (req.user) { // reading history: remove old entry, push new one, keep last 50
      await User.updateOne({ _id: req.user._id }, { $pull: { history: { post: post._id } } });
      await User.updateOne({ _id: req.user._id }, { $push: { history: { $each: [{ post: post._id, at: new Date() }], $slice: -50 } } });
    }
  }
  const obj = post.toObject();
  const myReaction = req.user ? post.reactions.find((r) => r.user.equals(req.user._id))?.type || null : null;
  delete obj.reactions;
  const lang = req.query.lang, tr = lang && post.translations.find((t) => t.lang === lang);
  if (tr) Object.assign(obj, { title: tr.title || obj.title, summary: tr.summary || obj.summary, content: tr.content || obj.content });
  obj.availableLanguages = ['en', ...post.translations.map((t) => t.lang)];
  res.json({ success: true, data: { ...obj, myReaction, bookmarked: !!req.user?.bookmarks.some((b) => b.equals(post._id)) } });
}));

router.get('/slug/:slug/related', asyncHandler(async (req, res) => {
  const post = await Post.findOne({ slug: req.params.slug }).select('category tags author').lean();
  if (!post) return res.json({ success: true, data: [] });
  const cands = await refs(Post.find({
    status: 'PUBLISHED', _id: { $ne: post._id },
    $or: [{ category: post.category }, { tags: { $in: post.tags } }, { author: post.author }],
  }).select(LIST).limit(40)).lean();
  const scored = cands.map((p) => ({
    ...p, score: (String(p.category?._id) === String(post.category) ? 3 : 0) + p.tags.filter((t) => post.tags.includes(t)).length * 2 + (String(p.author._id) === String(post.author) ? 1 : 0),
  })).sort((a, b) => b.score - a.score).slice(0, 3);
  res.json({ success: true, data: scored });
}));

/* ------------------------- CREATE / EDIT / DELETE ------------------------- */
const loadPost = async (id, user, { forEdit = true } = {}) => {
  const post = await Post.findById(id);
  if (!post) throw new ApiError(404, 'Article not found.');
  if (forEdit && !canEdit(user, post)) throw new ApiError(403, 'You are not authorized to perform this action.');
  return post;
};

router.post('/', protect, requireRole(...AUTHORS), asyncHandler(async (req, res) => {
  const { title, content = '', summary = '', coverImage, category, tags = [], seo = {}, language = 'en' } = req.body;
  if (!title?.trim()) throw new ApiError(400, 'Title is required.');
  const post = await Post.create({
    title, content, summary, coverImage, category: category || undefined, tags, seo, language,
    slug: await uniqueSlug(title), author: req.user._id, readingTime: calcReadingTime(content),
    versions: [{ versionNumber: 1, title, content, editedBy: req.user._id, changeNote: 'Initial draft' }],
  });
  res.status(201).json({ success: true, data: post });
}));

router.get('/:id', protect, asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user);
  res.json({ success: true, data: await post.populate('author', 'name avatar') });
}));

router.put('/:id', protect, asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user);
  if (!isStaff(req.user) && !['DRAFT', 'REJECTED'].includes(post.status))
    throw new ApiError(403, 'Only drafts or rejected articles can be edited by the author.');
  const { title, content, summary, coverImage, category, tags, seo, language, featured, changeNote } = req.body;
  const contentChanged = (title !== undefined && title !== post.title) || (content !== undefined && content !== post.content);
  if (title !== undefined) { if (!title.trim()) throw new ApiError(400, 'Title is required.'); post.title = title; }
  if (content !== undefined) post.content = content;
  if (summary !== undefined) post.summary = summary;
  if (coverImage !== undefined) post.coverImage = coverImage;
  if (category !== undefined) post.category = category || undefined;
  if (tags !== undefined) post.tags = tags;
  if (seo !== undefined) post.seo = seo;
  if (language !== undefined) post.language = language;
  if (featured !== undefined && isStaff(req.user)) post.featured = !!featured;
  post.readingTime = calcReadingTime(post.content);
  if (contentChanged) {
    post.versions.push({ versionNumber: post.versions.length + 1, title: post.title, content: post.content, editedBy: req.user._id, changeNote: changeNote || 'Updated' });
  }
  await post.save();
  res.json({ success: true, data: post });
}));

router.put('/:id/translations', protect, asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user);
  const { lang, title, summary, content } = req.body;
  if (!['ta', 'hi'].includes(lang)) throw new ApiError(400, 'Unsupported language.');
  const existing = post.translations.find((t) => t.lang === lang);
  if (existing) Object.assign(existing, { title, summary, content }); else post.translations.push({ lang, title, summary, content });
  await post.save();
  res.json({ success: true, data: post.translations });
}));

router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user);
  if (!isStaff(req.user) && !['DRAFT', 'REJECTED'].includes(post.status)) throw new ApiError(403, 'Only drafts can be deleted by the author.');
  await Promise.all([post.deleteOne(), Comment.deleteMany({ post: post._id }), Analytics.deleteMany({ post: post._id })]);
  if (isStaff(req.user)) await audit(req, 'deleted article', 'Post', post._id, post.title);
  res.json({ success: true, message: 'Article deleted.' });
}));

/* ------------------------- EDITORIAL WORKFLOW ------------------------- */
router.post('/:id/submit', protect, asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user);
  if (!['DRAFT', 'REJECTED'].includes(post.status)) throw new ApiError(400, 'Only drafts can be submitted for review.');
  if (!post.content.trim() || !post.summary.trim()) throw new ApiError(400, 'Please add a summary and some content before submitting.');
  post.status = 'PENDING_REVIEW'; post.rejectionFeedback = undefined; await post.save();
  const editors = await User.find({ role: { $in: STAFF }, status: 'active' }).select('_id');
  await Promise.all(editors.map((e) => notify(e._id, 'review', `"${post.title}" is waiting for review.`, '/editor/review')));
  res.json({ success: true, data: post });
}));

router.post('/:id/approve', protect, requireRole(...STAFF), asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user, { forEdit: false });
  if (post.status !== 'PENDING_REVIEW') throw new ApiError(400, 'Only articles pending review can be approved.');
  post.status = 'APPROVED'; await post.save();
  await notify(post.author, 'approved', `Your article "${post.title}" was approved.`, `/author/posts/${post._id}/edit`);
  await audit(req, 'approved article', 'Post', post._id, post.title);
  res.json({ success: true, data: post });
}));

router.post('/:id/reject', protect, requireRole(...STAFF), asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user, { forEdit: false });
  if (post.status !== 'PENDING_REVIEW') throw new ApiError(400, 'Only articles pending review can be rejected.');
  if (!req.body.feedback?.trim()) throw new ApiError(400, 'Please give the author some feedback.');
  post.status = 'REJECTED'; post.rejectionFeedback = req.body.feedback; await post.save();
  await notify(post.author, 'rejected', `Your article "${post.title}" needs changes: ${req.body.feedback}`, `/author/posts/${post._id}/edit`);
  await audit(req, 'rejected article', 'Post', post._id, post.title);
  res.json({ success: true, data: post });
}));

router.post('/:id/publish', protect, requireRole(...STAFF), asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user, { forEdit: false });
  const ok = ['APPROVED', 'SCHEDULED'].includes(post.status) || (req.user.role === 'admin' && post.status !== 'PUBLISHED');
  if (!ok) throw new ApiError(400, 'Only approved articles can be published.');
  await publishPost(post);
  await audit(req, 'published article', 'Post', post._id, post.title);
  res.json({ success: true, data: post });
}));

router.post('/:id/schedule', protect, requireRole(...STAFF), asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user, { forEdit: false });
  const when = new Date(req.body.scheduledAt);
  if (isNaN(when) || when <= new Date()) throw new ApiError(400, 'Please choose a date and time in the future.');
  const ok = ['APPROVED', 'SCHEDULED'].includes(post.status) || (req.user.role === 'admin' && post.status !== 'PUBLISHED');
  if (!ok) throw new ApiError(400, 'Only approved articles can be scheduled.');
  post.status = 'SCHEDULED'; post.scheduledAt = when; await post.save();
  await notify(post.author, 'scheduled', `"${post.title}" is scheduled for ${when.toLocaleString()}.`, `/author/posts/${post._id}/edit`);
  res.json({ success: true, data: post });
}));

router.post('/:id/unpublish', protect, requireRole(...STAFF), asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user, { forEdit: false });
  post.status = 'ARCHIVED'; await post.save();
  await audit(req, 'unpublished article', 'Post', post._id, post.title);
  res.json({ success: true, data: post });
}));

/* ------------------------- VERSION HISTORY ------------------------- */
router.get('/:id/versions', protect, asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user);
  await post.populate('versions.editedBy', 'name');
  res.json({ success: true, data: [...post.versions].reverse() });
}));

router.post('/:id/versions/:n/restore', protect, asyncHandler(async (req, res) => {
  const post = await loadPost(req.params.id, req.user);
  const v = post.versions.find((x) => x.versionNumber === +req.params.n);
  if (!v) throw new ApiError(404, 'Version not found.');
  post.title = v.title; post.content = v.content; post.readingTime = calcReadingTime(v.content);
  post.versions.push({ versionNumber: post.versions.length + 1, title: v.title, content: v.content, editedBy: req.user._id, changeNote: `Restored version ${v.versionNumber}` });
  await post.save(); // old versions are never deleted
  await audit(req, 'restored version', 'Post', post._id, `v${v.versionNumber}`);
  res.json({ success: true, data: post });
}));

/* ------------------------- ENGAGEMENT: reactions, bookmark, share ------------------------- */
router.post('/:id/reactions', protect, asyncHandler(async (req, res) => {
  const { type } = req.body;
  if (!REACTIONS.includes(type)) throw new ApiError(400, 'Unknown reaction.');
  const post = await Post.findOne({ _id: req.params.id, status: 'PUBLISHED' }).select('reactions reactionCounts reactionTotal author title slug');
  if (!post) throw new ApiError(404, 'Article not found.');
  const mine = post.reactions.find((r) => r.user.equals(req.user._id));
  let myReaction = type;
  if (mine && mine.type === type) { post.reactions = post.reactions.filter((r) => r !== mine); myReaction = null; } // click again = remove
  else if (mine) mine.type = type;                                                                                   // switch reaction
  else { post.reactions.push({ user: req.user._id, type }); if (!post.author.equals(req.user._id)) await notify(post.author, 'reaction', `${req.user.name} reacted to "${post.title}".`, `/blog/${post.slug}`); }
  const counts = Object.fromEntries(REACTIONS.map((r) => [r, 0]));
  post.reactions.forEach((r) => counts[r.type]++);
  post.reactionCounts = counts; post.reactionTotal = post.reactions.length;
  post.markModified('reactionCounts');
  await post.save();
  res.json({ success: true, data: { reactionCounts: counts, reactionTotal: post.reactionTotal, myReaction } });
}));

router.post('/:id/bookmark', protect, asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, status: 'PUBLISHED' }).select('_id');
  if (!post) throw new ApiError(404, 'Article not found.');
  const has = req.user.bookmarks.some((b) => b.equals(post._id));
  await User.updateOne({ _id: req.user._id }, has ? { $pull: { bookmarks: post._id } } : { $addToSet: { bookmarks: post._id } });
  await Post.updateOne({ _id: post._id }, { $inc: { bookmarkCount: has ? -1 : 1 } });
  res.json({ success: true, data: { bookmarked: !has } });
}));

router.post('/:id/share', asyncHandler(async (req, res) => {
  const p = await Post.findByIdAndUpdate(req.params.id, { $inc: { shares: 1 } }, { new: true }).select('shares');
  res.json({ success: true, data: { shares: p?.shares || 0 } });
}));

export default router;
