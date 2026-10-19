import cron from 'node-cron';
import { Post } from './models.js';
import { publishPost } from './utils/helpers.js';

// Runs every minute and publishes any SCHEDULED post whose time has arrived.
export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const due = await Post.find({ status: 'SCHEDULED', scheduledAt: { $lte: new Date() } });
      for (const post of due) { await publishPost(post); console.log(`⏰ Auto-published: ${post.title}`); }
    } catch (e) { console.error('Scheduler error', e.message); }
  });
}
