import { Router } from 'express';
import { Post } from '../models.js';
import { protect, requireRole, AUTHORS } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/helpers.js';
import { ai } from '../services/ai.js';

const router = Router();
router.use(protect, requireRole(...AUTHORS));

// AI never saves or publishes anything: it only returns suggestions that the user must accept.
const text = (req) => {
  const t = String(req.body.text || '').trim();
  if (t.length < 20) throw new ApiError(400, 'Write a little more content first (at least 20 characters).');
  return t.slice(0, 12000);
};
router.post('/summarize', asyncHandler(async (req, res) => res.json({ success: true, data: await ai.summarize(text(req)) })));
router.post('/title', asyncHandler(async (req, res) => res.json({ success: true, data: await ai.titles(text(req)) })));
router.post('/tags', asyncHandler(async (req, res) => res.json({ success: true, data: await ai.tags(text(req)) })));
router.post('/seo', asyncHandler(async (req, res) => res.json({ success: true, data: await ai.seo(text(req)) })));
router.post('/improve', asyncHandler(async (req, res) => {
  const mode = ['clarity', 'professional', 'concise', 'grammar', 'simple'].includes(req.body.mode) ? req.body.mode : 'clarity';
  res.json({ success: true, data: await ai.improve(text(req), mode) });
}));
router.post('/translate', asyncHandler(async (req, res) => {
  const lang = { ta: 'Tamil', hi: 'Hindi', en: 'English' }[req.body.lang];
  if (!lang) throw new ApiError(400, 'Unsupported language.');
  res.json({ success: true, data: await ai.translate(text(req), lang) });
}));
router.post('/moderate', asyncHandler(async (req, res) => res.json({ success: true, data: await ai.moderate(String(req.body.text || '')) })));
router.post('/related', asyncHandler(async (req, res) => {
  const tags = await ai.tags(text(req));
  const data = await Post.find({ status: 'PUBLISHED', tags: { $in: tags } }).select('title slug tags').limit(5).lean();
  res.json({ success: true, data, tags });
}));

export default router;
