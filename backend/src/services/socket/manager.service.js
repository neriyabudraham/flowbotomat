const { Server } = require('socket.io');

let io = null;
let connectedUsers = new Map(); // Track connected users: socketId -> { userId, connectedAt }

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
      connectedUsers.set(socket.id, {
        userId,
        connectedAt: new Date()
      });
      console.log(`👤 User ${userId} joined room (${getConnectedUsersCount()} users online)`);
    });

    socket.on('disconnect', () => {
      const userData = connectedUsers.get(socket.id);
      connectedUsers.delete(socket.id);
      console.log(`🔌 Socket disconnected: ${socket.id} (user: ${userData?.userId}, ${getConnectedUsersCount()} users online)`);
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
    const count = getConnectedUsersCount();
    console.log(`📢 Broadcasting '${event}' to ${count} connected users:`, JSON.stringify(data).substring(0, 100));
    io.emit(event, data);
    return count;
  }
  console.log(`📢 Broadcast failed - no io instance`);
  return 0;
};

/**
 * Get count of connected users (unique)
 */
const getConnectedUsersCount = () => {
  const uniqueUsers = new Set();
  connectedUsers.forEach(data => uniqueUsers.add(data.userId));
  return uniqueUsers.size;
};

/**
 * Get list of connected user IDs (unique)
 */
const getConnectedUserIds = () => {
  const uniqueUsers = new Set();
  connectedUsers.forEach(data => uniqueUsers.add(data.userId));
  return [...uniqueUsers];
};

/**
 * Get detailed info about connected users
 */
const getConnectedUsersInfo = () => {
  const usersMap = new Map();
  connectedUsers.forEach((data, socketId) => {
    if (!usersMap.has(data.userId)) {
      usersMap.set(data.userId, {
        userId: data.userId,
        connectedAt: data.connectedAt,
        socketCount: 1
      });
    } else {
      const existing = usersMap.get(data.userId);
      existing.socketCount++;
      // Keep earliest connection time
      if (data.connectedAt < existing.connectedAt) {
        existing.connectedAt = data.connectedAt;
      }
    }
  });
  return [...usersMap.values()];
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
  getConnectedUsersInfo,
});

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  broadcastToAll,
  getConnectedUsersCount,
  getConnectedUserIds,
  getConnectedUsersInfo,
  getSocketManager,
};
