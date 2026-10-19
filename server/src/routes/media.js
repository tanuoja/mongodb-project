import { Router } from 'express';
import multer from 'multer';
import { Media } from '../models.js';
import { protect, requireRole, AUTHORS, STAFF } from '../middleware/auth.js';
import { ApiError, asyncHandler, escapeRx, paging, pageInfo } from '../utils/helpers.js';
import { storage } from '../services/storage.js';

const router = Router();
const ALLOWED = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
  'video/mp4': 'video', 'video/webm': 'video', 'audio/mpeg': 'audio', 'audio/wav': 'audio', 'application/pdf': 'document',
};
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(new ApiError(400, 'This file type is not allowed.'))),
});

router.use(protect);

router.post('/', requireRole(...AUTHORS), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Please choose a file.');
  const url = await storage.save(req.file.buffer, req.file.originalname);
  const m = await Media.create({ fileName: req.file.originalname, type: ALLOWED[req.file.mimetype], mimeType: req.file.mimetype, size: req.file.size, url, altText: req.body.altText || '', uploadedBy: req.user._id });
  res.status(201).json({ success: true, data: m });
}));

// Any logged-in user may upload an avatar image (readers need one during registration/profile edit)
router.post('/avatar', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file || !req.file.mimetype.startsWith('image/')) throw new ApiError(400, 'Please choose an image.');
  res.status(201).json({ success: true, url: await storage.save(req.file.buffer, req.file.originalname) });
}));

router.get('/', requireRole(...AUTHORS), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req, 12, 48);
  const filter = STAFF.includes(req.user.role) ? {} : { uploadedBy: req.user._id };
  if (req.query.type) filter.type = String(req.query.type);
  if (req.query.q) filter.fileName = new RegExp(escapeRx(String(req.query.q)), 'i');
  const [data, total] = await Promise.all([Media.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('uploadedBy', 'name').lean(), Media.countDocuments(filter)]);
  res.json({ success: true, data, pagination: pageInfo(page, limit, total) });
}));

router.put('/:id', requireRole(...AUTHORS), asyncHandler(async (req, res) => {
  const m = await Media.findById(req.params.id);
  if (!m) throw new ApiError(404, 'File not found.');
  if (!STAFF.includes(req.user.role) && !m.uploadedBy.equals(req.user._id)) throw new ApiError(403, 'You are not authorized to perform this action.');
  m.altText = req.body.altText || ''; await m.save();
  res.json({ success: true, data: m });
}));

router.delete('/:id', requireRole(...AUTHORS), asyncHandler(async (req, res) => {
  const m = await Media.findById(req.params.id);
  if (!m) throw new ApiError(404, 'File not found.');
  if (!STAFF.includes(req.user.role) && !m.uploadedBy.equals(req.user._id)) throw new ApiError(403, 'You are not authorized to perform this action.');
  await storage.remove(m.url); await m.deleteOne();
  res.json({ success: true });
}));

export default router;
