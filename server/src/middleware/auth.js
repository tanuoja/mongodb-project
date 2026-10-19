import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models.js';
import { ApiError, asyncHandler } from '../utils/helpers.js';

const tokenFrom = (req) => (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;

export const protect = asyncHandler(async (req, res, next) => {
  const token = tokenFrom(req);
  if (!token) throw new ApiError(401, 'Please log in to continue.');
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); } catch { throw new ApiError(401, 'Your session has expired. Please log in again.'); }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') throw new ApiError(401, 'This account is not available.');
  req.user = user;
  next();
});

// Attaches req.user when a valid token exists, but never blocks guests.
export const optionalAuth = async (req, res, next) => {
  try {
    const token = tokenFrom(req);
    if (token) req.user = await User.findById(jwt.verify(token, config.jwtSecret).sub);
  } catch { /* ignore */ }
  next();
};

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(new ApiError(403, 'You are not authorized to perform this action.'));

export const AUTHORS = ['author', 'editor', 'admin'];
export const STAFF = ['editor', 'admin'];
