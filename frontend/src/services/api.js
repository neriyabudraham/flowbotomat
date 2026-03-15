import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Track maintenance state
let maintenanceCallbacks = [];
let consecutiveNetworkErrors = 0;
const NETWORK_ERROR_THRESHOLD = 2; // Require 2 consecutive failures before showing overlay

export function onMaintenanceChange(callback) {
  maintenanceCallbacks.push(callback);
  return () => {
    maintenanceCallbacks = maintenanceCallbacks.filter(cb => cb !== callback);
  };
}

function notifyMaintenance(isDown, message = null) {
  maintenanceCallbacks.forEach(cb => cb(isDown, message));
}

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => {
    // API is back up - clear any maintenance state
    consecutiveNetworkErrors = 0;
    notifyMaintenance(false);
    return response;
  },
  async (error) => {
    // Handle 401 - unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Handle 503 - maintenance/backend down
    if (error.response?.status === 503) {
      const message = error.response?.data?.error || 'המערכת בתחזוקה';
      notifyMaintenance(true, message);
      return Promise.reject(error);
    }

    // Handle network errors (backend completely down)
    // Require multiple consecutive failures to avoid false positives from transient errors
    if (!error.response && (error.code === 'ECONNABORTED' || error.message?.includes('Network Error'))) {
      consecutiveNetworkErrors++;
      if (consecutiveNetworkErrors >= NETWORK_ERROR_THRESHOLD) {
        notifyMaintenance(true, 'אין חיבור לשרת, מנסה להתחבר מחדש...');
      }
      return Promise.reject(error);
    }

    // Any successful response (even 4xx) resets the error counter
    consecutiveNetworkErrors = 0;
    return Promise.reject(error);
  }
);

export default api;
