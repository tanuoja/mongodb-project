import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';
import { User } from '../models.js';
import { protect } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/helpers.js';

const router = Router();
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const signAccess = (u) => jwt.sign({ sub: u.id, role: u.role }, config.jwtSecret, { expiresIn: '15m' });
const signRefresh = (u, remember) => jwt.sign({ sub: u.id, rem: !!remember }, config.jwtRefreshSecret, { expiresIn: remember ? '7d' : '1d' });
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

export const userJSON = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar, bio: u.bio, social: u.social,
  language: u.language, emailVerified: u.emailVerified, createdAt: u.createdAt,
  bookmarks: u.bookmarks.map(String), following: u.following.map(String),
  followingCategories: u.followingCategories.map(String), followingTags: u.followingTags,
});

async function startSession(res, user, remember) {
  const refresh = signRefresh(user, remember);
  await User.updateOne({ _id: user._id }, { $push: { refreshTokens: { $each: [sha(refresh)], $slice: -5 } } });
  res.cookie('refresh', refresh, {
    httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/api/auth',
    ...(remember ? { maxAge: 7 * 864e5 } : {}),
  });
  return signAccess(user);
}

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, confirmPassword, avatar } = req.body;
  if (!name?.trim()) throw new ApiError(400, 'Name is required.');
  if (!emailOk(email)) throw new ApiError(400, 'Please enter a valid email address.');
  if (!password || password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters.');
  if (password !== confirmPassword) throw new ApiError(400, 'Passwords do not match.');
  if (await User.exists({ email: email.toLowerCase() })) throw new ApiError(409, 'An account with this email already exists.');

  const verifyToken = crypto.randomBytes(24).toString('hex');
  const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), avatar, verifyToken: sha(verifyToken) });
  // Email verification architecture: plug a mailer here. In development we print the link.
  console.log(`📧 Verify link for ${email}: ${config.clientUrl}/verify/${verifyToken}`);
  const token = await startSession(res, user, true);
  res.status(201).json({ success: true, token, user: userJSON(user) });
}));

router.get('/verify/:token', asyncHandler(async (req, res) => {
  const user = await User.findOne({ verifyToken: sha(req.params.token) }).select('+verifyToken');
  if (!user) throw new ApiError(400, 'This verification link is invalid.');
  user.emailVerified = true; user.verifyToken = undefined; await user.save();
  res.json({ success: true, message: 'Email verified!' });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, remember } = req.body;
  if (!emailOk(email) || !password) throw new ApiError(400, 'Please enter your email and password.');
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password))) throw new ApiError(401, 'Incorrect email or password.');
  if (user.status !== 'active') throw new ApiError(403, 'Your account has been suspended.');
  const token = await startSession(res, user, remember);
  res.json({ success: true, token, user: userJSON(user) });
}));

// Rotates the refresh token and returns a new access token (called on page load and on 401)
router.post('/refresh', asyncHandler(async (req, res) => {
  const old = req.cookies.refresh;
  if (!old) throw new ApiError(401, 'Not signed in.');
  let payload;
  try { payload = jwt.verify(old, config.jwtRefreshSecret); } catch { throw new ApiError(401, 'Session expired.'); }
  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || user.status !== 'active' || !user.refreshTokens.includes(sha(old))) throw new ApiError(401, 'Session expired.');
  user.refreshTokens = user.refreshTokens.filter((t) => t !== sha(old));
  await user.save();
  const token = await startSession(res, user, payload.rem);
  res.json({ success: true, token, user: userJSON(user) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const old = req.cookies.refresh;
  if (old) await User.updateOne({ refreshTokens: sha(old) }, { $pull: { refreshTokens: sha(old) } });
  res.clearCookie('refresh', { path: '/api/auth' });
  res.json({ success: true });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (user) {
    const t = crypto.randomBytes(24).toString('hex');
    user.resetToken = sha(t); user.resetExpires = new Date(Date.now() + 3600e3); await user.save();
    console.log(`📧 Password reset link for ${user.email}: ${config.clientUrl}/reset-password/${t}`);
  }
  res.json({ success: true, message: 'If that email exists, a reset link has been sent.' }); // same answer either way
}));

router.post('/reset-password/:token', asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters.');
  const user = await User.findOne({ resetToken: sha(req.params.token), resetExpires: { $gt: new Date() } }).select('+resetToken +resetExpires +refreshTokens');
  if (!user) throw new ApiError(400, 'This reset link is invalid or has expired.');
  user.password = await bcrypt.hash(password, 12);
  user.resetToken = undefined; user.resetExpires = undefined; user.refreshTokens = [];
  await user.save();
  res.json({ success: true, message: 'Password updated. You can log in now.' });
}));

router.get('/me', protect, (req, res) => res.json({ success: true, user: userJSON(req.user) }));

router.put('/me', protect, asyncHandler(async (req, res) => {
  const { name, bio, avatar, social, language } = req.body;
  if (name !== undefined) { if (!name.trim()) throw new ApiError(400, 'Name cannot be empty.'); req.user.name = name; }
  if (bio !== undefined) req.user.bio = bio;
  if (avatar !== undefined) req.user.avatar = avatar;
  if (social) req.user.social = { twitter: social.twitter, linkedin: social.linkedin, website: social.website };
  if (language) req.user.language = language;
  await req.user.save();
  res.json({ success: true, user: userJSON(req.user) });
}));

router.put('/password', protect, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password +refreshTokens');
  if (!(await bcrypt.compare(currentPassword || '', user.password))) throw new ApiError(400, 'Current password is incorrect.');
  if (!newPassword || newPassword.length < 8) throw new ApiError(400, 'New password must be at least 8 characters.');
  user.password = await bcrypt.hash(newPassword, 12); user.refreshTokens = []; await user.save();
  res.json({ success: true, message: 'Password changed.' });
}));

export default router;
