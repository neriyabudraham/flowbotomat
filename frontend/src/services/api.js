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

// Backoff retry for transient failures during deploys (502/503/504/network).
// Up to 4 retries with exponential delay (1s → 2s → 4s → 8s).
// GET / HEAD are always retried; mutating verbs are retried only when explicitly safe
// (config._retryable === true, or status is a clear gateway error like 502).
const RETRYABLE_STATUSES = [502, 503, 504];
const MAX_RETRIES = 4;

async function maybeRetry(error) {
  const cfg = error.config || {};
  const status = error.response?.status;
  const isNetwork = !error.response && (error.code === 'ECONNABORTED' || error.message?.includes('Network Error'));
  const isGatewayDown = status && RETRYABLE_STATUSES.includes(status);

  if (!isNetwork && !isGatewayDown) return null;

  const method = (cfg.method || 'get').toLowerCase();
  const safeMethod = method === 'get' || method === 'head';
  // Mutations: retry only on clear "gateway down" signals (502/503/504), NOT generic 5xx
  if (!safeMethod && !isGatewayDown) return null;

  cfg.__retryCount = (cfg.__retryCount || 0) + 1;
  if (cfg.__retryCount > MAX_RETRIES) return null;

  const delay = Math.min(1000 * 2 ** (cfg.__retryCount - 1), 8000);
  await new Promise(r => setTimeout(r, delay));
  return api(cfg);
}

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

    // Auto-retry transient failures (gateway down during deploy, network blips)
    const retried = await maybeRetry(error);
    if (retried) {
      consecutiveNetworkErrors = 0;
      notifyMaintenance(false);
      return retried;
    }

    // Handle 503 - maintenance/backend down (after retry exhausted)
    if (error.response?.status === 503) {
      const message = error.response?.data?.error || 'המערכת בתחזוקה';
      notifyMaintenance(true, message);
      return Promise.reject(error);
    }

    // Handle network errors (backend completely down)
    if (!error.response && (error.code === 'ECONNABORTED' || error.message?.includes('Network Error'))) {
      consecutiveNetworkErrors++;
      if (consecutiveNetworkErrors >= NETWORK_ERROR_THRESHOLD) {
        notifyMaintenance(true, 'אין חיבור לשרת, מנסה להתחבר מחדש...');
      }
      return Promise.reject(error);
    }

    consecutiveNetworkErrors = 0;
    return Promise.reject(error);
  }
);

export default api;
