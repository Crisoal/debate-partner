// ==================================================
// CLIENT/SRC/UTILS/API.JS - Updated with Voice and Peer Features
// ==================================================

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased timeout for voice processing
});

// Existing API functions
export const fetchTopics = async () => {
  try {
    const response = await api.get('/topics');
    return response.data;
  } catch (error) {
    console.error('API Error - fetchTopics:', error);
    throw error;
  }
};

export const startDebate = async ({ topicId, studentPosition, studentName, debateMode = 'ai' }) => {
  try {
    const response = await api.post('/debate/start', {
      topicId,
      studentPosition,
      studentName,
      debateMode
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

// NEW: Voice Debate API functions
export const submitVoiceArgument = async ({ sessionId, audioBlob }) => {
  try {
    console.log('=== Submitting Voice Argument ===');
    console.log('Session ID:', sessionId);
    console.log('Audio Blob info:', {
      size: audioBlob.size,
      type: audioBlob.type
    });

    // Validate inputs
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Audio blob is empty or invalid');
    }

    if (audioBlob.size < 1000) {
      throw new Error('Audio recording is too short. Please record for at least 2 seconds.');
    }

    // Create FormData with exact field names expected by backend
    const formData = new FormData();
    formData.append('sessionId', sessionId.toString());

    // Ensure audio blob has correct filename extension
    const audioFile = new File([audioBlob], 'voice-argument.webm', {
      type: audioBlob.type || 'audio/webm'
    });

    formData.append('audio', audioFile); // Must match upload.single('audio') in backend

    console.log('FormData entries:');
    for (let [key, value] of formData.entries()) {
      console.log(`${key}:`, value);
    }

    const response = await api.post('/debate/voice-argument', formData, {
      headers: {
        // Don't set Content-Type - let the browser set it with boundary for multipart/form-data
      },
      timeout: 120000, // 2 minutes for voice processing
    });

    console.log('Voice argument submitted successfully');
    return response.data;

  } catch (error) {
    console.error('API Error - submitVoiceArgument:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });

    // Provide more user-friendly error messages
    if (error.response?.status === 400) {
      const errorData = error.response.data;
      if (errorData.code === 'MISSING_AUDIO_FILE') {
        throw new Error('Audio recording failed. Please try recording again.');
      } else if (errorData.code === 'FILE_TOO_SMALL') {
        throw new Error('Recording too short. Please speak for at least 2 seconds.');
      } else if (errorData.code === 'INVALID_FILE_TYPE') {
        throw new Error('Invalid audio format. Please try again.');
      } else if (errorData.code === 'TRANSCRIPTION_FAILED') {
        throw new Error('Could not understand the audio. Please speak clearly and try again.');
      } else {
        throw new Error(errorData.error || 'Failed to process voice argument');
      }
    } else if (error.response?.status === 404) {
      throw new Error('Debate session not found. Please start a new debate.');
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again in a moment.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. Please try with a shorter recording.');
    } else {
      throw new Error('Network error. Please check your connection and try again.');
    }
  }
};

export const startVoiceDebate = async ({ topicId, studentPosition, studentName }) => {
  try {
    const response = await api.post('/debate/voice/start', {
      topicId,
      studentPosition,
      studentName
    });
    return response.data;
  } catch (error) {
    console.error('API Error - startVoiceDebate:', error);
    throw error;
  }
};

// NEW: Peer-to-Peer Debate API functions
export const startPeerDebate = async ({ topicId, studentName, studentPosition, timePerTurn = 120, totalRounds = 3 }) => {
  try {
    const response = await api.post('/debate/peer/start', {
      topicId,
      studentName,
      studentPosition,
      timePerTurn,
      totalRounds
    });
    return response.data;
  } catch (error) {
    console.error('API Error - startPeerDebate:', error);
    throw error;
  }
};

export const joinPeerDebate = async (sessionId, studentName, studentPosition) => {
  try {
    const response = await api.post('/debate/peer/join', {
      sessionId,
      studentName,
      studentPosition
    });
    return response.data;
  } catch (error) {
    console.error('API Error - joinPeerDebate:', error);
    throw error;
  }
};

export const submitPeerArgument = async ({ sessionId, argument, studentName }) => {
  try {
    const response = await api.post('/debate/peer/argument', {
      sessionId,
      argument,
      studentName
    });
    return response.data;
  } catch (error) {
    console.error('API Error - submitPeerArgument:', error);
    throw error;
  }
};

export const submitPeerVoiceArgument = async ({ sessionId, audioBlob, studentName }) => {
  try {
    console.log('=== Submitting Peer Voice Argument ===');
    console.log('Session ID:', sessionId);
    console.log('Student Name:', studentName);
    console.log('Audio Blob info:', {
      size: audioBlob.size,
      type: audioBlob.type
    });

    // Validate inputs
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (!studentName) {
      throw new Error('Student name is required');
    }

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Audio blob is empty or invalid');
    }

    if (audioBlob.size < 1000) {
      throw new Error('Audio recording is too short. Please record for at least 2 seconds.');
    }

    // Create FormData
    const formData = new FormData();
    formData.append('sessionId', sessionId.toString());
    formData.append('studentName', studentName);

    const audioFile = new File([audioBlob], 'voice-argument.webm', {
      type: audioBlob.type || 'audio/webm'
    });

    formData.append('audio', audioFile);

    console.log('FormData entries:');
    for (let [key, value] of formData.entries()) {
      console.log(`${key}:`, value);
    }

    const response = await api.post('/debate/peer/voice-argument', formData, {
      headers: {
        // Don't set Content-Type - let browser set it with boundary
      },
      timeout: 120000, // 2 minutes for voice processing
    });

    console.log('Peer voice argument submitted successfully');
    return response.data;

  } catch (error) {
    console.error('API Error - submitPeerVoiceArgument:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });

    // Provide user-friendly error messages
    if (error.response?.status === 400) {
      const errorData = error.response.data;
      if (errorData.code === 'MISSING_AUDIO_FILE') {
        throw new Error('Audio recording failed. Please try recording again.');
      } else if (errorData.code === 'FILE_TOO_SMALL') {
        throw new Error('Recording too short. Please speak for at least 2 seconds.');
      } else if (errorData.code === 'NOT_YOUR_TURN') {
        throw new Error('It\'s not your turn to speak. Please wait for your opponent.');
      } else if (errorData.code === 'TRANSCRIPTION_FAILED') {
        throw new Error('Could not understand the audio. Please speak clearly and try again.');
      } else {
        throw new Error(errorData.error || 'Failed to process voice argument');
      }
    } else if (error.response?.status === 404) {
      throw new Error('Debate session not found. Please start a new debate.');
    } else if (error.response?.status === 500) {
      throw new Error('Server error. Please try again in a moment.');
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. Please try with a shorter recording.');
    } else {
      throw new Error('Network error. Please check your connection and try again.');
    }
  }
};

export const leavePeerDebate = async (sessionId, studentName) => {
  try {
    const response = await api.post('/debate/peer/leave', {
      sessionId,
      studentName
    });
    return response.data;
  } catch (error) {
    console.error('API Error - leavePeerDebate:', error);
    throw error;
  }
};

export const findPeerDebateMatch = async ({ topicId, studentName, studentPosition }) => {
  try {
    const response = await api.post('/debate/peer/find-match', {
      topicId,
      studentName,
      studentPosition
    });
    return response.data;
  } catch (error) {
    console.error('API Error - findPeerDebateMatch:', error);
    throw error;
  }
};

// WebSocket utility for real-time peer debates
export class PeerDebateWebSocket {
  constructor(sessionId, onMessage) {
    this.sessionId = sessionId;
    this.onMessage = onMessage;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:5000'}/debate/peer/${this.sessionId}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Utility functions for audio processing
export const checkAudioSupport = () => {
  return {
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    speechRecognition: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
    speechSynthesis: 'speechSynthesis' in window,
    getUserMedia: navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  };
};

export const requestMicrophonePermission = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop()); // Stop the stream after getting permission
    return true;
  } catch (error) {
    console.error('Microphone permission denied:', error);
    return false;
  }
};

// Voice utilities for offline transcription (fallback)
export const startSpeechRecognition = (onResult, onError, lang = 'en-US') => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError('Speech recognition not supported');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    onResult(finalTranscript, interimTranscript);
  };

  recognition.onerror = onError;

  return recognition;
};

export default api;