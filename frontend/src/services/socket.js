import { io } from 'socket.io-client';

let socket = null;
let alertCallbacks = [];

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
  
  // Handle system alerts - call all registered callbacks
  socket.on('system_alert', (data) => {
    console.log('📢 System alert received, notifying', alertCallbacks.length, 'listeners');
    alertCallbacks.forEach(cb => cb(data));
  });
  
  // Handle system update
  socket.on('system_update', (data) => {
    console.log('🔄 System update received, notifying', alertCallbacks.length, 'listeners');
    alertCallbacks.forEach(cb => cb({ ...data, isUpdate: true }));
  });
  
  return socket;
}

export function getSocket() {
  return socket;
}

export function isSocketConnected() {
  return socket?.connected || false;
}

// Register callback for alerts
export function onSystemAlert(callback) {
  alertCallbacks.push(callback);
  console.log('📢 Alert listener registered, total:', alertCallbacks.length);
  
  // Return unsubscribe function
  return () => {
    alertCallbacks = alertCallbacks.filter(cb => cb !== callback);
    console.log('📢 Alert listener removed, total:', alertCallbacks.length);
  };
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  alertCallbacks = [];
}
