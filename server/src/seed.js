// Fills the database with demo users, categories, articles and comments.  Run:  npm run seed
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { User, Post, Category, Comment, Analytics, Notification, Report, AuditLog, Media, Subscriber, Newsletter } from './models.js';
import { slugify, calcReadingTime } from './utils/helpers.js';

await mongoose.connect(config.mongoUri);
await Promise.all([User, Post, Category, Comment, Analytics, Notification, Report, AuditLog, Media, Subscriber, Newsletter].map((m) => m.deleteMany({})));

const password = await bcrypt.hash('Password@123', 10);
const mk = (name, email, role, bio = '') => ({ name, email, role, bio, password, emailVerified: true, avatar: `https://i.pravatar.cc/150?u=${email}` });
const [admin, editor, priya, john, reader] = await User.create([
  mk('Admin User', 'admin@contenthub.dev', 'admin', 'Runs ContentHub.'),
  mk('Esha Editor', 'editor@contenthub.dev', 'editor', 'Keeps the quality bar high.'),
  mk('Priya Sharma', 'author@contenthub.dev', 'author', 'Writes about AI, healthcare and engineering education.'),
  mk('John Carter', 'john@contenthub.dev', 'author', 'Full-stack developer and security enthusiast.'),
  mk('Riya Reader', 'reader@contenthub.dev', 'reader'),
]);

const parents = await Category.create([{ name: 'Technology', slug: 'technology' }, { name: 'Education', slug: 'education' }]);
const [tech, edu] = parents;
const kids = await Category.create([
  { name: 'Artificial Intelligence', slug: 'artificial-intelligence', parent: tech._id },
  { name: 'Web Development', slug: 'web-development', parent: tech._id },
  { name: 'Cybersecurity', slug: 'cybersecurity', parent: tech._id },
  { name: 'Programming', slug: 'programming', parent: tech._id },
  { name: 'Engineering', slug: 'engineering', parent: edu._id },
  { name: 'Research', slug: 'research', parent: edu._id },
  { name: 'Learning', slug: 'learning', parent: edu._id },
]);
const cat = Object.fromEntries(kids.map((c) => [c.slug, c._id]));

const body = (topic) => `## Why ${topic} matters

${topic} is changing how teams build, learn and ship. In this article we look at the big ideas, the practical trade-offs, and what you can try this week.

## The core idea

Start small. Pick one problem, measure it, and improve it step by step. **Consistency beats intensity** when you are learning something new.

> The best way to predict the future is to build it.

## A quick example

\`\`\`js
const learn = (topic) => practice(topic).then(reflect);
\`\`\`

### Key takeaways

- Understand the fundamentals before the tools
- Build small projects and share them
- Review your work with others

## Common mistakes

Many beginners try to learn everything at once. Instead, focus on one concept, apply it, and then move to the next. Over a few weeks the progress becomes obvious, and the topic starts to feel natural rather than overwhelming. Keep notes, ask questions, and revisit older material regularly.

## Final thoughts

Keep experimenting, stay curious and keep writing about what you learn.`;

const defs = [
  ['AI in Healthcare', priya, 'artificial-intelligence', ['ai', 'healthcare', 'machinelearning'], 12450, 1],
  ['The Future of Robotics', priya, 'engineering', ['robotics', 'ai', 'education'], 9230, 2],
  ['Java Programming for Beginners', john, 'programming', ['java', 'programming', 'education'], 8120, 3],
  ['Building Fast Apps with React', john, 'web-development', ['react', 'javascript', 'webdev'], 6400, 4],
  ['Cybersecurity Trends to Watch', john, 'cybersecurity', ['security', 'cybersecurity', 'ai'], 5100, 5],
  ['How Engineering Students Can Learn Faster', priya, 'learning', ['education', 'learning', 'engineering'], 4300, 6],
  ['Understanding MongoDB Schema Design', john, 'programming', ['mongodb', 'nosql', 'database'], 3900, 2],
  ['A Gentle Introduction to Machine Learning', priya, 'artificial-intelligence', ['machinelearning', 'ai', 'python'], 3500, 8],
  ['Research Writing Tips for Undergraduates', priya, 'research', ['research', 'writing', 'education'], 1800, 10],
  ['Web Accessibility Basics', john, 'web-development', ['accessibility', 'webdev', 'html'], 2200, 12],
];
const posts = [];
for (const [i, [title, author, c, tags, views, daysAgo]] of defs.entries()) {
  const content = body(title);
  const likes = Math.round(views / 60), counts = { like: Math.ceil(likes * 0.4), helpful: Math.ceil(likes * 0.25), interesting: Math.ceil(likes * 0.15), informative: Math.ceil(likes * 0.15), surprising: Math.ceil(likes * 0.05) };
  posts.push(await Post.create({
    title, slug: slugify(title), summary: `A practical look at ${title.toLowerCase()} and what it means for learners and builders.`, content, author: author._id, category: cat[c], tags,
    coverImage: `https://picsum.photos/seed/contenthub${i}/1200/600`, status: 'PUBLISHED', publishedAt: new Date(Date.now() - daysAgo * 864e5), featured: i === 0,
    views, shares: Math.round(views / 90), commentCount: 0, bookmarkCount: Math.round(views / 120), readingTime: calcReadingTime(content),
    reactionCounts: counts, reactionTotal: Object.values(counts).reduce((a, b) => a + b, 0),
    seo: { title, description: `Read about ${title}`, keywords: tags },
    versions: [{ versionNumber: 1, title, content, editedBy: author._id, changeNote: 'Initial draft' }],
  }));
}
// A post waiting for review, a draft and a rejected post so the workflow has data
await Post.create([
  { title: 'Quantum Computing in Plain English', slug: 'quantum-computing-in-plain-english', summary: 'Qubits explained without the maths.', content: body('Quantum computing'), author: priya._id, category: cat.research, tags: ['quantum', 'science'], status: 'PENDING_REVIEW', readingTime: 2, versions: [{ versionNumber: 1, title: 'Quantum Computing in Plain English', content: body('Quantum computing'), editedBy: priya._id, changeNote: 'Initial draft' }] },
  { title: 'My Draft About Docker', slug: 'my-draft-about-docker', summary: '', content: 'Work in progress...', author: john._id, category: cat.programming, tags: ['docker'], status: 'DRAFT', readingTime: 1, versions: [{ versionNumber: 1, title: 'My Draft About Docker', content: 'Work in progress...', editedBy: john._id, changeNote: 'Initial draft' }] },
  { title: 'Top 10 Tricks', slug: 'top-10-tricks', summary: 'Tricks.', content: 'Too short.', author: john._id, tags: ['misc'], status: 'REJECTED', rejectionFeedback: 'Please add examples and expand each trick.', readingTime: 1, versions: [{ versionNumber: 1, title: 'Top 10 Tricks', content: 'Too short.', editedBy: john._id, changeNote: 'Initial draft' }] },
]);

// Comments (with a nested reply) + 30 days of analytics
const c1 = await Comment.create({ post: posts[0]._id, author: reader._id, body: 'Great article! Very informative.' });
const c2 = await Comment.create({ post: posts[0]._id, author: priya._id, body: 'Thank you! Glad it helped.', parent: c1._id, root: c1._id });
await Comment.create({ post: posts[0]._id, author: john._id, body: 'I agree, the examples were clear.', parent: c2._id, root: c1._id });
await Comment.create({ post: posts[0]._id, author: reader._id, body: 'BUY CHEAP STUFF http://spam.example http://spam2.example', status: 'flagged', flagReason: 'Multiple links (possible spam)' });
await Post.updateOne({ _id: posts[0]._id }, { commentCount: 3 });

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const rows = [];
for (const p of posts) for (let d = 0; d < 30; d++) {
  const date = new Date(new Date(Date.now() - d * 864e5).toISOString().slice(0, 10));
  const v = rand(5, 60);
  rows.push({ post: p._id, date, views: v, sources: { direct: Math.round(v * 0.4), search: Math.round(v * 0.3), social: Math.round(v * 0.2), referral: Math.round(v * 0.1) } });
}
await Analytics.insertMany(rows);

reader.following = [priya._id]; reader.bookmarks = [posts[0]._id]; reader.history = [{ post: posts[1]._id }, { post: posts[2]._id }];
await reader.save();
await Subscriber.create([{ email: 'reader@contenthub.dev' }]);
await Notification.create({ user: reader._id, type: 'welcome', message: 'Welcome to ContentHub! Follow authors to get updates.', link: '/authors' });

console.log('🌱 Seeded! Log in with password "Password@123" using:');
console.log('   admin@contenthub.dev | editor@contenthub.dev | author@contenthub.dev | john@contenthub.dev | reader@contenthub.dev');
await mongoose.disconnect();
