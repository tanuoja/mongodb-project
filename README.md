# ContentHub — Intelligent Blog & CMS (React + Express + MongoDB)

A full publishing platform: roles (reader / author / editor / admin), editorial workflow
(DRAFT → PENDING_REVIEW → APPROVED → SCHEDULED/PUBLISHED), Markdown editor with live preview,
version history, comments with replies, reactions, bookmarks, follows, real-time notifications,
trending + recommendations, analytics dashboards, media library, AI assistant (offline mock or any
OpenAI-compatible API), dark mode, accessibility controls, multilingual UI (EN/TA/HI), PWA basics.

## 1. Install the prerequisites
- Node.js 18+ (https://nodejs.org)
- MongoDB 6+ — either
  - **Local:** install MongoDB Community Server and start it (`mongod`), or
  - **Cloud (easiest):** create a free cluster on MongoDB Atlas and copy its connection string.

## 2. Start the backend
```bash
cd server
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env  ->  MONGODB_URI (Atlas string if you use Atlas) and the two JWT secrets
npm run seed                # creates demo users, articles, comments, analytics
npm run dev                 # API on http://localhost:5000
```
You should see `✅ MongoDB connected` and `🚀 ContentHub API running`.

## 3. Start the frontend (new terminal)
```bash
cd client
npm install
npm run dev                 # opens http://localhost:5173
```

## 4. Log in (password for all: `Password@123`)
| Role | Email |
|---|---|
| Admin | admin@contenthub.dev |
| Editor | editor@contenthub.dev |
| Author | author@contenthub.dev (or john@contenthub.dev) |
| Reader | reader@contenthub.dev |

## 5. Take the tour
1. **Reader:** Home → open "AI in Healthcare" → watch the progress bar, react, comment, reply, bookmark, follow the author, click 🔊 Listen.
2. **Author:** Author dashboard → New article → use the toolbar, Edit/Preview tabs, drag an image in, click ✨ AI Assistant → Submit for review.
3. **Editor:** Review queue → open the article → Approve (or Reject with feedback) → Publish now or Schedule a minute ahead (the cron job publishes it automatically).
4. **Admin:** /admin → analytics, users & roles, reports queue, audit logs, newsletters.
5. Open two browsers (author + reader): the notification bell updates instantly via Socket.IO.

## Folder map
```
server/src
  models.js            all MongoDB collections (Mongoose schemas)
  app.js / server.js   Express setup, security, route mounting, startup
  routes/              auth, posts, comments, me, community, admin, ai, media
  middleware/          auth (JWT + roles), security (NoSQL-injection filter, errors)
  services/            ai.js (provider abstraction), storage.js (local/S3 abstraction)
  jobs.js              cron: auto-publish scheduled posts
  socket.js            real-time notifications, live comments, "currently editing"
  seed.js              demo data
client/src
  api.js  hooks.js  markdown.js  context/AppContext.jsx
  components/          Navbar, Comments, ui (cards, charts, pagination, skeletons)
  pages/               Public, Article, Auth, Reader, Editor, Dashboards, Admin, Media
```

## Connect a real AI model
In `server/.env`: `AI_PROVIDER=openai`, `AI_API_KEY=...`, optionally `AI_BASE_URL` / `AI_MODEL`.
Keys stay on the server. AI only returns suggestions; nothing is saved or published until a human clicks Accept.

## Production notes
- Set strong `JWT_SECRET` / `JWT_REFRESH_SECRET`, `NODE_ENV=production`, and your real `CLIENT_URL`.
- `cd client && npm run build`, then serve `dist/` (Nginx/Netlify) and proxy `/api`, `/uploads`, `/socket.io` to the server.
- Swap `LocalStorage` in `services/storage.js` for S3/Cloudinary; add an email provider where the server `console.log`s links.

## Known limits / next steps
Real-time co-editing is presence-only ("currently editing"), not merged edits. Bookmark folders, push-notification
delivery, automated tests (Jest/Supertest/Vitest) and the E2E suite are not included yet.
