import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(userId) {
  if (socket?.connected) return socket;
  
  // Connect to backend server (port 3749)
  const apiUrl = import.meta.env.VITE_API_URL || '/api';
  // Remove /api suffix and connect to base URL
  const baseUrl = apiUrl.replace('/api', '');
  
  console.log('🔌 Connecting socket to:', baseUrl);
  
  socket = io(baseUrl, {
    transports: ['websocket', 'polling'],
    path: '/socket.io',
  });
  
  socket.on('connect', () => {
    console.log('🔌 Socket connected! ID:', socket.id);
    console.log('🔌 Joining room for user:', userId);
    socket.emit('join_room', userId);
  });
  
  socket.on('connect_error', (err) => {
    console.error('🔌 Socket connection error:', err.message);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });
  
  socket.on('new_message', (data) => {
    console.log('🔌 Received new_message event:', data);
  });
  
  // Debug: listen for ALL events
  socket.onAny((eventName, ...args) => {
    console.log('🔌 Socket event received:', eventName, args);
  });
  
  return socket;
}

export function getSocket() {
  return socket;
}

export function isSocketConnected() {
  return socket?.connected || false;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
