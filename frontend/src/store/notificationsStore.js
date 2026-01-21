import { create } from 'zustand';
import api from '../services/api';

const useNotificationsStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  preferences: null,

  fetchNotifications: async (unreadOnly = false) => {
    try {
      set({ loading: true });
      const { data } = await api.get('/notifications', {
        params: { unread_only: unreadOnly }
      });
      set({ 
        notifications: data.notifications, 
        unreadCount: data.unread_count,
        loading: false 
      });
      return data;
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      set({ loading: false });
      return { notifications: [], unread_count: 0 };
    }
  },

  markAsRead: async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      set(state => ({
        notifications: state.notifications.map(n => 
          n.id === id ? { ...n, is_read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1)
      }));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  },

  markAllAsRead: async () => {
    try {
      await api.put('/notifications/read-all');
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, is_read: true })),
        unreadCount: 0
      }));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  },

  deleteNotification: async (id) => {
    try {
      await api.delete(`/notifications/${id}`);
      set(state => ({
        notifications: state.notifications.filter(n => n.id !== id),
        unreadCount: state.notifications.find(n => n.id === id && !n.is_read) 
          ? state.unreadCount - 1 
          : state.unreadCount
      }));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  },

  fetchPreferences: async () => {
    try {
      const { data } = await api.get('/notifications/preferences');
      set({ preferences: data });
      return data;
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
      return null;
    }
  },

  updatePreferences: async (prefs) => {
    try {
      await api.put('/notifications/preferences', prefs);
      set(state => ({ preferences: { ...state.preferences, ...prefs } }));
      return true;
    } catch (err) {
      console.error('Failed to update preferences:', err);
      return false;
    }
  },
}));

export default useNotificationsStore;
