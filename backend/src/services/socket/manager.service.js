const { Server } = require('socket.io');

let io = null;
let connectedUsers = new Map(); // Track connected users: socketId -> userId

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
      connectedUsers.set(socket.id, userId);
      console.log(`👤 User ${userId} joined room (${getConnectedUsersCount()} users online)`);
    });

    socket.on('disconnect', () => {
      const userId = connectedUsers.get(socket.id);
      connectedUsers.delete(socket.id);
      console.log(`🔌 Socket disconnected: ${socket.id} (user: ${userId}, ${getConnectedUsersCount()} users online)`);
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

/**
 * Broadcast event to ALL connected users
 */
const broadcastToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
    return getConnectedUsersCount();
  }
  return 0;
};

/**
 * Get count of connected users
 */
const getConnectedUsersCount = () => {
  return connectedUsers.size;
};

/**
 * Get list of connected user IDs
 */
const getConnectedUserIds = () => {
  return [...new Set(connectedUsers.values())];
};

/**
 * Get socket manager object with all methods
 */
const getSocketManager = () => ({
  emitToUser,
  broadcastToAll,
  getIO,
  getConnectedUsersCount,
  getConnectedUserIds,
});

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  broadcastToAll,
  getConnectedUsersCount,
  getConnectedUserIds,
  getSocketManager,
};
