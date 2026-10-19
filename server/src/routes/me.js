import { Router } from 'express';
import { User, Post } from '../models.js';
import { protect } from '../middleware/auth.js';
import { ApiError, asyncHandler, escapeRx, paging, pageInfo } from '../utils/helpers.js';

const router = Router();
router.use(protect);
const LIST = '-content -versions -translations -reactions -seo';

router.get('/bookmarks', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 9, 30);
  const filter = { _id: { $in: req.user.bookmarks }, status: 'PUBLISHED' };
  if (req.query.q) filter.title = new RegExp(escapeRx(String(req.query.q)), 'i');
  if (req.query.tag) filter.tags = String(req.query.tag).toLowerCase();
  const [data, total] = await Promise.all([
    Post.find(filter).select(LIST).populate('author', 'name avatar').populate('category', 'name slug').skip(skip).limit(limit).lean(),
    Post.countDocuments(filter),
  ]);
  res.json({ success: true, data, pagination: pageInfo(page, limit, total) });
}));

router.get('/history', asyncHandler(async (req, res) => {
  const ids = [...req.user.history].reverse().map((h) => h.post);
  const posts = await Post.find({ _id: { $in: ids }, status: 'PUBLISHED' }).select(LIST).populate('author', 'name avatar').populate('category', 'name slug').lean();
  const byId = Object.fromEntries(posts.map((p) => [p._id, p]));
  const at = Object.fromEntries(req.user.history.map((h) => [h.post, h.at]));
  res.json({ success: true, data: ids.map((id) => byId[id] && { ...byId[id], readAt: at[id] }).filter(Boolean) });
}));

router.delete('/history', asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { history: [] } });
  res.json({ success: true });
}));

router.get('/following', asyncHandler(async (req, res) => {
  const [authors, posts] = await Promise.all([
    User.find({ _id: { $in: req.user.following } }).select('name avatar bio').lean(),
    Post.find({ author: { $in: req.user.following }, status: 'PUBLISHED' }).select(LIST).sort({ publishedAt: -1 }).limit(12).populate('author', 'name avatar').populate('category', 'name slug').lean(),
  ]);
  res.json({ success: true, data: { authors, posts, tags: req.user.followingTags } });
}));

router.post('/follow-tag', asyncHandler(async (req, res) => {
  const tag = String(req.body.tag || '').toLowerCase().trim();
  if (!tag) throw new ApiError(400, 'Tag is required.');
  const has = req.user.followingTags.includes(tag);
  await User.updateOne({ _id: req.user._id }, has ? { $pull: { followingTags: tag } } : { $addToSet: { followingTags: tag } });
  res.json({ success: true, data: { following: !has } });
}));

router.post('/follow-category', asyncHandler(async (req, res) => {
  const has = req.user.followingCategories.some((c) => c.equals(req.body.category));
  await User.updateOne({ _id: req.user._id }, has ? { $pull: { followingCategories: req.body.category } } : { $addToSet: { followingCategories: req.body.category } });
  res.json({ success: true, data: { following: !has } });
}));

export default router;
