// ==================================================
// CLIENT/SRC/UTILS/API.JS
// ==================================================

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const fetchTopics = async () => {
  try {
    const response = await api.get('/topics');
    return response.data;
  } catch (error) {
    console.error('API Error - fetchTopics:', error);
    throw error;
  }
};

export const startDebate = async ({ topicId, studentPosition, studentName }) => {
  try {
    const response = await api.post('/debate/start', {
      topicId,
      studentPosition,
      studentName
    });
    return response.data;
  } catch (error) {
    console.error('API Error - startDebate:', error);
    throw error;
  }
};

export const submitArgument = async ({ sessionId, argument }) => {
  try {
    const response = await api.post('/debate/argument', {
      sessionId,
      argument
    });
    return response.data;
  } catch (error) {
    console.error('API Error - submitArgument:', error);
    throw error;
  }
};

export const fetchDebateHistory = async (sessionId) => {
  try {
    const response = await api.get(`/debate/${sessionId}/history`);
    return response.data;
  } catch (error) {
    console.error('API Error - fetchDebateHistory:', error);
    throw error;
  }
};

export const fetchDashboardData = async (studentName) => {
  try {
    const response = await api.get(`/dashboard/${encodeURIComponent(studentName)}`);
    return response.data;
  } catch (error) {
    console.error('API Error - fetchDashboardData:', error);
    throw error;
  }
};

export default api;