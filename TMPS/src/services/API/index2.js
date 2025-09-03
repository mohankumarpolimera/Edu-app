// Updated index2.js - Enhanced Backend Connection with WebSocket URL + Handshake Hints
// src/services/API/index2.js

// Assessment API configuration with correct WebSocket endpoints
const ASSESSMENT_API_BASE_URL =
  import.meta.env.VITE_ASSESSMENT_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'https://192.168.48.201:8070';

const isDevelopment = import.meta.env.MODE === 'development' || import.meta.env.DEV;

// Enhanced SSL error handling
const handleSSLErrors = (error) => {
  if (
    error.message.includes('SSL') ||
    error.message.includes('certificate') ||
    error.message.includes('ERR_SSL') ||
    error.message.includes('net::ERR_CERT')
  ) {
    console.warn('🚨 SSL Certificate Error detected:', error.message);
    console.warn('🔧 To fix this:');
    console.warn('   1. Accept the certificate at: ' + ASSESSMENT_API_BASE_URL + '/weekly_interview/health');
    return new Error(
      `SSL Certificate Error: Please accept the self-signed certificate by visiting ${ASSESSMENT_API_BASE_URL}/weekly_interview/health in your browser first.`
    );
  }
  return error;
};

// Build WS origin from ASSESSMENT_API_BASE_URL (not from window.location)
const getWebSocketURL = () => {
  try {
    const base = new URL(ASSESSMENT_API_BASE_URL);
    const wsProto = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${base.host}`; // e.g. wss://192.168.48.201:8070
  } catch (e) {
    // Fallback to same-origin only if BASE_URL is invalid/missing
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
};

// Authentication and headers
const getAuthToken = () => {
  return (
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('authToken')
  );
};

const getAssessmentHeaders = (isFormData = false) => {
  const headers = {};

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  headers['Accept'] = 'application/json';

  if (isDevelopment) {
    headers['Cache-Control'] = 'no-cache';
    headers['Pragma'] = 'no-cache';
  }

  return headers;
};

// Configuration constants
const DEFAULT_TIMEOUT = 30000;
const UPLOAD_TIMEOUT = 60000;
const WEBSOCKET_TIMEOUT = 300000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Enhanced audio configuration
const ENHANCED_AUDIO_CONFIG = {
  SILENCE_THRESHOLD: 0.012,
  SILENCE_DURATION: 2800,
  MAX_RECORDING_TIME: 25000,
  SAMPLE_RATE: 44100,
  ECHO_CANCELLATION: true,
  NOISE_SUPPRESSION: false, // Better for voice detection
  AUTO_GAIN_CONTROL: false, // More sensitive detection
  MIN_SPEECH_DURATION: 800,
};

// ENHANCED: WebSocket connection manager with fixed endpoints
class EnhancedWebSocketManager {
  constructor() {
    this.connections = new Map();
    this.messageQueues = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 3;
    this.callbacks = new Map();
  }

  connect(sessionId, callbacks = {}) {
    // If we already have a live or connecting socket, reuse it and update callbacks
    const existing = this.connections.get(sessionId);
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      console.log('♻️ Reusing existing WebSocket for session:', sessionId);
      this.callbacks.set(sessionId, callbacks);
      return existing;
    }

    // Close existing (closed/stale) connection if any
    if (this.connections.has(sessionId)) {
      this.disconnect(sessionId);
    }

    // Attach optional identity to query params (helps some server handshakes / LB)
    const participantId =
      localStorage.getItem('participant_id') || sessionStorage.getItem('participant_id') || '';
    const token = (getAuthToken() || '').trim();

    const url = new URL(`${getWebSocketURL()}/weekly_interview/ws/${sessionId}`);
    if (participantId) url.searchParams.set('participant_id', participantId);
    if (token) url.searchParams.set('token', token); // include only if your backend accepts token in query

    const wsURL = url.toString();
    console.log('🔌 Connecting to WebSocket (FIXED URL):', wsURL);

    this.callbacks.set(sessionId, callbacks);

    const ws = new WebSocket(wsURL);

    ws.onopen = () => {
      console.log('✅ WebSocket connected successfully for session:', sessionId);
      this.reconnectAttempts.set(sessionId, 0);

      // Send queued messages
      const queue = this.messageQueues.get(sessionId) || [];
      while (queue.length > 0) {
        const message = queue.shift();
        this.send(sessionId, message);
      }

      const cb = this.callbacks.get(sessionId);
      if (cb?.onOpen) cb.onOpen();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message received:', data.type);
        const cb = this.callbacks.get(sessionId);
        if (cb?.onMessage) cb.onMessage(data);
      } catch (error) {
        console.error('❌ WebSocket message parse error:', error);
        const cb = this.callbacks.get(sessionId);
        if (cb?.onError) cb.onError(error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      const cb = this.callbacks.get(sessionId);

      if (error?.type === 'error') {
        const sslError = new Error(
          'WebSocket SSL connection failed. Please accept the SSL certificate first.'
        );
        if (cb?.onError) cb.onError(handleSSLErrors(sslError));
      } else {
        if (cb?.onError) cb.onError(error);
      }
    };

    ws.onclose = (event) => {
      console.log('🔌 WebSocket closed:', event.code, event.reason);
      this.connections.delete(sessionId);

      // Handle reconnection for abnormal closures
      if (event.code !== 1000 && event.code !== 1001) {
        const attempts = this.reconnectAttempts.get(sessionId) || 0;
        if (attempts < this.maxReconnectAttempts) {
          console.log(`🔄 Attempting reconnection ${attempts + 1}/${this.maxReconnectAttempts}`);
          this.reconnectAttempts.set(sessionId, attempts + 1);

          setTimeout(() => {
            this.connect(sessionId, this.callbacks.get(sessionId) || {});
          }, 2000 * (attempts + 1));

          return;
        }
      }

      const cb = this.callbacks.get(sessionId);
      if (cb?.onClose) cb.onClose(event);
    };

    this.connections.set(sessionId, ws);
    return ws;
  }

  send(sessionId, data) {
    const ws = this.connections.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      ws.send(message);
      console.log('📤 WebSocket message sent:', typeof data === 'object' ? data.type : 'string');
      return true;
    } else {
      // Queue message for when connection is ready
      if (!this.messageQueues.has(sessionId)) {
        this.messageQueues.set(sessionId, []);
      }
      this.messageQueues.get(sessionId).push(data);
      console.warn('⚠️ WebSocket not ready, message queued for session:', sessionId);
      return false;
    }
  }

  disconnect(sessionId) {
    const ws = this.connections.get(sessionId);
    if (ws) {
      try {
        ws.close(1000, 'Normal closure');
      } catch (_) {}
      this.connections.delete(sessionId);
      this.messageQueues.delete(sessionId);
      this.reconnectAttempts.delete(sessionId);
      this.callbacks.delete(sessionId);
      console.log('🔌 WebSocket disconnected for session:', sessionId);
    }
  }

  getConnectionState(sessionId) {
    const ws = this.connections.get(sessionId);
    if (!ws) return 'not_connected';

    const states = {
      [WebSocket.CONNECTING]: 'connecting',
      [WebSocket.OPEN]: 'open',
      [WebSocket.CLOSING]: 'closing',
      [WebSocket.CLOSED]: 'closed',
    };

    return states[ws.readyState] || 'unknown';
  }

  disconnectAll() {
    for (const [, ws] of this.connections) {
      try {
        ws.close(1000, 'Normal closure');
      } catch (_) {}
    }
    this.connections.clear();
    this.messageQueues.clear();
    this.reconnectAttempts.clear();
    this.callbacks.clear();
    console.log('🔌 All WebSocket connections closed');
  }
}

// Global enhanced WebSocket manager
const enhancedWsManager = new EnhancedWebSocketManager();

// Enhanced audio recording with better configuration
export const recordEnhancedAudio = async (
  duration = ENHANCED_AUDIO_CONFIG.MAX_RECORDING_TIME
) => {
  try {
    console.log('🎤 Starting enhanced audio recording...');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: ENHANCED_AUDIO_CONFIG.SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: ENHANCED_AUDIO_CONFIG.ECHO_CANCELLATION,
        noiseSuppression: ENHANCED_AUDIO_CONFIG.NOISE_SUPPRESSION,
        autoGainControl: ENHANCED_AUDIO_CONFIG.AUTO_GAIN_CONTROL,
        latency: 0.01,
      },
    });

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    });

    const audioChunks = [];
    let silenceStart = null;
    let isRecording = true;
    let hasSpoken = false;
    let speechStartTime = null;

    // Enhanced audio context setup
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: ENHANCED_AUDIO_CONFIG.SAMPLE_RATE,
      latencyHint: 'interactive',
    });

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.1;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    microphone.connect(analyser);

    return new Promise((resolve, reject) => {
      let animationFrameId;

      const checkAudioLevel = () => {
        if (!isRecording) return;

        analyser.getByteFrequencyData(dataArray);

        const avgVolume =
          dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const normalizedLevel = avgVolume / 255;

        if (normalizedLevel > ENHANCED_AUDIO_CONFIG.SILENCE_THRESHOLD) {
          if (!hasSpoken) {
            hasSpoken = true;
            speechStartTime = Date.now();
            console.log('🗣️ User started speaking...');
          }
          silenceStart = null;
        } else if (hasSpoken && normalizedLevel <= ENHANCED_AUDIO_CONFIG.SILENCE_THRESHOLD) {
          const speechDuration = Date.now() - speechStartTime;

          if (speechDuration >= ENHANCED_AUDIO_CONFIG.MIN_SPEECH_DURATION) {
            if (silenceStart === null) {
              silenceStart = Date.now();
              console.log('🔇 Silence detected after speech, starting timer...');
            } else {
              const silenceElapsed = Date.now() - silenceStart;
              if (silenceElapsed >= ENHANCED_AUDIO_CONFIG.SILENCE_DURATION) {
                console.log(`⏹️ ${ENHANCED_AUDIO_CONFIG.SILENCE_DURATION}ms of silence - stopping recording`);
                stopRecording('natural_pause');
                return;
              }
            }
          }
        }

        animationFrameId = requestAnimationFrame(checkAudioLevel);
      };

      const stopRecording = (reason) => {
        if (!isRecording) return;

        isRecording = false;
        console.log(`⏹️ Stopping recording: ${reason}`);

        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }

        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }

        stream.getTracks().forEach((track) => track.stop());
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        console.log(`✅ Enhanced recording completed, size: ${audioBlob.size} bytes`);
        resolve(audioBlob);
      };

      mediaRecorder.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error);
        stopRecording('error');
        reject(error);
      };

      mediaRecorder.start(100);
      console.log('🎤 Enhanced recording started...');

      checkAudioLevel();

      // Safety timeout
      setTimeout(() => {
        if (isRecording) {
          console.log('⏰ Maximum duration reached');
          stopRecording('max_duration');
        }
      }, duration);
    });
  } catch (error) {
    console.error('❌ Failed to start enhanced audio recording:', error);
    throw new Error(`Enhanced audio recording failed: ${error.message}`);
  }
};

// Enhanced assessment API request function
export const assessmentApiRequest = async (endpoint, options = {}) => {
  const url = `${ASSESSMENT_API_BASE_URL}${endpoint}`;
  console.log(url);

  const isFormData = options.body instanceof FormData;
  const timeout = options.timeout || (isFormData ? UPLOAD_TIMEOUT : DEFAULT_TIMEOUT);

  const config = {
    headers: getAssessmentHeaders(isFormData),
    ...options,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  config.signal = controller.signal;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🌐 API Request (attempt ${attempt}):`, {
        url,
        method: config.method || 'GET',
        hasBody: !!config.body,
        timeout: timeout,
      });

      const response = await fetch(url, config);

      console.log('📡 API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        attempt: attempt,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
          } else {
            errorData = await response.text();
          }
        } catch (e) {
            errorData = response.statusText;
        }

        console.error('❌ API Error Response:', {
          status: response.status,
          data: errorData,
          attempt: attempt,
        });

        let errorMessage = `HTTP ${response.status}`;
        if (typeof errorData === 'object' && errorData?.detail) {
          errorMessage += `: ${errorData.detail}`;
        } else if (typeof errorData === 'string') {
          errorMessage += `: ${errorData}`;
        } else {
          errorMessage += `: ${response.statusText}`;
        }

        const error = new Error(errorMessage);
        error.status = response.status;
        error.response = { data: errorData };

        if (response.status >= 400 && response.status < 500) {
          throw error;
        }

        lastError = error;

        if (attempt === MAX_RETRIES) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
        continue;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const jsonData = await response.json();
        console.log('✅ API JSON Response received');
        return jsonData;
      } else if (contentType && contentType.includes('application/pdf')) {
        const blob = await response.blob();
        console.log('📄 API PDF Response:', blob.size, 'bytes');
        return blob;
      } else {
        const textData = await response.text();
        console.log('📝 API Text Response received');
        return textData;
      }
    } catch (error) {
      clearTimeout(timeoutId);

      console.error(`❌ API request failed (attempt ${attempt}):`, {
        url,
        error: error.message,
        name: error.name,
        attempt: attempt,
      });

      const processedError = handleSSLErrors(error);
      lastError = processedError;

      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${timeout}ms`);
        timeoutError.name = 'TimeoutError';
        lastError = timeoutError;
      }

      if (attempt === MAX_RETRIES) {
        break;
      }

      if (error.message.includes('SSL') || error.message.includes('certificate')) {
        break;
      }

      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
        continue;
      } else if (error.status && error.status >= 400 && error.status < 500) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
    }
  }

  if (lastError) {
    if (lastError.message.includes('SSL Certificate Error')) {
      throw lastError;
    } else if (lastError.message.includes('Failed to fetch') || lastError.name === 'TypeError') {
      const networkError = new Error(
        `Network error: Cannot connect to ${ASSESSMENT_API_BASE_URL}. Please check your internet connection and verify the server is running.`
      );
      networkError.originalError = lastError;
      throw networkError;
    } else if (lastError.name === 'TimeoutError') {
      const timeoutError = new Error(`Request timeout: Server took too long to respond.`);
      timeoutError.originalError = lastError;
      throw timeoutError;
    } else {
      throw lastError;
    }
  }

  throw new Error('Unknown error occurred during API request');
};

// Enhanced connection test
export const testAPIConnection = async () => {
  try {
    const healthEndpoints = [
      '/weekly_interview/health',
      '/weekly_interview/start_interview?dry_run=1',
      '/weekly_interview',
      '/',
    ];

    for (const endpoint of healthEndpoints) {
      try {
        const res = await assessmentApiRequest(endpoint, { method: 'GET', timeout: 8000 });
        return {
          status: 'success',
          message: 'API reachable',
          response: res,
          baseUrl: ASSESSMENT_API_BASE_URL || 'same-origin',
          endpoint,
        };
      } catch (err) {
        if (err?.status && (err.status === 404 || err.status === 405)) {
          return {
            status: 'success',
            message: `API reachable (status ${err.status} on ${endpoint})`,
            baseUrl: ASSESSMENT_API_BASE_URL || 'same-origin',
            endpoint,
          };
        }
        continue;
      }
    }

    throw new Error('All connectivity checks failed');
  } catch (error) {
    return { status: 'failed', message: error.message };
  }
};

// ENHANCED: Session management with correct endpoints
export const createInterviewSession = async () => {
  try {
    console.log('🚀 Creating enhanced interview session...');

    // Primary GET attempt (your backend currently accepts GET)
    let response;
    try {
      response = await assessmentApiRequest('/weekly_interview/start_interview', {
        method: 'GET',
      });
    } catch (e) {
      // If the server is stricter and requires POST, fallback to POST
      if (e?.status === 405) {
        response = await assessmentApiRequest('/weekly_interview/start_interview', {
          method: 'POST',
        });
      } else {
        throw e;
      }
    }

    if (!response || !response.session_id) {
      throw new Error('Invalid session response from server');
    }

    console.log('✅ Enhanced interview session created:', response.session_id);

    // If your backend returns participant_id, persist it for the WS query param
    if (response.participant_id) {
      try {
        localStorage.setItem('participant_id', response.participant_id);
      } catch (_) {}
    }

    return {
      sessionId: response.session_id,
      testId: response.test_id,
      studentName: response.student_name || 'Student',
      websocketUrl: `/weekly_interview/ws/${response.session_id}`,
      fragmentsCount: response.fragments_count || 0,
      estimatedDuration: response.estimated_duration || 45,
      greeting: response.greeting || 'Welcome to your enhanced interview!',
      participantId: response.participant_id || null,
    };
  } catch (error) {
    console.error('❌ Enhanced session creation failed:', error);
    throw new Error(`Failed to create interview session: ${error.message}`);
  }
};

// Enhanced interview results
export const getInterviewResults = async (testId) => {
  try {
    console.log('📊 Fetching enhanced interview results for:', testId);

    const response = await assessmentApiRequest(`/evaluate?test_id=${encodeURIComponent(testId)}`, {
      method: 'GET',
    });

    if (!response) {
      throw new Error('No results found for this interview');
    }

    console.log('✅ Enhanced interview results retrieved');
    return response;
  } catch (error) {
    console.error('❌ Results retrieval failed:', error);
    throw new Error(`Failed to get interview results: ${error.message}`);
  }
};

// ENHANCED: WebSocket utilities with fixed endpoints
export const createInterviewWebSocket = (sessionId, callbacks = {}) => {
  const { onOpen = () => {}, onMessage = () => {}, onError = () => {}, onClose = () => {} } = callbacks;

  return enhancedWsManager.connect(sessionId, {
    onOpen,
    onMessage,
    onError,
    onClose,
  });
};

export const sendWebSocketMessage = (sessionId, message) => {
  return enhancedWsManager.send(sessionId, message);
};

export const closeWebSocket = (sessionId) => {
  enhancedWsManager.disconnect(sessionId);
};

export const getWebSocketState = (sessionId) => {
  return enhancedWsManager.getConnectionState(sessionId);
};

// Enhanced audio processing
export const processAudioForWebSocket = async (audioBlob) => {
  try {
    console.log('🎵 Processing enhanced audio for WebSocket transmission...');

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Empty audio blob provided');
    }

    // Convert blob to base64
    const base64Audio = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    console.log(`✅ Enhanced audio processed: ${audioBlob.size} bytes -> ${base64Audio.length} base64 chars`);

    return {
      type: 'audio_data',
      audio: base64Audio,
      metadata: {
        size: audioBlob.size,
        type: audioBlob.type,
        timestamp: Date.now(),
        enhanced: true,
      },
    };
  } catch (error) {
    console.error('❌ Enhanced audio processing failed:', error);
    throw new Error(`Audio processing failed: ${error.message}`);
  }
};

// Configuration validation
export const validateAPIConfig = () => {
  const config = {
    baseUrl: ASSESSMENT_API_BASE_URL,
    wsUrl: getWebSocketURL(),
    hasToken: !!getAuthToken(),
    isDevelopment: isDevelopment,
    endpoints: {
      health: '/health',
      startInterview: '/start_interview',
      evaluate: '/evaluate',
      websocket: '/ws/{session_id}',
    },
  };

  console.log('🔧 Enhanced API Configuration:', config);

  const issues = [];

  if (!config.baseUrl) {
    issues.push('API base URL not configured');
  }

  if (!config.baseUrl.startsWith('http')) {
    issues.push('API base URL should start with http:// or https://');
  }

  if (config.baseUrl.startsWith('https://') && isDevelopment) {
    issues.push('HTTPS in development - ensure SSL certificate is accepted');
  }

  return {
    isValid: issues.length === 0,
    issues: issues,
    config: config,
  };
};

// Environment detection
export const getEnvironmentInfo = () => {
  return {
    mode: import.meta.env.MODE || 'production',
    isDevelopment: import.meta.env.DEV || false,
    isProduction: import.meta.env.PROD || true,
    baseUrl: ASSESSMENT_API_BASE_URL,
    wsUrl: getWebSocketURL(),
    hasViteConfig: !!(import.meta.env.VITE_ASSESSMENT_API_URL || import.meta.env.VITE_API_BASE_URL),
    envVars: {
      VITE_ASSESSMENT_API_URL: import.meta.env.VITE_ASSESSMENT_API_URL,
      VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
      NODE_ENV: import.meta.env.NODE_ENV,
    },
    features: {
      enhancedAudio: true,
      fixedWebSocketEndpoints: true,
      improvedErrorHandling: true,
      betterSSLSupport: true,
    },
  };
};

// Export legacy function for backward compatibility
export const recordAudio = recordEnhancedAudio;

// Export everything
export {
  ASSESSMENT_API_BASE_URL,
  enhancedWsManager as wsManager,
  getWebSocketURL,
  getAuthToken,
  getAssessmentHeaders,
  DEFAULT_TIMEOUT,
  UPLOAD_TIMEOUT,
  WEBSOCKET_TIMEOUT,
  MAX_RETRIES,
  RETRY_DELAY,
  ENHANCED_AUDIO_CONFIG as NATURAL_AUDIO_CONFIG,
};

export default {
  assessmentApiRequest,
  testAPIConnection,
  validateAPIConfig,
  getEnvironmentInfo,
  recordAudio: recordEnhancedAudio,
  wsManager: enhancedWsManager,
  ASSESSMENT_API_BASE_URL,
  getWebSocketURL,
  getAuthToken,
  getAssessmentHeaders,
  DEFAULT_TIMEOUT,
  UPLOAD_TIMEOUT,
  WEBSOCKET_TIMEOUT,
  MAX_RETRIES,
  RETRY_DELAY,
  NATURAL_AUDIO_CONFIG: ENHANCED_AUDIO_CONFIG,
  // Enhanced utilities
  createInterviewWebSocket,
  sendWebSocketMessage,
  closeWebSocket,
  getWebSocketState,
  processAudioForWebSocket,
  createInterviewSession,
  getInterviewResults,
};
