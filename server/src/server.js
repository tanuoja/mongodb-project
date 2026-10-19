import http from 'http';
import mongoose from 'mongoose';
import { config } from './config.js';
import app from './app.js';
import { initSocket } from './socket.js';
import { startScheduler } from './jobs.js';

try {
  await mongoose.connect(config.mongoUri);
  console.log('✅ MongoDB connected');
} catch (e) {
  console.error('❌ Could not connect to MongoDB. Is it running? ->', config.mongoUri);
  process.exit(1);
}
const server = http.createServer(app);
initSocket(server);
startScheduler();
server.listen(config.port, () => console.log(`🚀 ContentHub API running on http://localhost:${config.port}`));
