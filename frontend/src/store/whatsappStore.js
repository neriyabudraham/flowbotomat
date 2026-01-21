import { create } from 'zustand';
import api from '../services/api';

const useWhatsappStore = create((set, get) => ({
  connection: null,
  qrCode: null,
  isLoading: false,
  error: null,
  existingSession: null, // { exists, sessionName, status, isConnected }

  checkExisting: async () => {
    try {
      const { data } = await api.get('/whatsapp/check-existing');
      set({ existingSession: data });
      return data;
    } catch (err) {
      set({ existingSession: { exists: false } });
      return { exists: false };
    }
  },

  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get('/whatsapp/status');
      set({ connection: data.connection, isLoading: false });
      return data;
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.error || 'שגיאה' });
      throw err;
    }
  },

  connectManaged: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/whatsapp/connect/managed');
      set({ connection: data.connection, isLoading: false });
      return data;
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.error || 'שגיאה' });
      throw err;
    }
  },

  connectExternal: async (baseUrl, apiKey, sessionName) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/whatsapp/connect/external', {
        baseUrl, apiKey, sessionName,
      });
      set({ connection: data.connection, isLoading: false });
      return data;
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.error || 'שגיאה' });
      throw err;
    }
  },

  fetchQR: async () => {
    set({ error: null });
    try {
      const { data } = await api.get('/whatsapp/qr');
      set({ qrCode: data.qr });
      return data;
    } catch (err) {
      set({ error: err.response?.data?.error || 'שגיאה בקבלת QR' });
      throw err;
    }
  },

  disconnect: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.delete('/whatsapp/disconnect');
      set({ connection: null, qrCode: null, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err.response?.data?.error || 'שגיאה' });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useWhatsappStore;
