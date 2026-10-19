import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

let io;
export const getIO = () => io;
const editing = new Map(); // postId -> Map(socketId -> name)

export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.clientUrl, credentials: true } });

  io.use((socket, next) => {
    try { socket.userId = jwt.verify(socket.handshake.auth?.token, config.jwtSecret).sub; } catch { /* guests allowed */ }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.userId) socket.join(`user:${socket.userId}`);
    socket.on('post:join', (id) => socket.join(`post:${id}`));
    socket.on('post:leave', (id) => socket.leave(`post:${id}`));

    // "Currently editing" presence indicator
    const broadcast = (postId) =>
      io.to(`edit:${postId}`).emit('editing:update', [...(editing.get(postId)?.values() || [])]);
    socket.on('editing:join', ({ postId, name }) => {
      socket.join(`edit:${postId}`);
      if (!editing.has(postId)) editing.set(postId, new Map());
      editing.get(postId).set(socket.id, name);
      socket.data.editingPost = postId;
      broadcast(postId);
    });
    const leaveEdit = () => {
      const id = socket.data.editingPost;
      if (id && editing.has(id)) { editing.get(id).delete(socket.id); broadcast(id); }
    };
    socket.on('editing:leave', leaveEdit);
    socket.on('disconnect', leaveEdit);
  });
  return io;
}
