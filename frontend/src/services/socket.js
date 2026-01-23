import { io } from 'socket.io-client';

let socket = null;
let alertCallbacks = [];
let messageCallbacks = [];

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
  
  // USE onAny to catch ALL events - guaranteed to work!
  socket.onAny((eventName, ...args) => {
    // Handle new_message
    if (eventName === 'new_message' && args[0]) {
      console.log('📩 [Socket] New incoming message:', args[0].message?.id);
      messageCallbacks.forEach(cb => {
        try { cb('new_message', args[0]); } catch (e) { console.error(e); }
      });
    }
    
    // Handle outgoing_message (bot messages)
    if (eventName === 'outgoing_message' && args[0]) {
      console.log('📤 [Socket] New outgoing message:', args[0].message?.id, args[0].message?.message_type);
      messageCallbacks.forEach(cb => {
        try { cb('outgoing_message', args[0]); } catch (e) { console.error(e); }
      });
    }
    
    // Handle message_reaction
    if (eventName === 'message_reaction' && args[0]) {
      console.log('👍 [Socket] Reaction:', args[0].messageId, args[0].reaction);
      messageCallbacks.forEach(cb => {
        try { cb('message_reaction', args[0]); } catch (e) { console.error(e); }
      });
    }
    
    // Handle system_alert
    if (eventName === 'system_alert' && args[0]) {
      console.log('📢 ALERT! Notifying', alertCallbacks.length, 'listeners');
      alertCallbacks.forEach(cb => {
        try { cb(args[0]); } catch (e) { console.error(e); }
      });
    }
    
    // Handle system_update
    if (eventName === 'system_update' && args[0]) {
      console.log('🔄 UPDATE! Notifying', alertCallbacks.length, 'listeners');
      alertCallbacks.forEach(cb => {
        try { cb({ ...args[0], isUpdate: true }); } catch (e) { console.error(e); }
      });
    }
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

// Register callback for messages (new_message, outgoing_message, message_reaction)
export function onMessage(callback) {
  messageCallbacks.push(callback);
  console.log('💬 Message listener registered, total:', messageCallbacks.length);
  
  // Return unsubscribe function
  return () => {
    messageCallbacks = messageCallbacks.filter(cb => cb !== callback);
    console.log('💬 Message listener removed, total:', messageCallbacks.length);
  };
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  alertCallbacks = [];
  messageCallbacks = [];
}
