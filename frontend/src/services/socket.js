import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(userId) {
  if (socket?.connected) return socket;
  
  const url = import.meta.env.VITE_API_URL?.replace('/api', '') || '';
  
  socket = io(url, {
    transports: ['websocket', 'polling'],
  });
  
  socket.on('connect', () => {
    console.log('🔌 Socket connected');
    socket.emit('join_room', userId);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected');
  });
  
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
