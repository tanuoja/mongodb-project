import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const oid = (ref, extra = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra });

export const ROLES = ['reader', 'author', 'editor', 'admin'];
export const STATUSES = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];
export const REACTIONS = ['like', 'helpful', 'interesting', 'informative', 'surprising'];

/* ---------- USER: bookmarks, follows and history are EMBEDDED (NoSQL style) ---------- */
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'reader', index: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  avatar: String,
  bio: { type: String, maxlength: 500, default: '' },
  social: { twitter: String, linkedin: String, website: String },
  language: { type: String, default: 'en' },
  emailVerified: { type: Boolean, default: false },
  verifyToken: { type: String, select: false },
  resetToken: { type: String, select: false },
  resetExpires: { type: Date, select: false },
  refreshTokens: { type: [String], select: false, default: [] },
  bookmarks: [oid('Post')],
  following: [oid('User')],
  followingCategories: [oid('Category')],
  followingTags: [String],
  history: [{ _id: false, post: oid('Post'), at: { type: Date, default: Date.now } }],
  warnings: { type: Number, default: 0 },
}, { timestamps: true });
userSchema.index({ following: 1 });

/* ---------- POST: versions, translations, reactions are EMBEDDED sub-documents ---------- */
const postSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true },
  summary: { type: String, default: '', maxlength: 500 },
  content: { type: String, default: '' }, // Markdown
  coverImage: String,
  author: oid('User', { required: true }),
  category: oid('Category'),
  tags: [{ type: String, lowercase: true, trim: true }],
  language: { type: String, default: 'en' },
  status: { type: String, enum: STATUSES, default: 'DRAFT' },
  featured: { type: Boolean, default: false },
  scheduledAt: Date,
  publishedAt: Date,
  rejectionFeedback: String,
  seo: { title: String, description: String, keywords: [String], canonicalUrl: String, ogTitle: String, ogDescription: String, ogImage: String },
  translations: [{ _id: false, lang: String, title: String, summary: String, content: String }],
  reactions: [{ _id: false, user: oid('User'), type: { type: String, enum: REACTIONS } }],
  reactionCounts: { type: Object, default: () => ({ like: 0, helpful: 0, interesting: 0, informative: 0, surprising: 0 }) },
  reactionTotal: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  bookmarkCount: { type: Number, default: 0 },
  readingTime: { type: Number, default: 1 },
  versions: [{
    versionNumber: Number, title: String, content: String,
    editedBy: oid('User'), changeNote: String, at: { type: Date, default: Date.now },
  }],
}, { timestamps: true, minimize: false });
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ category: 1, status: 1 });
postSchema.index({ author: 1, status: 1 });
postSchema.index({ status: 1, scheduledAt: 1 });

const categorySchema = new Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  parent: oid('Category', { default: null }),
}, { timestamps: true });

const commentSchema = new Schema({
  post: oid('Post', { required: true, index: true }),
  author: oid('User', { required: true }),
  body: { type: String, required: true, maxlength: 2000 },
  parent: oid('Comment', { default: null }),
  root: oid('Comment', { default: null, index: true }),
  status: { type: String, enum: ['visible', 'flagged', 'removed'], default: 'visible' },
  flagReason: String,
  edited: { type: Boolean, default: false },
}, { timestamps: true });
commentSchema.index({ post: 1, parent: 1, createdAt: -1 });

const notificationSchema = new Schema({
  user: oid('User', { required: true, index: true }),
  type: String, message: String, link: String,
  read: { type: Boolean, default: false },
}, { timestamps: true });

const reportSchema = new Schema({
  reporter: oid('User', { required: true }),
  targetType: { type: String, enum: ['article', 'comment', 'user'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, enum: ['Spam', 'Harassment', 'Misinformation', 'Copyright issue', 'Inappropriate content', 'Other'], required: true },
  details: { type: String, maxlength: 500 },
  status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open' },
  resolution: String,
}, { timestamps: true });

const auditSchema = new Schema({
  actor: oid('User'), action: String, targetType: String, targetId: String,
  details: String, ip: String, userAgent: String,
}, { timestamps: true });

const mediaSchema = new Schema({
  fileName: String, type: String, mimeType: String, size: Number, url: String,
  altText: { type: String, default: '' }, uploadedBy: oid('User'),
}, { timestamps: true });

// One document per post per day -> cheap daily/weekly/monthly charts
const analyticsSchema = new Schema({
  post: oid('Post', { required: true }),
  date: { type: Date, required: true },
  views: { type: Number, default: 0 },
  sources: { direct: { type: Number, default: 0 }, search: { type: Number, default: 0 }, social: { type: Number, default: 0 }, referral: { type: Number, default: 0 } },
});
analyticsSchema.index({ post: 1, date: 1 }, { unique: true });

const subscriberSchema = new Schema({ email: { type: String, unique: true, lowercase: true }, active: { type: Boolean, default: true } }, { timestamps: true });
const newsletterSchema = new Schema({
  subject: String, intro: String, posts: [oid('Post')],
  status: { type: String, enum: ['DRAFT', 'SCHEDULED', 'SENT'], default: 'DRAFT' },
  scheduledAt: Date, sentAt: Date, sentTo: Number, createdBy: oid('User'),
}, { timestamps: true });

export const User = model('User', userSchema);
export const Post = model('Post', postSchema);
export const Category = model('Category', categorySchema);
export const Comment = model('Comment', commentSchema);
export const Notification = model('Notification', notificationSchema);
export const Report = model('Report', reportSchema);
export const AuditLog = model('AuditLog', auditSchema);
export const Media = model('Media', mediaSchema);
export const Analytics = model('Analytics', analyticsSchema);
export const Subscriber = model('Subscriber', subscriberSchema);
export const Newsletter = model('Newsletter', newsletterSchema);
