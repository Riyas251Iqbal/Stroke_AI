/**
 * API Service Layer
 * Handles all HTTP requests to the Flask backend
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - Add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor - Handle auth errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// =====================================================
// AUTH API
// =====================================================

export const authAPI = {
    register: (userData) => api.post('/auth/register', userData),

    login: (credentials) => api.post('/auth/login', credentials),

    getProfile: () => api.get('/auth/profile'),

    verifyToken: () => api.get('/auth/verify'),

    changePassword: (passwords) => api.post('/auth/change-password', passwords),

    logout: () => api.post('/auth/logout'),
};

// =====================================================
// TRIAGE API
// =====================================================

export const triageAPI = {
    // Submit clinical data
    submitClinical: (clinicalData) =>
        api.post('/triage/submit-clinical', clinicalData),

    // Upload audio file
    uploadAudio: (formData) =>
        api.post('/triage/upload-audio', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),

    // Perform triage assessment
    assess: (data) =>
        api.post('/triage/assess', data),

    // Complete assessment (clinical + audio + result)
    completeAssessment: (formData) =>
        api.post('/triage/complete-assessment', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),

    // Get patient history
    getHistory: (params = {}) =>
        api.get('/triage/history', { params }),

    // Get specific result
    getResult: (resultId) =>
        api.get(`/triage/result/${resultId}`),

    // Get pending cases (doctor)
    getPendingCases: (params = {}) =>
        api.get('/triage/pending', { params }),

    // Add doctor review
    addReview: (reviewData) =>
        api.post('/triage/review', reviewData),

    // Request account deletion
    requestDeletion: (reason) =>
        api.post('/triage/request-deletion', { reason }),

    // Check deletion status
    getDeletionStatus: () =>
        api.get('/triage/deletion-status'),
};

// =====================================================
// ADMIN API
// =====================================================

export const adminAPI = {
    // Get system stats
    getStats: () => api.get('/admin/stats'),

    // Get all users
    getUsers: (params = {}) =>
        api.get('/admin/users', { params }),

    // Get user details
    getUserDetails: (userId) =>
        api.get(`/admin/users/${userId}`),

    // Deactivate user
    deactivateUser: (userId) =>
        api.post(`/admin/users/${userId}/deactivate`),

    // Activate user
    activateUser: (userId) =>
        api.post(`/admin/users/${userId}/activate`),

    // Get audit log
    getAuditLog: (params = {}) =>
        api.get('/admin/audit-log', { params }),

    // Get triage analytics
    getTriageAnalytics: (params = {}) =>
        api.get('/admin/triage-analytics', { params }),

    // Hospital management
    getHospitals: () => api.get('/admin/hospitals'),
    createHospital: (data) => api.post('/admin/hospitals', data),
    updateHospital: (id, data) => api.put(`/admin/hospitals/${id}`, data),
    deleteHospital: (id) => api.delete(`/admin/hospitals/${id}`),

    // Deletion requests
    getDeletionRequests: (status = 'pending') =>
        api.get('/admin/deletion-requests', { params: { status } }),
    approveDeletion: (id) =>
        api.post(`/admin/deletion-requests/${id}/approve`),
    rejectDeletion: (id, note = '') =>
        api.post(`/admin/deletion-requests/${id}/reject`, { note }),
};

// =====================================================
// HOSPITAL API (Public)
// =====================================================

export const hospitalAPI = {
    // Get active hospitals
    getAll: (location) => api.get('/hospitals', { params: location ? { location } : {} }),

    // Get distinct locations
    getLocations: () => api.get('/hospitals/locations'),

    // Get doctors at a hospital
    getDoctors: (hospitalId) => api.get(`/hospitals/${hospitalId}/doctors`),

    // Get nearby doctors by location
    getNearbyDoctors: (location) => api.get('/hospitals/nearby-doctors', { params: { location } }),
};

// =====================================================
// APPOINTMENT API
// =====================================================

export const appointmentAPI = {
    // Create appointment (doctor)
    create: (data) => api.post('/appointments', data),

    // List appointments
    list: (params = {}) => api.get('/appointments', { params }),

    // Update appointment (doctor)
    update: (id, data) => api.put(`/appointments/${id}`, data),

    // Cancel appointment
    cancel: (id) => api.post(`/appointments/${id}/cancel`),
};

// =====================================================
// HEALTH CHECK
// =====================================================

export const healthAPI = {
    check: () => api.get('/health'),
    getDisclaimer: () => axios.get(`${API_BASE_URL.replace('/api', '')}/api/disclaimer`),
};

export default api;
