// Complete StartInterview.jsx - Fixed Backend Integration with Material-UI
// src/components/student/MockInterviews/StartInterview.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Box, Card, CardContent, Button,
  Alert, CircularProgress, LinearProgress, Chip, IconButton,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, Divider, Avatar, Fab, Tooltip, Zoom, Fade
} from '@mui/material';
import {
  Mic, VolumeUp, Stop, ArrowBack, RadioButtonChecked, Circle,
  Headset, Videocam, VideocamOff, Cameraswitch, Warning,
  MicOff, Settings, Refresh, CheckCircle, Error as ErrorIcon,
  Timer, VoiceOverOff, Psychology, AutoAwesome
} from '@mui/icons-material';

// Import backend API services
import {
  createInterviewSession,
  testAPIConnection,
  createInterviewWebSocket,
  sendWebSocketMessage,
  closeWebSocket,
  getWebSocketState,
  recordAudio,
  processAudioForWebSocket
} from '../../../services/API/index2';
import { interviewOperationsAPI } from '../../../services/API/studentmockinterview';

// Enhanced configuration constants
const AUDIO_CONFIG = {
  SILENCE_THRESHOLD: 0.012,
  SILENCE_DURATION: 2800,
  MAX_RECORDING_TIME: 25000,
  MIN_SPEECH_TIME: 800,
  AI_PAUSE_DELAY: 1200,
  NO_VOICE_TIMEOUT: 12000,
  KEEPALIVE_INTERVAL: 25000,
  AUDIO_LEVEL_UPDATE_INTERVAL: 80,
  PLAYBACK_VOLUME: 0.85,
  AI_SPEECH_RATE: 0.75,
  VOICE_DETECTION_SENSITIVITY: 0.6
};

const WEBSOCKET_CONFIG = {
  RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY: 2000,
  CONNECTION_TIMEOUT: 15000,
  PING_INTERVAL: 30000
};

const CAMERA_CONFIG = {
  VIDEO_WIDTH: 1280,
  VIDEO_HEIGHT: 720,
  FRAME_RATE: 30,
  QUALITY: 0.9
};

const StartInterview = () => {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract data from navigation state or URL params
  const urlParams = new URLSearchParams(window.location.search);
  const initialTestId = location.state?.testId || urlParams.get('testId');
  const initialStudentName = location.state?.studentName || urlParams.get('studentName') || 'Student';

  // Core states
  const [testId, setTestId] = useState(initialTestId);
  const [studentName, setStudentName] = useState(initialStudentName);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);

  // Connection states
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [systemReady, setSystemReady] = useState(false);

  // Interview states
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [currentStage, setCurrentStage] = useState('greeting');
  const [questionNumber, setQuestionNumber] = useState(0);

  // Audio states
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [silenceTimer, setSilenceTimer] = useState(0);
  const [noVoiceTimer, setNoVoiceTimer] = useState(0);
  const [showHeadphoneWarning, setShowHeadphoneWarning] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [aiSpeechProgress, setAiSpeechProgress] = useState(0);
  const [waitingForVoice, setWaitingForVoice] = useState(false);

  // Camera states
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [videoStream, setVideoStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [cameraInitializing, setCameraInitializing] = useState(false);

  // UI states
  const [isEndingInterview, setIsEndingInterview] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [showSystemCheck, setShowSystemCheck] = useState(false);
  const didInitRef = useRef(false);
  const awaitingNextQuestionRef = useRef(false);
  const awaitingServerAnswerRef = useRef(false);




  // Refs for real-time data
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const noVoiceTimeoutRef = useRef(null);
  const audioChunksRef = useRef([]);
  const keepAliveIntervalRef = useRef(null);
  const animationFrameRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);

  // Camera refs
  const videoRef = useRef(null);
  const videoStreamRef = useRef(null);

  // Audio processing refs
  const audioQueueRef = useRef([]);
  const currentAudioRef = useRef(null);
  const gainNodeRef = useRef(null);
  const isPlayingAudioRef = useRef(false);
  const aiSpeechTimeoutRef = useRef(null);

  // State sync refs
  const interviewStartedRef = useRef(false);
  const isConnectedRef = useRef(false);
  const waitingForVoiceRef = useRef(false);

  // Sync refs with state
  useEffect(() => {
    interviewStartedRef.current = interviewStarted;
    isConnectedRef.current = isConnected;
    waitingForVoiceRef.current = waitingForVoice;
  }, [interviewStarted, isConnected, waitingForVoice]);






  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    console.log('🚀 StartInterview component mounted (once)');
    console.log('📋 Initial props:', { sessionId, testId, studentName });

    if (!window.location.search.includes('skip_headphone_check')) {
      setShowHeadphoneWarning(true);
      return;
    }

    initializeCompleteSystem();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Add this helper ---
  const waitForAudioReady = async (retries = 15, delay = 120) => {
    for (let i = 0; i < retries; i++) {
      const ctx = audioContextRef.current;
      const ready =
        analyserRef.current &&
        streamRef.current?.active &&
        ctx &&
        (ctx.state === 'running' || (await ctx.resume(), ctx.state === 'running'));

      if (ready) return true;
      await new Promise(r => setTimeout(r, delay));
    }
    return false;
  };


  // Enhanced system initialization with session creation fallback
  const initializeCompleteSystem = async () => {
    try {
      console.log('🔄 Initializing complete interview system...');
      setIsConnecting(true);
      setConnectionError(null);

      // Step 1: Check backend connectivity
      await checkBackendConnection();

      // Step 2: Handle session creation if needed
      await handleSessionCreation();

      // Step 3: Setup media systems
      await setupMediaSystems();

      // Step 4: Initialize WebSocket connection
      await initializeWebSocketConnection();

      setSystemReady(true);
      console.log('✅ Complete system initialization successful');

    } catch (error) {
      console.error('❌ System initialization failed:', error);
      setConnectionError(`System initialization failed: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const checkBackendConnection = async () => {
    try {
      console.log('🔍 Testing backend connection...');
      const connectionTest = await testAPIConnection();

      if (connectionTest.status !== 'success') {
        throw new Error(connectionTest.message || 'Backend connection failed');
      }

      console.log('✅ Backend connection verified');
    } catch (error) {
      throw new Error(`Backend connectivity check failed: ${error.message}`);
    }
  };

  const handleSessionCreation = async () => {
    try {
      // If we have sessionId and testId, we're good
      if (currentSessionId && testId) {
        console.log('✅ Using existing session:', currentSessionId);
        return;
      }

      // If we have sessionId but no testId, try to get it from backend
      if (currentSessionId && !testId) {
        console.log('🔍 Session ID exists but no test ID, attempting to continue...');
        return;
      }

      // Create new session
      console.log('🎯 Creating new interview session...');
      const sessionData = await createInterviewSession();

      if (!sessionData.sessionId || !sessionData.testId) {
        throw new Error('Invalid session data received from backend');
      }

      setCurrentSessionId(sessionData.sessionId);
      setTestId(sessionData.testId);
      setStudentName(sessionData.studentName || 'Student');

      console.log('✅ New session created:', {
        sessionId: sessionData.sessionId,
        testId: sessionData.testId,
        studentName: sessionData.studentName
      });

      // Update URL to reflect new session
      window.history.replaceState(
        { testId: sessionData.testId, studentName: sessionData.studentName },
        '',
        `/student/mock-interviews/session/${sessionData.sessionId}`
      );

    } catch (error) {
      throw new Error(`Session creation failed: ${error.message}`);
    }
  };

  const setupMediaSystems = async () => {
    try {
      console.log('🎥 Setting up media systems...');

      // Setup camera system
      try {
        await getCameraDevices();
        console.log('📹 Camera system ready');
      } catch (cameraError) {
        console.warn('📹 Camera setup failed:', cameraError);
        setCameraError('Camera unavailable - continuing with audio only');
      }

      // Setup audio system
      await setupEnhancedAudioSystem();
      console.log('🎤 Audio system ready');

    } catch (error) {
      throw new Error(`Media system setup failed: ${error.message}`);
    }
  };

  const setupEnhancedAudioSystem = async () => {
    try {
      console.log('🎧 Setting up enhanced audio system...');
      setAudioInitialized(false);

      // Clean up existing resources
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Small delay for cleanup
      await new Promise(resolve => setTimeout(resolve, 150));

      // Get enhanced audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
          channelCount: 1,
          latency: 0.01
        },
        video: false
      });

      streamRef.current = stream;
      console.log('🎤 Enhanced audio stream obtained');

      // Create enhanced audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Create gain node for audio control
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.setValueAtTime(AUDIO_CONFIG.PLAYBACK_VOLUME, audioContextRef.current.currentTime);
      gainNodeRef.current.connect(audioContextRef.current.destination);

      // Create enhanced analyser
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.1;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;

      // Connect stream to analyser
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      setAudioInitialized(true);
      console.log('✅ Enhanced audio system initialization complete');

      // Test audio levels
      setTimeout(() => testEnhancedAudioLevels(), 300);

    } catch (error) {
      setAudioInitialized(false);
      throw new Error(`Enhanced audio setup failed: ${error.message}`);
    }
  };

  const testEnhancedAudioLevels = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    let testCount = 0;
    let maxLevel = 0;

    const testInterval = setInterval(() => {
      testCount++;
      analyserRef.current.getByteFrequencyData(dataArray);

      const avgVolume = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      const normalizedVolume = avgVolume / 255;
      maxLevel = Math.max(maxLevel, normalizedVolume);

      if (testCount >= 20) {
        clearInterval(testInterval);
        console.log(`🎤 Audio test complete: Max=${Math.round(maxLevel * 100)}%`);

        if (maxLevel > AUDIO_CONFIG.SILENCE_THRESHOLD * 0.5) {
          console.log('✅ Audio levels detected - microphone working');
        } else {
          console.warn('❌ Low/no audio detected - check microphone');
        }
      }
    }, 100);
  };

 // ——— StartInterview.jsx ———
// Replace your three functions with these versions

const initializeWebSocketConnection = async () => {
  try {
    if (!currentSessionId) {
      throw new Error('No session ID available for WebSocket connection');
    }

    console.log('🔌 Initializing WebSocket connection for session:', currentSessionId);

    const websocket = createInterviewWebSocket(currentSessionId, {
      onOpen: handleWebSocketOpen,
      onMessage: handleWebSocketMessage,
      onError: handleWebSocketError,
      onClose: handleWebSocketClose,
    });

    wsRef.current = websocket;

    // Setup ping interval for connection health (only here, not in onClose)
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    pingIntervalRef.current = setInterval(() => {
      try {
        if (getWebSocketState(currentSessionId) === 'open') {
          sendWebSocketMessage(currentSessionId, { type: 'ping' });
        }
      } catch (_) {}
    }, WEBSOCKET_CONFIG.PING_INTERVAL);
  } catch (error) {
    throw new Error(`WebSocket initialization failed: ${error.message}`);
  }
};

const handleWebSocketOpen = () => {
  console.log('✅ WebSocket connected successfully');
  setIsConnected(true);
  setIsConnecting(false);
  setConnectionError(null);
  setReconnectAttempts(0);
  setInterviewStarted(true);

  // 🔑 Send init/join so the server can bind this socket to the session
  try {
    const participantId =
      localStorage.getItem('participant_id') || sessionStorage.getItem('participant_id') || null;
    const token =
      localStorage.getItem('token') || sessionStorage.getItem('token') || null;

    if (currentSessionId) {
      sendWebSocketMessage(currentSessionId, {
        type: 'init', // change to 'join'/'start' if your backend expects a different verb
        session_id: currentSessionId,
        test_id: testId || null,
        participant_id: participantId,
        token, // include only if your backend allows token in messages
      });
    }
  } catch (e) {
    console.warn('Init message failed:', e);
  }
};

const handleWebSocketClose = (event) => {
  console.log('🔌 WebSocket closed:', event.code);
  setIsConnected(false);

  // Always clear ping; we only re-create it inside initializeWebSocketConnection()
  if (pingIntervalRef.current) {
    clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = null;
  }

  // Handle reconnection
  if (
    event.code !== 1000 &&
    event.code !== 1001 &&
    reconnectAttempts < WEBSOCKET_CONFIG.RECONNECT_ATTEMPTS
  ) {
    console.log(
      `🔄 Attempting reconnection ${reconnectAttempts + 1}/${WEBSOCKET_CONFIG.RECONNECT_ATTEMPTS}`
    );
    setReconnectAttempts((prev) => prev + 1);

    reconnectTimeoutRef.current = setTimeout(() => {
      initializeWebSocketConnection().catch((error) => {
        console.error('❌ Reconnection failed:', error);
        setConnectionError(`Reconnection failed: ${error.message}`);
      });
    }, WEBSOCKET_CONFIG.RECONNECT_DELAY);
  } else {
    setConnectionError('Connection lost. Please refresh to reconnect.');
  }
};


  const handleWebSocketMessage = (data) => {
    console.log('📨 WebSocket message received:', data.type);

    try {
      switch (data.type) {
        case 'error':
          console.error('🚨 Server error:', data.text);
          setConnectionError(data.text);
          break;

        case 'fatal_error':
          console.error('💀 Fatal server error:', data.text || data.message);
          setConnectionError(`Fatal Error: ${data.text || data.message}`);
          setInterviewStarted(false);
          break;

        case 'ai_response':
          console.log('🤖 AI response received');
          handleAIResponse(data);
          break;

        case 'audio_chunk':
          if (data.audio) {
            console.log('🔊 Audio chunk received');
            playAudioChunk(data.audio);
          }
          break;

        case 'audio_end':
          console.log('🎤 AI audio stream ended');
          handleAudioStreamEnd();
          break;

        case 'interview_complete':
          console.log('🎉 Interview completed');
          handleInterviewComplete(data);
          break;

        case 'pong':
          console.log('🏓 Pong received');
          break;

        default:
          console.log('❓ Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
    }
  };

  const handleWebSocketError = (error) => {
    console.error('❌ WebSocket error:', error);
    setConnectionError(`Connection error: ${error.message}`);
  };

  

  const handleAIResponse = (data) => {
    stopListening();
    setWaitingForVoice(false);
    waitingForVoiceRef.current = false;

    setCurrentMessage(data.text);
    setCurrentStage(data.stage || 'unknown');
    setQuestionNumber(data.question_number || 0);
    setIsAIPlaying(true);
    setAiSpeechProgress(0);
    setWaitingForVoice(false);
  };

  const handleAudioStreamEnd = () => {
    setTimeout(() => {
      waitForAudioComplete();
    }, 200);
  };

  const handleInterviewComplete = (data) => {
    setInterviewStarted(false);
    stopListening();
    if (cameraEnabled) {
      stopCamera();
    }

    setTimeout(() => {
      navigate(`/student/mock-interviews/results/${testId}`, {
        state: { evaluation: data }
      });
    }, 1500);
  };

  const waitForAudioComplete = () => {
    const queueEmpty = audioQueueRef.current.length === 0;
    const notPlaying = !isPlayingAudioRef.current;

    if (queueEmpty && notPlaying) {
      console.log('✅ AI audio complete - Starting voice detection');
      setIsAIPlaying(false);
      setAiSpeechProgress(100);

      setTimeout(() => {
        startAutoVoiceDetection();
      }, AUDIO_CONFIG.AI_PAUSE_DELAY);
    } else {
      setTimeout(waitForAudioComplete, 200);
    }
  };

  const startAutoVoiceDetection = async () => {
    try {
      console.log('🎯 Starting auto voice detection');

      if (isRecording || isAIPlaying || isPlayingAudioRef.current || audioQueueRef.current.length > 0) {
        console.log('🚫 System busy - retrying voice detection');
        setTimeout(startAutoVoiceDetection, 500);
        return;
      }

      // ✅ Use the helper instead of mixing refs + audioInitialized state
      if (!(await waitForAudioReady())) {
        console.warn('🔧 Audio still not ready – reinitializing audio system');
        await setupEnhancedAudioSystem();
        if (!(await waitForAudioReady())) {
          console.warn('🔧 Audio not ready after reinit; will retry later');
          return; // next cycle (after AI speaks or a user action) will retry
        }
      }

      // Clear existing timers
      if (noVoiceTimeoutRef.current) {
        clearInterval(noVoiceTimeoutRef.current);
        noVoiceTimeoutRef.current = null;
      }

      // Setup no-voice timeout
      let noVoiceElapsed = 0;
      noVoiceTimeoutRef.current = setInterval(() => {
        noVoiceElapsed += 100;
        setNoVoiceTimer(noVoiceElapsed);

        if (noVoiceElapsed >= AUDIO_CONFIG.NO_VOICE_TIMEOUT) {
          console.log('⏰ No voice timeout - requesting next question');
          clearInterval(noVoiceTimeoutRef.current);
          noVoiceTimeoutRef.current = null;
          requestNextQuestion();
        }
      }, 100);

      startEnhancedVoiceMonitoring();
      setWaitingForVoice(true);
      waitingForVoiceRef.current = true; // keep ref in sync instantly


    } catch (error) {
      console.error('❌ Auto voice detection failed:', error);
      setWaitingForVoice(false);
    }
  };




  const startEnhancedVoiceMonitoring = async () => {
    // ❌ Don't rely on audioInitialized state; use the helper
    if (!(await waitForAudioReady())) {
      console.error('❌ Cannot start voice monitoring - audio not ready (after wait)');
      return;
    }

    console.log('🎯 Starting enhanced voice monitoring');
    setWaitingForVoice(true);

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    let consecutiveDetections = 0;
    let lastLogTime = 0;

    const DETECTION_THRESHOLD = 8;
    const VOICE_THRESHOLD = AUDIO_CONFIG.SILENCE_THRESHOLD * AUDIO_CONFIG.VOICE_DETECTION_SENSITIVITY;

    // 🔒 Ensure we don't have a leftover RAF from a previous loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const monitorVoice = () => {
      if (!waitingForVoiceRef.current) {
        console.log('🛑 Voice monitoring stopped');
        return;
      }
      if (isRecording || isAIPlaying) {
        // Yield instead of exiting; try again next frame
        animationFrameRef.current = requestAnimationFrame(monitorVoice);
        return;
      }


      try {
        analyserRef.current.getByteFrequencyData(dataArray);

        const avgVolume = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const maxVolume = Math.max(...dataArray);
        const normalizedAvg = avgVolume / 255;
        const normalizedMax = maxVolume / 255;
        const combinedLevel = Math.max(normalizedAvg, normalizedMax * 0.6);

        setAudioLevel(combinedLevel);

        const isVoiceDetected = combinedLevel > VOICE_THRESHOLD;

        // Log periodically
        const now = Date.now();
        if (now - lastLogTime > 2000 || isVoiceDetected) {
          console.log(`🎤 Voice level: ${Math.round(combinedLevel * 100)}% | Detected: ${isVoiceDetected}`);
          lastLogTime = now;
        }

        if (isVoiceDetected) {
          consecutiveDetections++;
          if (consecutiveDetections >= DETECTION_THRESHOLD) {
            console.log('🗣️ STABLE VOICE DETECTED - Starting recording');
            setWaitingForVoice(false);

            if (noVoiceTimeoutRef.current) {
              clearInterval(noVoiceTimeoutRef.current);
              noVoiceTimeoutRef.current = null;
            }

            setTimeout(startEnhancedRecording, 50);
            return;
          }
        } else {
          consecutiveDetections = Math.max(0, consecutiveDetections - 2);
        }

        animationFrameRef.current = requestAnimationFrame(monitorVoice);

      } catch (error) {
        console.error('❌ Voice monitoring error:', error);
        setWaitingForVoice(false);
      }
    };

    animationFrameRef.current = requestAnimationFrame(monitorVoice);
  };

  const startEnhancedRecording = async () => {
    try {
      console.log('🎤 Starting enhanced recording');

      if (isRecording || !streamRef.current?.active) {
        console.log('🚫 Cannot start recording - system not ready');
        return;
      }

      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = handleRecordingComplete;
      mediaRecorder.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error);
        setIsRecording(false);
        setIsListening(false);
      };

      mediaRecorder.start(200);
      mediaRecorderRef.current = mediaRecorder;

      setIsRecording(true);
      setIsListening(true);
      setWaitingForVoice(false);

      setTimeout(startEnhancedSilenceDetection, 100);

      // Safety timeout
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          console.log('⏰ Max recording time reached');
          stopRecording();
        }
      }, AUDIO_CONFIG.MAX_RECORDING_TIME);

    } catch (error) {
      console.error('❌ Enhanced recording failed:', error);
      setIsRecording(false);
      setIsListening(false);
    }
  };

  const startEnhancedSilenceDetection = () => {
    if (!analyserRef.current) return;

    console.log('🔇 Starting enhanced silence detection');

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    let speechStartTime = null;
    let currentSilenceStart = null;
    let hasSpokeEnough = false;
    let consecutiveSilenceChecks = 0;
    let consecutiveSpeechChecks = 0;

    const SPEECH_THRESHOLD = AUDIO_CONFIG.SILENCE_THRESHOLD * 0.7;
    const SILENCE_THRESHOLD = AUDIO_CONFIG.SILENCE_THRESHOLD * 0.9;
    const MIN_SILENCE_CHECKS = 20;
    const MIN_SPEECH_CHECKS = 10;

    const detectSilenceAndSpeech = () => {
      if (!isRecording || mediaRecorderRef.current?.state !== 'recording') {
        console.log('🛑 Silence detection stopped');
        return;
      }

      try {
        analyserRef.current.getByteFrequencyData(dataArray);

        const avgVolume = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const maxVolume = Math.max(...dataArray);
        const normalizedAvg = avgVolume / 255;
        const normalizedMax = maxVolume / 255;
        const currentLevel = Math.max(normalizedAvg, normalizedMax * 0.7);

        setAudioLevel(currentLevel);

        const isSpeaking = currentLevel > SPEECH_THRESHOLD;
        const isSilent = currentLevel < SILENCE_THRESHOLD;

        if (isSpeaking) {
          consecutiveSpeechChecks++;
          consecutiveSilenceChecks = 0;
          currentSilenceStart = null;
          setSilenceTimer(0);

          if (!speechStartTime && consecutiveSpeechChecks >= MIN_SPEECH_CHECKS) {
            speechStartTime = Date.now();
            console.log('🗣️ Speech started - consistent voice detected');
          }

          if (speechStartTime && !hasSpokeEnough) {
            const speechDuration = Date.now() - speechStartTime;
            if (speechDuration >= AUDIO_CONFIG.MIN_SPEECH_TIME) {
              hasSpokeEnough = true;
              console.log('✅ Minimum speech duration reached');
            }
          }
        } else if (isSilent && hasSpokeEnough) {
          consecutiveSpeechChecks = 0;
          consecutiveSilenceChecks++;

          if (!currentSilenceStart && consecutiveSilenceChecks >= MIN_SILENCE_CHECKS) {
            currentSilenceStart = Date.now();
            console.log('🔇 Silence started after speech');
          }

          if (currentSilenceStart) {
            const silenceElapsed = Date.now() - currentSilenceStart;
            setSilenceTimer(silenceElapsed);

            if (silenceElapsed >= AUDIO_CONFIG.SILENCE_DURATION) {
              console.log('⏹️ Auto-stopping due to silence');
              stopRecording();
              return;
            }
          }
        } else {
          // Intermediate levels - gradual decay
          if (consecutiveSpeechChecks > 0) consecutiveSpeechChecks--;
          if (consecutiveSilenceChecks > 0) consecutiveSilenceChecks--;
        }

        animationFrameRef.current = requestAnimationFrame(detectSilenceAndSpeech);

      } catch (error) {
        console.error('❌ Silence detection error:', error);
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(detectSilenceAndSpeech);
  };

  const stopRecording = () => {
    try {
      console.log('⏹️ Stopping recording');

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (mediaRecorderRef.current) {
        const currentState = mediaRecorderRef.current.state;
        if (currentState === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }

      setIsRecording(false);
      setIsListening(false);
      setWaitingForVoice(false);
      setSilenceTimer(0);
      setAudioLevel(0);
      setNoVoiceTimer(0);

    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      setIsRecording(false);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    console.log('🛑 Stopping all voice detection and recording');

    setWaitingForVoice(false);
    setNoVoiceTimer(0);
    setAudioLevel(0);

    if (noVoiceTimeoutRef.current) {
      clearInterval(noVoiceTimeoutRef.current);
      noVoiceTimeoutRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    stopRecording();
  };

  const handleRecordingComplete = async () => {
    try {
      console.log('🎵 Processing recorded audio');

      if (audioChunksRef.current.length === 0) {
        console.warn('⚠️ No audio chunks recorded');
        return;
      }

      const audioBlob = new Blob(audioChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || 'audio/webm'
      });

      if (audioBlob.size < 100) {
        console.warn('⚠️ Audio file too small');
        return;
      }

      console.log('📤 Processing audio for WebSocket transmission');
      const audioMessage = await processAudioForWebSocket(audioBlob);

      if (currentSessionId && getWebSocketState(currentSessionId) === 'open') {
        sendWebSocketMessage(currentSessionId, audioMessage);
        console.log('✅ Audio sent to server');
        awaitingServerAnswerRef.current = true;
        setTimeout(() => {
          if (awaitingServerAnswerRef.current && getWebSocketState(currentSessionId) === 'open') {
            console.log('⏳ No AI answer yet, asking server to proceed');
            // Ask server to continue (server should treat as "advance/answer this")
            sendWebSocketMessage(currentSessionId, { type: 'next_question' });
          }
        }, 8000);
      } else {
        console.error('❌ WebSocket not connected');
        setConnectionError('Connection lost. Please refresh.');
      }

    } catch (error) {
      console.error('❌ Audio processing failed:', error);
      setConnectionError(`Audio processing failed: ${error.message}`);
    }
  };

  const playAudioChunk = async (hexAudio) => {
    try {
      if (!hexAudio || !audioContextRef.current || !gainNodeRef.current) {
        console.warn('⚠️ Cannot play audio - missing data or context');
        return;
      }

      const audioData = new Uint8Array(
        hexAudio.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );

      if (audioData.length === 0) return;

      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.buffer.slice());
      audioQueueRef.current.push(audioBuffer);

      if (!isPlayingAudioRef.current) {
        playNextInQueue();
      }

    } catch (error) {
      console.error('❌ Audio chunk play error:', error);
    }
  };

  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current || !gainNodeRef.current) {
      isPlayingAudioRef.current = false;
      return;
    }

    const buffer = audioQueueRef.current.shift();
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = AUDIO_CONFIG.AI_SPEECH_RATE;
    source.connect(gainNodeRef.current);

    currentAudioRef.current = source;
    isPlayingAudioRef.current = true;

    source.onended = () => {
      currentAudioRef.current = null;
      isPlayingAudioRef.current = false;
      setAiSpeechProgress(prev => Math.min(prev + 15, 95));

      if (audioQueueRef.current.length > 0) {
        playNextInQueue();
      } else {
        setAiSpeechProgress(100);
      }
    };

    source.start();
  };

  const requestNextQuestion = () => {
    if (awaitingNextQuestionRef.current) {
      console.log('⏳ Already waiting for next question');
      return;
    }
    awaitingNextQuestionRef.current = true;

    console.log('📤 Requesting next question - no voice detected');

    setWaitingForVoice(false);
    waitingForVoiceRef.current = false;
    setNoVoiceTimer(0);
    setAudioLevel(0);

    if (noVoiceTimeoutRef.current) {
      clearInterval(noVoiceTimeoutRef.current);
      noVoiceTimeoutRef.current = null;
    }

    if (currentSessionId && getWebSocketState(currentSessionId) === 'open') {
      sendWebSocketMessage(currentSessionId, {
        type: 'no_response',
        message: 'No voice detected within timeout period'
      });

      // Backstop: if no ai_response arrives in 3s, explicitly ask for next
      setTimeout(() => {
        if (awaitingNextQuestionRef.current) {
          sendWebSocketMessage(currentSessionId, { type: 'next_question' });
        }
      }, 3000);
    }
  };


  // Camera functions
  const getCameraDevices = async () => {
    try {
      console.log('📹 Getting camera devices');

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Media devices not supported');
      }

      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter(device => device.kind === 'videoinput');

      if (videoDevices.length > 0 && !videoDevices[0].label) {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false
        });

        tempStream.getTracks().forEach(track => track.stop());
        await new Promise(resolve => setTimeout(resolve, 100));

        devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter(device => device.kind === 'videoinput');
      }

      setAvailableCameras(videoDevices);
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId);
      }

      return videoDevices;

    } catch (error) {
      console.error('❌ Camera devices error:', error);
      setCameraError(`Camera access failed: ${error.message}`);
      setCameraPermissionDenied(true);
      return [];
    }
  };

  const startCamera = async (deviceId = null) => {
    setCameraInitializing(true);
    setCameraError(null);

    try {
      console.log('📹 Starting camera');

      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
        videoStreamRef.current = null;
        setVideoStream(null);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const constraints = {
        video: {
          width: { ideal: CAMERA_CONFIG.VIDEO_WIDTH },
          height: { ideal: CAMERA_CONFIG.VIDEO_HEIGHT },
          frameRate: { ideal: CAMERA_CONFIG.FRAME_RATE },
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' })
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];

      if (!videoTrack) {
        throw new Error('No video track obtained');
      }

      videoStreamRef.current = stream;
      setVideoStream(stream);
      setCameraEnabled(true);
      setCameraPermissionDenied(false);

      console.log('✅ Camera started successfully');

    } catch (error) {
      console.error('❌ Camera start failed:', error);
      setCameraError(error.message);
      setCameraEnabled(false);

      if (error.name === 'NotAllowedError') {
        setCameraPermissionDenied(true);
      }
    } finally {
      setCameraInitializing(false);
    }
  };

  const stopCamera = () => {
    try {
      console.log('📹 Stopping camera');

      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
        videoStreamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.pause();
        videoRef.current.load();
      }

      setVideoStream(null);
      setCameraEnabled(false);
      setCameraInitializing(false);
      setCameraError(null);

    } catch (error) {
      console.error('❌ Camera stop error:', error);
    }
  };

  const switchCamera = async () => {
    if (availableCameras.length <= 1) return;

    const currentIndex = availableCameras.findIndex(camera => camera.deviceId === selectedCamera);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCamera = availableCameras[nextIndex];

    setSelectedCamera(nextCamera.deviceId);
    await startCamera(nextCamera.deviceId);
  };

  // Video element setup
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !videoStream) return;

    const setupVideo = async () => {
      try {
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
          videoElement.pause();
          videoElement.load();
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        videoElement.srcObject = videoStream;
        videoElement.muted = true;
        videoElement.playsInline = true;
        videoElement.autoplay = true;

        const metadataPromise = new Promise((resolve) => {
          if (videoElement.readyState >= 1) {
            resolve();
          } else {
            const onMetadata = () => {
              videoElement.removeEventListener('loadedmetadata', onMetadata);
              resolve();
            };
            videoElement.addEventListener('loadedmetadata', onMetadata);
          }
        });

        await metadataPromise;
        await videoElement.play();
        console.log('✅ Video playing successfully');

      } catch (error) {
        console.error('❌ Video setup error:', error);
      }
    };

    setupVideo();
  }, [videoStream]);

  // Auto-start camera when interview begins
  useEffect(() => {
    if (interviewStarted && !cameraEnabled && !cameraInitializing) {
      console.log('🎯 Auto-starting camera for interview');
      if (availableCameras.length === 0) {
        getCameraDevices().then(() => startCamera());
      } else {
        startCamera();
      }
    }
  }, [interviewStarted, cameraEnabled, cameraInitializing]);

  // Interview control functions
  const handleEndInterviewClick = () => {
    setShowEndConfirmation(true);
  };

  const confirmEndInterview = async () => {
    setShowEndConfirmation(false);
    setIsEndingInterview(true);

    try {
      await stopInterview();
    } catch (error) {
      console.error('❌ Error ending interview:', error);
    } finally {
      setIsEndingInterview(false);
    }
  };

  const stopInterview = async () => {
    console.log('🛑 Manually stopping interview');

    try {
      setInterviewStarted(false);
      setIsConnecting(false);
      setIsConnected(false);

      stopListening();
      if (cameraEnabled) stopCamera();

      if (currentSessionId && getWebSocketState(currentSessionId) === 'open') {
        sendWebSocketMessage(currentSessionId, {
          type: 'manual_stop',
          reason: 'user_initiated',
          timestamp: Date.now()
        });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      cleanup();
      closeWebSocket(currentSessionId);

      setTimeout(() => {
        navigate('/student/mock-interviews', {
          state: { message: 'Interview ended by user', type: 'info' }
        });
      }, 1000);

    } catch (error) {
      console.error('❌ Stop interview error:', error);
      setTimeout(() => {
        navigate('/student/mock-interviews');
      }, 1000);
    }
  };

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up resources');

    stopListening();
    stopCamera();

    [keepAliveIntervalRef, reconnectTimeoutRef, aiSpeechTimeoutRef,
      silenceTimeoutRef, noVoiceTimeoutRef, pingIntervalRef].forEach(ref => {
        if (ref.current) {
          clearInterval(ref.current);
          clearTimeout(ref.current);
          ref.current = null;
        }
      });

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;

  }, []);

  // Helper functions
  const getStageColor = (stage) => {
    const colors = {
      greeting: 'primary',
      technical: 'warning',
      communication: 'info',
      hr: 'success'
    };
    return colors[stage] || 'default';
  };

  const getStageLabel = (stage) => {
    const labels = {
      greeting: 'Introduction',
      technical: 'Technical Assessment',
      communication: 'Communication Skills',
      hr: 'Behavioral Questions'
    };
    return labels[stage] || 'Interview';
  };

  const handleHeadphoneConfirm = () => {
    setShowHeadphoneWarning(false);
    initializeCompleteSystem();
  };

  const handleHeadphoneSkip = () => {
    setShowHeadphoneWarning(false);
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('skip_headphone_check', 'true');
    window.history.replaceState({}, '', newUrl);
    initializeCompleteSystem();
  };

  const handleSystemCheck = () => {
    setShowSystemCheck(true);
  };

  // Render headphone warning dialog
  if (showHeadphoneWarning) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Dialog open={true} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ textAlign: 'center', pb: 2 }}>
            <Headset sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
            <Typography variant="h5" component="div">
              🎧 Headphones Strongly Recommended
            </Typography>
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body1" gutterBottom>
                <strong>For the best interview experience:</strong>
              </Typography>
              <Typography variant="body2">
                The AI will speak questions aloud, and your microphone will record responses.
                Without headphones, audio feedback/echo may occur.
              </Typography>
            </Alert>

            <Typography variant="h6" gutterBottom color="primary">
              ✅ Recommended Setup:
            </Typography>
            <Typography variant="body2" component="div" sx={{ ml: 2, mb: 2 }}>
              • <strong>Best:</strong> Wired headphones with microphone<br />
              • <strong>Good:</strong> Over-ear headphones + separate mic<br />
              • <strong>Acceptable:</strong> Earbuds<br />
              • <strong>Backup:</strong> Bluetooth headphones (may have delay)
            </Typography>

            <Typography variant="h6" gutterBottom color="error">
              ❌ Will Cause Echo:
            </Typography>
            <Typography variant="body2" component="div" sx={{ ml: 2 }}>
              • Computer/laptop speakers<br />
              • External speakers<br />
              • Any speakers your microphone can hear
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 3, justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              onClick={handleHeadphoneConfirm}
              startIcon={<Headset />}
              sx={{ minWidth: 200 }}
            >
              I Have Headphones Ready
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={handleHeadphoneSkip}
              color="warning"
              sx={{ minWidth: 200 }}
            >
              Continue Without (Risky)
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    );
  }

  // Render connection/loading state
  if (isConnecting) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box textAlign="center">
          <CircularProgress size={60} sx={{ mb: 3 }} />
          <Typography variant="h5" gutterBottom>
            {reconnectAttempts > 0
              ? `Reconnecting... (${reconnectAttempts}/${WEBSOCKET_CONFIG.RECONNECT_ATTEMPTS})`
              : 'Connecting to AI Interview System...'
            }
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Setting up enhanced audio system, camera, and AI connection
          </Typography>

          {reconnectAttempts > 0 && (
            <LinearProgress sx={{ mt: 2, maxWidth: 400, mx: 'auto' }} />
          )}
        </Box>
      </Container>
    );
  }

  // Render connection error
  if (connectionError) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="h6">Connection Error</Typography>
          <Typography variant="body2">{connectionError}</Typography>
        </Alert>

        <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => navigate('/student/mock-interviews')}
          >
            Back to Dashboard
          </Button>
          <Button
            variant="contained"
            startIcon={<Refresh />}
            onClick={() => window.location.reload()}
          >
            Retry Connection
          </Button>
          <Button
            variant="outlined"
            startIcon={<Settings />}
            onClick={handleSystemCheck}
          >
            System Check
          </Button>
        </Box>

        {/* System Check Dialog */}
        <Dialog open={showSystemCheck} onClose={() => setShowSystemCheck(false)} maxWidth="md" fullWidth>
          <DialogTitle>🔧 System Diagnostics</DialogTitle>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>🌐 Connection Status</Typography>
                  <Chip
                    label={`WebSocket: ${isConnected ? 'Connected' : 'Disconnected'}`}
                    color={isConnected ? 'success' : 'error'}
                    sx={{ mb: 1, mr: 1 }}
                  />
                  <Chip
                    label={`Backend: ${systemReady ? 'Ready' : 'Not Ready'}`}
                    color={systemReady ? 'success' : 'error'}
                  />
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>🎤 Audio System</Typography>
                  <Chip
                    label={`Audio: ${audioInitialized ? 'Ready' : 'Not Ready'}`}
                    color={audioInitialized ? 'success' : 'error'}
                    sx={{ mb: 1, mr: 1 }}
                  />
                  <Chip
                    label={`Stream: ${streamRef.current?.active ? 'Active' : 'Inactive'}`}
                    color={streamRef.current?.active ? 'success' : 'error'}
                  />
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>📹 Camera System</Typography>
                  <Chip
                    label={`Camera: ${cameraEnabled ? 'Active' : 'Inactive'}`}
                    color={cameraEnabled ? 'success' : 'default'}
                    sx={{ mb: 1, mr: 1 }}
                  />
                  <Chip
                    label={`Devices: ${availableCameras.length} found`}
                    color={availableCameras.length > 0 ? 'success' : 'warning'}
                  />
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>📊 Interview Status</Typography>
                  <Chip
                    label={`Session: ${currentSessionId ? 'Available' : 'Missing'}`}
                    color={currentSessionId ? 'success' : 'error'}
                    sx={{ mb: 1, mr: 1 }}
                  />
                  <Chip
                    label={`Test ID: ${testId ? 'Available' : 'Missing'}`}
                    color={testId ? 'success' : 'error'}
                  />
                </Paper>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowSystemCheck(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Container>
    );
  }

  // Main interview interface
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" color="primary.main">
            🎤📹 Enhanced AI Interview
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {studentName} • Advanced Voice + Video Interview
          </Typography>
        </Box>

        <Box display="flex" alignItems="center" gap={2}>
          <Chip
            label={`${getStageLabel(currentStage)} (Q${questionNumber || 1})`}
            color={getStageColor(currentStage)}
          />
          <Chip
            icon={isConnected ? <RadioButtonChecked /> : <Circle />}
            label={isConnected ? 'Connected' : 'Disconnected'}
            color={isConnected ? 'success' : 'error'}
          />
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Left Column - Camera and Controls */}
        <Grid item xs={12} md={6}>
          {/* Camera Card */}
          <Card sx={{ mb: 3, borderRadius: 3, boxShadow: 4 }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Typography variant="h6" color="primary">
                  📹 Camera View
                  {interviewStarted && (
                    <Typography component="span" variant="caption" color="error.main" sx={{ ml: 1 }}>
                      (Required for Interview)
                    </Typography>
                  )}
                </Typography>

                <Box display="flex" gap={1}>
                  {!interviewStarted && (
                    <Tooltip title={cameraEnabled ? "Stop Camera" : "Start Camera"}>
                      <IconButton
                        onClick={() => cameraEnabled ? stopCamera() : startCamera()}
                        color={cameraEnabled ? "error" : "primary"}
                        disabled={cameraInitializing}
                      >
                        {cameraInitializing ? (
                          <CircularProgress size={24} />
                        ) : cameraEnabled ? (
                          <VideocamOff />
                        ) : (
                          <Videocam />
                        )}
                      </IconButton>
                    </Tooltip>
                  )}

                  {availableCameras.length > 1 && (
                    <Tooltip title="Switch Camera">
                      <IconButton
                        onClick={switchCamera}
                        disabled={!cameraEnabled || cameraInitializing || interviewStarted}
                        color="primary"
                      >
                        <Cameraswitch />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>

              {/* Video Container */}
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  height: 350,
                  backgroundColor: 'black',
                  borderRadius: 3,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: interviewStarted && !cameraEnabled ? '3px solid red' : 'none'
                }}
              >
                {cameraEnabled && videoStream && !cameraInitializing ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      background: '#111'
                    }}
                  />
                ) : (
                  <Box textAlign="center" color="white" sx={{ p: 3 }}>
                    {cameraInitializing ? (
                      <Fade in={true}>
                        <Box>
                          <CircularProgress size={60} sx={{ mb: 2, color: 'white' }} />
                          <Typography variant="h6" gutterBottom>
                            Starting Camera...
                          </Typography>
                          <Typography variant="body2" sx={{ opacity: 0.8 }}>
                            Please wait while we access your camera
                          </Typography>
                        </Box>
                      </Fade>
                    ) : (
                      <Box>
                        <Videocam sx={{ fontSize: 80, mb: 2, opacity: 0.6 }} />
                        <Typography variant="h6" gutterBottom>
                          {cameraError ? 'Camera Error' :
                            interviewStarted ? 'Camera Required!' : 'Camera Ready'}
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.7, maxWidth: 300, mx: 'auto' }}>
                          {cameraError ? cameraError :
                            interviewStarted ? 'Video recording is mandatory for this interview' :
                              'Camera will automatically start when interview begins'}
                        </Typography>
                        {cameraError && (
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => startCamera()}
                            sx={{ mt: 2 }}
                            startIcon={<Refresh />}
                          >
                            Retry Camera
                          </Button>
                        )}
                      </Box>
                    )}
                  </Box>
                )}

                {/* Recording Indicator */}
                {isRecording && cameraEnabled && (
                  <Zoom in={true}>
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 15,
                        right: 15,
                        backgroundColor: 'error.main',
                        color: 'white',
                        px: 2,
                        py: 1,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        animation: 'pulse 1.5s infinite',
                        '@keyframes pulse': {
                          '0%': { opacity: 1 },
                          '50%': { opacity: 0.7 },
                          '100%': { opacity: 1 }
                        }
                      }}
                    >
                      <Circle sx={{ fontSize: 12 }} />
                      <Typography variant="caption" fontWeight="bold">
                        RECORDING
                      </Typography>
                    </Box>
                  </Zoom>
                )}

                {/* Interview Status Badge */}
                {interviewStarted && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 15,
                      left: 15,
                      backgroundColor: cameraEnabled ? 'success.main' : 'error.main',
                      color: 'white',
                      px: 2,
                      py: 1,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1
                    }}
                  >
                    <Typography variant="caption" fontWeight="bold">
                      {cameraEnabled ? '✅ LIVE' : '❌ CAMERA REQUIRED'}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Camera Status Chips */}
              <Box mt={2} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <Chip
                  label={`Camera: ${cameraInitializing ? 'Starting...' : cameraEnabled ? 'Active' : interviewStarted ? 'Required!' : 'Ready'}`}
                  color={cameraInitializing ? 'info' : cameraEnabled ? 'success' : interviewStarted ? 'error' : 'default'}
                  size="small"
                />
                {availableCameras.length > 0 && (
                  <Chip
                    label={`${availableCameras.length} camera(s) available`}
                    color="info"
                    size="small"
                  />
                )}
              </Box>

              {/* Camera Error Alerts */}
              {interviewStarted && !cameraEnabled && !cameraInitializing && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>⚠️ CAMERA REQUIRED!</strong><br />
                    Video recording is mandatory during the interview. Please ensure camera permissions are granted.
                  </Typography>
                </Alert>
              )}

              {cameraPermissionDenied && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Camera Access Denied</strong><br />
                    Please allow camera access in your browser settings and refresh the page.
                  </Typography>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Interview Control Panel */}
          <Paper
            elevation={6}
            sx={{
              p: 4,
              textAlign: 'center',
              borderRadius: 4,
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
              border: '2px solid',
              borderColor: isAIPlaying ? 'primary.light' :
                isListening ? 'success.light' :
                  waitingForVoice ? 'warning.light' : 'grey.300'
            }}
          >
            {!interviewStarted ? (
              <Box>
                <Typography variant="h5" gutterBottom>
                  Connecting to AI Interviewer...
                </Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                  Please wait while we establish the connection and set up your systems.
                </Typography>
                <CircularProgress size={50} />

                {cameraInitializing && (
                  <Typography variant="body2" color="primary" sx={{ mt: 2 }}>
                    📹 Setting up camera for video recording...
                  </Typography>
                )}
              </Box>
            ) : (
              <Box>
                {/* AI Status Indicator */}
                <Box sx={{ mb: 4 }}>
                  <Box display="flex" alignItems="center" justifyContent="center" gap={2} mb={2}>
                    <Avatar
                      sx={{
                        width: 80,
                        height: 80,
                        backgroundColor: isAIPlaying ? 'primary.light' :
                          isListening ? 'success.light' :
                            waitingForVoice ? 'warning.light' : 'grey.300',
                        animation: (isListening || waitingForVoice) ? 'pulse 2s infinite' : 'none',
                        '@keyframes pulse': {
                          '0%': { transform: 'scale(1)', boxShadow: 'none' },
                          '50%': { transform: 'scale(1.1)', boxShadow: '0 0 20px rgba(0,0,0,0.3)' },
                          '100%': { transform: 'scale(1)', boxShadow: 'none' }
                        }
                      }}
                    >
                      {isAIPlaying ? (
                        <VolumeUp sx={{ fontSize: 40, color: 'primary.main' }} />
                      ) : isListening ? (
                        <Mic sx={{ fontSize: 40, color: 'success.main' }} />
                      ) : waitingForVoice ? (
                        <Psychology sx={{ fontSize: 40, color: 'warning.main' }} />
                      ) : (
                        <MicOff sx={{ fontSize: 40, color: 'grey.600' }} />
                      )}
                    </Avatar>
                  </Box>

                  <Typography variant="h5" gutterBottom fontWeight="bold">
                    {isAIPlaying ? '🤖 AI Speaking - Please Listen Carefully' :
                      isListening ? '🎤 Recording Your Response...' :
                        waitingForVoice ? '🎯 Waiting for Your Voice...' :
                          '⏸️ Ready for Your Response'}
                  </Typography>

                  <Typography variant="body1" color="text.secondary">
                    {isAIPlaying ? 'The AI interviewer is asking you a question' :
                      isListening ? 'Speak naturally - recording will auto-stop after silence' :
                        waitingForVoice ? 'Start speaking anytime to begin recording' :
                          'System ready for next interaction'}
                  </Typography>
                </Box>

                {/* Auto Next Question Timer */}
                {waitingForVoice && (
                  <Fade in={true}>
                    <Box sx={{ maxWidth: 450, mx: 'auto', mb: 3 }}>
                      <Typography variant="subtitle1" gutterBottom color="warning.main" fontWeight="bold">
                        ⏰ Auto Next Question Timer
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={(noVoiceTimer / AUDIO_CONFIG.NO_VOICE_TIMEOUT) * 100}
                        color="warning"
                        sx={{ height: 12, borderRadius: 6, mb: 1 }}
                      />
                      <Typography variant="body2" color="warning.main">
                        Next question in: {Math.max(0, Math.round((AUDIO_CONFIG.NO_VOICE_TIMEOUT - noVoiceTimer) / 1000))}s
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        Start speaking to begin recording automatically
                      </Typography>
                    </Box>
                  </Fade>
                )}

                {/* Voice Level Detection */}
                {(isListening || waitingForVoice) && (
                  <Box sx={{ maxWidth: 450, mx: 'auto', mb: 3 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      🎤 Voice Level Detection
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(audioLevel * 100, 100)}
                      color={audioLevel > AUDIO_CONFIG.SILENCE_THRESHOLD ? "success" : "info"}
                      sx={{ height: 12, borderRadius: 6, mb: 1 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {audioLevel > AUDIO_CONFIG.SILENCE_THRESHOLD ? '🗣️ Speaking Detected' : '🔇 Waiting for Speech'}
                      ({Math.round(audioLevel * 100)}%)
                    </Typography>
                  </Box>
                )}

                {/* Silence Timer */}
                {silenceTimer > 0 && isListening && (
                  <Fade in={true}>
                    <Box sx={{ mt: 2, maxWidth: 450, mx: 'auto' }}>
                      <Typography variant="subtitle1" gutterBottom color="warning.main" fontWeight="bold">
                        ⏱️ Auto-Submit Countdown
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={(silenceTimer / AUDIO_CONFIG.SILENCE_DURATION) * 100}
                        color="warning"
                        sx={{ height: 10, borderRadius: 5, mb: 1 }}
                      />
                      <Typography variant="body2" color="warning.main">
                        Submitting in: {Math.max(0, Math.round((AUDIO_CONFIG.SILENCE_DURATION - silenceTimer) / 1000))}s
                      </Typography>
                    </Box>
                  </Fade>
                )}

                {/* End Interview Button */}
                <Box sx={{ mt: 4 }}>
                  <Fab
                    variant="extended"
                    color="error"
                    size="large"
                    onClick={handleEndInterviewClick}
                    disabled={isEndingInterview || !interviewStarted}
                    sx={{
                      px: 4,
                      py: 1.5,
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      boxShadow: 6,
                      '&:hover': {
                        boxShadow: 8,
                        transform: 'translateY(-2px)'
                      }
                    }}
                  >
                    {isEndingInterview ? (
                      <>
                        <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                        Ending Interview...
                      </>
                    ) : (
                      <>
                        <Stop sx={{ mr: 1 }} />
                        End Interview
                      </>
                    )}
                  </Fab>
                </Box>

                {/* Status Alerts */}
                <Box sx={{ mt: 3 }}>
                  {isAIPlaying && (
                    <Alert severity="info" sx={{ borderRadius: 3, mb: 1 }}>
                      <Typography variant="body2">
                        🎧 <strong>Listen carefully!</strong> The AI is asking you a question.
                        Recording will start automatically when you begin speaking.
                      </Typography>
                    </Alert>
                  )}

                  {waitingForVoice && (
                    <Alert severity="warning" sx={{ borderRadius: 3, mb: 1 }}>
                      <Typography variant="body2">
                        🎯 <strong>Start speaking anytime!</strong> The system is listening for your voice.
                        Recording begins automatically when you start talking.
                      </Typography>
                    </Alert>
                  )}

                  {isListening && !isAIPlaying && (
                    <Alert severity="success" sx={{ borderRadius: 3, mb: 1 }}>
                      <Typography variant="body2">
                        🎤 <strong>Recording in progress!</strong> Speak naturally.
                        The system will automatically stop after you finish speaking.
                      </Typography>
                    </Alert>
                  )}

                  {interviewStarted && !cameraEnabled && (
                    <Alert severity="error" sx={{ borderRadius: 3 }}>
                      <Typography variant="body2">
                        📹 <strong>Camera Required!</strong> Please enable your camera for video recording.
                        This is mandatory for the interview process.
                      </Typography>
                    </Alert>
                  )}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Right Column - AI Response and System Status */}
        <Grid item xs={12} md={6}>
          {/* AI Response Card */}
          {currentMessage && (
            <Card sx={{ mb: 3, borderRadius: 3, boxShadow: 4 }}>
              <CardContent>
                <Box display="flex" alignItems="flex-start" gap={2}>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    <AutoAwesome />
                  </Avatar>
                  <Box flex={1}>
                    <Typography variant="h6" color="primary" gutterBottom>
                      🤖 AI Interviewer
                    </Typography>
                    <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.6 }}>
                      {currentMessage}
                    </Typography>

                    {isAIPlaying && (
                      <Box>
                        <LinearProgress
                          variant="determinate"
                          value={aiSpeechProgress}
                          color="primary"
                          sx={{ height: 8, borderRadius: 4, mb: 1 }}
                        />
                        <Typography variant="caption" color="primary" display="flex" alignItems="center" gap={1}>
                          <VolumeUp fontSize="small" />
                          AI is speaking... ({Math.round(aiSpeechProgress)}%)
                        </Typography>
                      </Box>
                    )}

                    {!isAIPlaying && interviewStarted && (
                      <Alert severity="success" variant="outlined" sx={{ mt: 1 }}>
                        <Typography variant="caption">
                          ✅ AI finished speaking - Auto voice detection is now active!
                        </Typography>
                      </Alert>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Enhanced System Status Card */}
          <Card sx={{ bgcolor: 'grey.50', borderRadius: 3, boxShadow: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AutoAwesome />
                Enhanced AI Interview System
              </Typography>

              {/* System Status Chips */}
              <Box display="flex" gap={1} flexWrap="wrap" mb={3}>
                <Chip
                  icon={isAIPlaying ? <VolumeUp /> : isListening ? <Mic /> : waitingForVoice ? <Psychology /> : <Circle />}
                  label={`Audio: ${isAIPlaying ? 'AI Speaking' : isListening ? 'Recording' : waitingForVoice ? 'Voice Detection' : 'Standby'}`}
                  color={isAIPlaying ? 'primary' : isListening ? 'success' : waitingForVoice ? 'warning' : 'default'}
                  size="small"
                />
                <Chip
                  icon={cameraInitializing ? <CircularProgress size={16} /> : cameraEnabled ? <Videocam /> : <VideocamOff />}
                  label={`Camera: ${cameraInitializing ? 'Starting...' : cameraEnabled ? 'Recording' : 'Required'}`}
                  color={cameraInitializing ? 'info' : cameraEnabled ? 'success' : interviewStarted ? 'error' : 'default'}
                  size="small"
                />
                <Chip
                  icon={isConnected ? <CheckCircle /> : <ErrorIcon />}
                  label={`WebSocket: ${isConnected ? 'Connected' : 'Disconnected'}`}
                  color={isConnected ? 'success' : 'error'}
                  size="small"
                />
                <Chip
                  icon={waitingForVoice ? <Psychology /> : <Circle />}
                  label={`Auto Voice: ${waitingForVoice ? 'Active' : 'Standby'}`}
                  color={waitingForVoice ? 'warning' : 'default'}
                  size="small"
                />
              </Box>

              {/* How It Works */}
              <Typography variant="body2" component="div" sx={{ lineHeight: 1.6 }}>
                <strong>🎯 How Enhanced AI Interview Works:</strong><br />
                <strong>1. Camera Setup:</strong> Camera starts automatically when interview begins<br />
                <strong>2. AI Speaks:</strong> Listen to AI questions through your headphones<br />
                <strong>3. Auto Detection:</strong> System automatically waits for your voice<br />
                <strong>4. Voice Recording:</strong> Recording starts when you begin speaking<br />
                <strong>5. Video Recording:</strong> Camera records continuously during interview<br />
                <strong>6. Auto Submit:</strong> Response sent after silence detected<br />
                <strong>7. Timeout Protection:</strong> Next question asked if no voice detected<br />
                <strong>8. Seamless Experience:</strong> Everything happens automatically!
              </Typography>

              <Divider sx={{ my: 2 }} />

              {/* System Diagnostics */}
              <Paper sx={{ p: 2, bgcolor: 'white', borderRadius: 2 }}>
                <Typography variant="subtitle2" gutterBottom color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Settings />
                  System Diagnostics
                </Typography>
                <Typography variant="caption" component="div" color="text.secondary">
                  • Audio Context: {audioInitialized ? '✅ Ready' : '❌ Not Ready'}<br />
                  • Microphone Stream: {streamRef.current?.active ? '✅ Active' : '❌ Inactive'}<br />
                  • Camera Stream: {videoStreamRef.current ? '✅ Active' : '❌ Inactive'}<br />
                  • Available Cameras: {availableCameras.length}<br />
                  • Interview Session: {currentSessionId ? '✅ Active' : '❌ Missing'}<br />
                  • Test ID: {testId ? '✅ Available' : '❌ Missing'}<br />
                  • WebSocket State: {getWebSocketState(currentSessionId) || 'Unknown'}
                </Typography>
              </Paper>
            </CardContent>
          </Card>

          {/* Troubleshooting Alerts */}
          {(!streamRef.current?.active || !audioInitialized) && interviewStarted && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              <Typography variant="body2">
                <strong>🚨 Audio System Issues:</strong><br />
                {!streamRef.current?.active && '• Microphone appears inactive'}<br />
                {!audioInitialized && '• Audio system failed to initialize'}<br />
                Please refresh the page and ensure microphone permissions are granted.
              </Typography>
            </Alert>
          )}

          {!videoStreamRef.current && interviewStarted && availableCameras.length > 0 && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              <Typography variant="body2">
                <strong>🚨 Camera System Issues:</strong><br />
                • Camera stream is not active despite available cameras<br />
                • Please refresh the page and ensure camera permissions are granted.
              </Typography>
            </Alert>
          )}

          {availableCameras.length === 0 && interviewStarted && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              <Typography variant="body2">
                <strong>🚨 No Cameras Detected:</strong><br />
                • Please connect a camera and refresh the page<br />
                • Camera access is mandatory for interviews
              </Typography>
            </Alert>
          )}

          {(cameraEnabled || isListening) && (
            <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
              <Typography variant="body2">
                <strong>💡 Performance Tips:</strong><br />
                • Close other applications using camera/microphone<br />
                • Ensure stable internet connection<br />
                • Use wired headphones for best audio quality<br />
                • Keep browser tab active during interview
              </Typography>
            </Alert>
          )}
        </Grid>
      </Grid>

      {/* End Interview Confirmation Dialog */}
      <Dialog
        open={showEndConfirmation}
        onClose={() => setShowEndConfirmation(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 2 }}>
          <Warning sx={{ fontSize: 60, color: 'warning.main', mb: 2 }} />
          <Typography variant="h5" component="div">
            End Interview?
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body1" gutterBottom>
              <strong>Are you sure you want to end the interview?</strong>
            </Typography>
            <Typography variant="body2">
              • This action cannot be undone<br />
              • Your current progress will be saved<br />
              • You'll be redirected to the dashboard<br />
              • The AI interviewer will stop immediately
            </Typography>
          </Alert>

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            If you're having technical issues, try refreshing the page instead of ending the interview.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 3, justifyContent: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setShowEndConfirmation(false)}
            size="large"
            sx={{ minWidth: 150 }}
          >
            Continue Interview
          </Button>

          <Button
            variant="contained"
            color="error"
            onClick={confirmEndInterview}
            size="large"
            startIcon={<Stop />}
            sx={{ minWidth: 150 }}
          >
            Yes, End Interview
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default StartInterview;