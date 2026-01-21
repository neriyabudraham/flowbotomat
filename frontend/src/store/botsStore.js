import { create } from 'zustand';
import api from '../services/api';

const useBotsStore = create((set, get) => ({
  bots: [],
  currentBot: null,
  isLoading: false,
  error: null,

  fetchBots: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/bots');
      set({ bots: data.bots, isLoading: false });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchBot: async (botId) => {
    set({ isLoading: true });
    try {
      const { data } = await api.get(`/bots/${botId}`);
      set({ currentBot: data.bot, isLoading: false });
      return data.bot;
    } catch (err) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  createBot: async (name, description) => {
    try {
      const { data } = await api.post('/bots', { name, description });
      set({ bots: [data.bot, ...get().bots] });
      return data.bot;
    } catch (err) {
      throw err;
    }
  },

  updateBot: async (botId, updates) => {
    try {
      const { data } = await api.patch(`/bots/${botId}`, updates);
      set({ 
        bots: get().bots.map(b => b.id === botId ? data.bot : b),
        currentBot: data.bot,
      });
      return data.bot;
    } catch (err) {
      throw err;
    }
  },

  saveFlow: async (botId, flowData) => {
    try {
      const { data } = await api.put(`/bots/${botId}/flow`, { flow_data: flowData });
      set({ currentBot: data.bot });
      return data.bot;
    } catch (err) {
      throw err;
    }
  },

  deleteBot: async (botId) => {
    try {
      await api.delete(`/bots/${botId}`);
      set({ bots: get().bots.filter(b => b.id !== botId) });
    } catch (err) {
      throw err;
    }
  },

  clearCurrentBot: () => set({ currentBot: null }),
}));

export default useBotsStore;
