import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 8000,
});

// Request interceptor injecting JWT bearer token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('kisanflow_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for centralized error routing
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('kisanflow_token');
      localStorage.removeItem('kisanflow_user');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

// Helper to extract clean error message from backend response
const extractErrorMessage = (err, defaultMsg) => {
  return err.response?.data?.error || err.response?.data?.message || err.message || defaultMsg;
};

// 1. Auth Service
export const authService = {
  async login(phone, password) {
    try {
      const response = await apiClient.post('/auth/login', { phone, password });
      if (response.data?.success) {
        const { token, user } = response.data.data;
        localStorage.setItem('kisanflow_token', token);
        localStorage.setItem('kisanflow_user', JSON.stringify(user));
        return response.data;
      }
      throw new Error(response.data?.error || 'Login failed');
    } catch (err) {
      throw extractErrorMessage(err, 'Invalid credentials');
    }
  },

  getCurrentUser() {
    try {
      const user = localStorage.getItem('kisanflow_user');
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem('kisanflow_token');
    localStorage.removeItem('kisanflow_user');
  },
};

// 2. Officer Service
export const officerService = {
  async lookupBooking(query) {
    const cleanQuery = (query || '').trim();
    try {
      const response = await apiClient.get(`/officer/booking/lookup?query=${encodeURIComponent(cleanQuery)}`);
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Booking lookup failed');
    } catch (err) {
      throw extractErrorMessage(err, 'No booking found matching lookup criteria');
    }
  },

  async recordProcurement({ booking_id, weight_kg, grade }) {
    try {
      const response = await apiClient.post('/procurements', {
        booking_id,
        weight_kg: parseFloat(weight_kg),
        grade,
      });
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Procurement recording failed');
    } catch (err) {
      throw extractErrorMessage(err, 'Failed to record procurement');
    }
  },

  async getMspRate(crop, grade, state) {
    try {
      const params = new URLSearchParams();
      if (crop) params.append('crop', crop);
      if (grade) params.append('grade', grade);
      if (state) params.append('state', state);

      const response = await apiClient.get(`/msp/rate?${params.toString()}`);
      if (response.data?.success) {
        return response.data.data;
      }
      return null;
    } catch {
      return null;
    }
  },
};

// 3. Queue Service
export const queueService = {
  async arrive(booking_id) {
    try {
      const response = await apiClient.post('/queue/arrive', { booking_id });
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Arrival check-in failed');
    } catch (err) {
      throw extractErrorMessage(err, 'Failed to mark arrival');
    }
  },

  async startProcessing(bookingId) {
    try {
      const response = await apiClient.post(`/queue/${bookingId}/start`);
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Failed to start processing');
    } catch (err) {
      throw extractErrorMessage(err, 'Failed to start processing');
    }
  },

  async getQueueStatus(bookingId) {
    try {
      const response = await apiClient.get(`/queue/${bookingId}`);
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Failed to fetch queue status');
    } catch (err) {
      throw extractErrorMessage(err, 'Failed to fetch queue status');
    }
  },

  async getActiveQueue(centreIdOrOptions, maybeDate, maybeSlotId, maybeStatus) {
    try {
      let centreId = centreIdOrOptions;
      let date = maybeDate;
      let slotId = maybeSlotId;
      let status = maybeStatus;

      if (centreIdOrOptions && typeof centreIdOrOptions === 'object') {
        centreId = centreIdOrOptions.centreId;
        date = centreIdOrOptions.date;
        slotId = centreIdOrOptions.slotId;
        status = centreIdOrOptions.status;
      }

      const params = new URLSearchParams();
      if (centreId) params.append('centreId', centreId);
      if (date && date !== 'ALL') params.append('date', date);
      if (slotId && slotId !== 'ALL') params.append('slotId', slotId);
      if (status) params.append('status', status);
      const queryString = params.toString();
      const url = queryString ? `/queue/active?${queryString}` : '/queue/active';
      const response = await apiClient.get(url);
      if (response.data?.success) {
        return response.data.data;
      }
      return [];
    } catch (err) {
      console.warn('Failed to fetch active queue:', err);
      return [];
    }
  },
};

// 4. Payment Service
export const paymentService = {
  async getPayment(bookingId) {
    try {
      const response = await apiClient.get(`/payments/${bookingId}`);
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Failed to fetch payment details');
    } catch (err) {
      throw extractErrorMessage(err, 'Failed to fetch payment details');
    }
  },

  async updateStatus(paymentId, status) {
    try {
      const response = await apiClient.patch(`/payments/${paymentId}/status`, { status });
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Failed to update payment status');
    } catch (err) {
      throw extractErrorMessage(err, 'Failed to update payment status');
    }
  },
};

// In-flight deduplication promise for getDisputes
let inFlightDisputesPromise = null;

// 5. Admin Service
export const adminService = {
  async getOverview(date) {
    try {
      const url = date ? `/admin/overview?date=${encodeURIComponent(date)}` : '/admin/overview';
      const response = await apiClient.get(url);
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Failed to fetch admin overview');
    } catch (err) {
      throw extractErrorMessage(err, 'Failed to fetch admin overview');
    }
  },

  async getDisputes() {
    if (inFlightDisputesPromise) {
      return inFlightDisputesPromise;
    }
    const currentPromise = (async () => {
      try {
        const response = await apiClient.get('/admin/disputes');
        if (response.data?.success) {
          return response.data.data;
        }
        throw new Error(response.data?.error || 'Failed to fetch disputes');
      } catch (err) {
        throw extractErrorMessage(err, 'Failed to fetch disputes');
      } finally {
        if (inFlightDisputesPromise === currentPromise) {
          inFlightDisputesPromise = null;
        }
      }
    })();
    inFlightDisputesPromise = currentPromise;
    return inFlightDisputesPromise;
  },

  async resolveDispute(id) {
    try {
      const response = await apiClient.patch(`/admin/disputes/${id}/resolve`);
      if (response.data?.success) {
        inFlightDisputesPromise = null;
        return response.data.data;
      }
      throw new Error(response.data?.error || 'Failed to resolve dispute');
    } catch (err) {
      throw extractErrorMessage(err, 'Failed to resolve dispute');
    }
  },
};
