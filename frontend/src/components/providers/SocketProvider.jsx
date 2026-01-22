import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { connectSocket, disconnectSocket, getSocket } from '../../services/socket';

// Pages that require authentication (socket should connect on these)
const AUTH_PAGES = [
  '/dashboard',
  '/bots',
  '/contacts',
  '/settings',
  '/whatsapp',
  '/templates',
  '/admin',
  '/notifications',
  '/developers',
  '/clients'
];

export default function SocketProvider({ children }) {
  const location = useLocation();
  const { user, fetchMe } = useAuthStore();
  
  useEffect(() => {
    // Check if current page requires auth
    const requiresAuth = AUTH_PAGES.some(page => location.pathname.startsWith(page));
    
    if (!requiresAuth) {
      return;
    }
    
    // Try to connect socket when user is on auth page
    const initSocket = async () => {
      try {
        // If user not loaded yet, try to fetch
        let currentUser = user;
        if (!currentUser?.id) {
          const userData = await fetchMe();
          currentUser = userData?.user;
        }
        
        if (currentUser?.id) {
          const existingSocket = getSocket();
          if (!existingSocket?.connected) {
            console.log('🔌 SocketProvider: Connecting socket for user', currentUser.id);
            connectSocket(currentUser.id);
          }
        }
      } catch (err) {
        // User not logged in, ignore
        console.log('🔌 SocketProvider: User not authenticated');
      }
    };
    
    initSocket();
    
    // Don't disconnect on unmount - let it persist across pages
  }, [location.pathname, user?.id]);
  
  return children;
}
