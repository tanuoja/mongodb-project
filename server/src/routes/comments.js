import { Router } from 'express';
import { Comment, Post } from '../models.js';
import { protect, optionalAuth, STAFF } from '../middleware/auth.js';
import { ApiError, asyncHandler, notify, paging, pageInfo } from '../utils/helpers.js';
import { ai } from '../services/ai.js';
import { getIO } from '../socket.js';

// Mounted at /api  ->  /api/posts/:id/comments  and  /api/comments/:id
const router = Router();

router.get('/posts/:id/comments', optionalAuth, asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 10, 30);
  const base = { post: req.params.id, parent: null };
  const visible = { $or: [{ status: 'visible' }, ...(req.user ? [{ author: req.user._id, status: 'flagged' }] : [])] };
  const [top, total] = await Promise.all([
    Comment.find({ ...base, ...visible }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author', 'name avatar role').lean(),
    Comment.countDocuments({ ...base, ...visible }),
  ]);
  // Replies of any depth carry a `root` field, so one query loads all replies for this page of comments
  const replies = await Comment.find({ root: { $in: top.map((c) => c._id) }, ...visible }).sort({ createdAt: 1 }).populate('author', 'name avatar role').lean();
  res.json({ success: true, data: [...top, ...replies], pagination: pageInfo(page, limit, total) });
}));

router.post('/posts/:id/comments', protect, asyncHandler(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) throw new ApiError(400, 'Comment cannot be empty.');
  if (body.length > 2000) throw new ApiError(400, 'Comment is too long (max 2000 characters).');
  const post = await Post.findOne({ _id: req.params.id, status: 'PUBLISHED' }).select('title slug author');
  if (!post) throw new ApiError(404, 'Article not found.');

  let parent = null, root = null;
  if (req.body.parent) {
    parent = await Comment.findOne({ _id: req.body.parent, post: post._id, status: { $ne: 'removed' } });
    if (!parent) throw new ApiError(404, 'The comment you are replying to no longer exists.');
    root = parent.root || parent._id;
  }
  const mod = await ai.moderate(body); // AI moderation
  const comment = await Comment.create({
    post: post._id, author: req.user._id, body, parent: parent?._id || null, root,
    status: mod.flagged ? 'flagged' : 'visible', flagReason: mod.flagged ? mod.reason : undefined,
  });
  await comment.populate('author', 'name avatar role');

  if (!mod.flagged) {
    await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
    getIO()?.to(`post:${post._id}`).emit('comment:new', comment); // live updates
    if (!post.author.equals(req.user._id)) await notify(post.author, 'comment', `${req.user.name} commented on "${post.title}".`, `/blog/${post.slug}`);
    if (parent && !parent.author.equals(req.user._id)) await notify(parent.author, 'reply', `${req.user.name} replied to your comment.`, `/blog/${post.slug}`);
  }
  res.status(201).json({ success: true, data: comment, moderated: mod.flagged, message: mod.flagged ? 'Your comment is awaiting moderation.' : undefined });
}));

router.put('/comments/:id', protect, asyncHandler(async (req, res) => {
  const c = await Comment.findById(req.params.id);
  if (!c || c.status === 'removed') throw new ApiError(404, 'Comment not found.');
  if (!c.author.equals(req.user._id)) throw new ApiError(403, 'You can only edit your own comments.');
  const body = String(req.body.body || '').trim();
  if (!body) throw new ApiError(400, 'Comment cannot be empty.');
  c.body = body; c.edited = true; await c.save();
  res.json({ success: true, data: c });
}));

router.delete('/comments/:id', protect, asyncHandler(async (req, res) => {
  const c = await Comment.findById(req.params.id);
  if (!c || c.status === 'removed') throw new ApiError(404, 'Comment not found.');
  if (!c.author.equals(req.user._id) && !STAFF.includes(req.user.role)) throw new ApiError(403, 'You are not authorized to perform this action.');
  if (c.status === 'visible') await Post.updateOne({ _id: c.post }, { $inc: { commentCount: -1 } });
  c.status = 'removed'; c.body = '[deleted]'; await c.save(); // soft delete keeps the reply thread intact
  res.json({ success: true });
}));

export default router;
