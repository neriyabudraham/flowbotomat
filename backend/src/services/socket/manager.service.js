const { Server } = require('socket.io');

let io = null;

/**
 * Initialize Socket.io server
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.APP_URL || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    socket.on('join_room', (userId) => {
      socket.join(`user_${userId}`);
      console.log(`👤 User ${userId} joined room`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  console.log('🔌 Socket.io initialized');
  return io;
};

/**
 * Get Socket.io instance
 */
const getIO = () => io;

/**
 * Emit event to specific user
 */
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
};
