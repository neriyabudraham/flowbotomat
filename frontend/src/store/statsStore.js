import { create } from 'zustand';
import api from '../services/api';

const useStatsStore = create((set) => ({
  stats: null,
  activity: [],
  isLoading: false,
  error: null,

  fetchDashboardStats: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get('/stats/dashboard');
      set({ 
        stats: data.stats, 
        activity: data.activity,
        isLoading: false 
      });
      return data;
    } catch (err) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },
}));

export default useStatsStore;
