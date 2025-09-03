import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  Card,
  CardContent,
  IconButton,
  Button,
  Avatar,
  LinearProgress,
  Chip,
  Fade,
  useTheme,
  alpha,
  styled,
  keyframes,
  Grid,
  Container,

} from '@mui/material';
import {
  Mic,
  VolumeUp,
  ArrowBack,
  CheckCircle,
  RadioButtonChecked,
  Timer,
  PlayArrow,
  Warning,
  RecordVoiceOver,
  Error as ErrorIcon,
  Speed,
  Person,
  SmartToy,
  Headset,
  MicNone,
  Videocam,
  VideocamOff
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { standupCallAPI } from '../../../services/API/studentstandup';


// ==================== ENHANCED STYLED COMPONENTS ====================

const ultraFastPulse = keyframes`
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.8);
  }
  70% {
    transform: scale(1.03);
    box-shadow: 0 0 0 15px rgba(76, 175, 80, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
  }
`;

const fastSpeaking = keyframes`
  0%, 100% { 
    opacity: 1; 
    transform: scale(1);
  }
  50% { 
    opacity: 0.85; 
    transform: scale(1.08);
  }
`;

const ultraFastListening = keyframes`
  0%, 100% { 
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.6);
  }
  50% { 
    transform: scale(1.015);
    box-shadow: 0 0 0 12px rgba(244, 67, 54, 0);
  }
`;



// Animation keyframes
const rippleEffect = keyframes`
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
`;

const pulseBlink = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.90);
    opacity: 0.85;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`;

const MainAvatar = styled(Avatar)(({ theme, status }) => ({
  width: 200,
  height: 200,
  margin: '0 auto',
  marginBottom: theme.spacing(3),
  fontSize: '5rem',
  boxShadow: theme.shadows[16],
  border: `4px solid ${alpha(theme.palette.background.paper, 0.8)}`,
  transition: 'all 0.2s ease-in-out',
  ...(status === 'listening' && {
    animation: `${ultraFastListening} 1.5s infinite`,
    backgroundColor: theme.palette.error.main,
    borderColor: theme.palette.error.light,
  }),
  ...(status === 'speaking' && {
    animation: `${fastSpeaking} 1.2s infinite`,
    backgroundColor: theme.palette.info.main,
    borderColor: theme.palette.info.light,
  }),
  ...(status === 'idle' && {
    animation: `${ultraFastPulse} 2s infinite`,
    backgroundColor: theme.palette.success.main,
    borderColor: theme.palette.success.light,
  }),
  ...(status === 'complete' && {
    backgroundColor: theme.palette.primary.main,
    borderColor: theme.palette.primary.light,
  }),
  ...(status === 'error' && {
    backgroundColor: theme.palette.error.main,
    borderColor: theme.palette.error.dark,
  }),
}));

const StatusCard = styled(Card, {
  shouldForwardProp: (prop) => prop !== 'isActive',
})(({ theme, isActive }) => ({
  borderRadius: 20,
  overflow: 'hidden',
  background: isActive
    ? `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.1)})`
    : `linear-gradient(135deg, ${alpha(theme.palette.grey[100], 0.8)}, ${alpha(theme.palette.grey[50], 0.8)})`,
  border: isActive
    ? `2px solid ${theme.palette.primary.main}`
    : `1px solid ${alpha(theme.palette.grey[300], 0.5)}`,
  boxShadow: isActive ? theme.shadows[8] : theme.shadows[2],
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows[12]
  }
}));




// Enhanced Interview Panel with improved responsiveness and layout
const InterviewPanel = styled(Paper)(({ theme, active, participant }) => ({
  borderRadius: 20,
  padding: theme.spacing(4),
  width: 500,
  minHeight: 400,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'space-between',
  textAlign: 'center',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.3s ease-in-out',
  background: participant === 'ai'
    ? 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)'
    : 'linear-gradient(135deg, #374151 0%, #6b7280 100%)',
  color: '#ffffff',
  border: active ? `3px solid ${theme.palette.success.main}` : '1px solid transparent',
  boxShadow: active
    ? `0 10px 30px ${alpha(theme.palette.success.main, 0.4)}`
    : theme.shadows[4],
  '&::before': active ? {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `radial-gradient(circle at center, ${alpha(theme.palette.success.main, 0.1)} 0%, transparent 70%)`,
    animation: `${rippleEffect} 2s infinite`,
  } : {},
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(3),
    minHeight: 280,
  },
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
    minHeight: 240,
  },
}));

// Adjust ParticipantAvatar for responsive sizing
const ParticipantAvatar = styled(Avatar)(({ theme, size = 120, active }) => {
  const finalSize = size;
  return {
    width: finalSize,
    height: finalSize,
    fontSize: finalSize * 0.4,
    boxShadow: theme.shadows[12],
    border: `4px solid ${alpha('#ffffff', 0.3)}`,
    transition: 'all 0.3s ease-in-out',
    animation: active ? `${pulseBlink} 1.4s ease-in-out infinite` : 'none',
    ...(active && {
      transform: 'scale(1.05)',
      boxShadow: `0 0 30px ${alpha(theme.palette.success.main, 0.6)}`,
    }),
    [theme.breakpoints.down('sm')]: {
      width: 80,
      height: 80,
      fontSize: 32,
    },
  };
});



const StatusIndicator = styled(Box)(({ theme, status }) => ({
  position: 'absolute',
  top: 20,
  left: 20,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  backgroundColor: alpha('#ffffff', 0.2),
  backdropFilter: 'blur(10px)',
  padding: theme.spacing(1, 2),
  borderRadius: 20,
  color: '#ffffff',
  fontSize: '0.875rem',
  fontWeight: 500,
}));

// ==================== MAIN COMPONENT ====================

const StandupCallSession = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();

  // ==================== STATE MANAGEMENT ====================

  const [sessionState, setSessionState] = useState('initializing');
  const [error, setError] = useState(null);
  const [currentMessage, setCurrentMessage] = useState('');
  const [sessionDuration, setSessionDuration] = useState(0);
  const [conversationCount, setConversationCount] = useState(0);
  const [realSessionId, setRealSessionId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [summaryChunks, setSummaryChunks] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);

  // ==================== REFS ====================

  const sessionStartTime = useRef(null);
  const durationTimerRef = useRef(null);
  const isInitialized = useRef(false);
  const processingStartTime = useRef(null);
  const [cameraOn, setCameraOn] = useState(true)
  const videoRef = useRef(null)
  const localStreamRef = useRef(null)
  // ==================== EFFECTS ====================

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      initializeUltraFastSession();
    }

    return () => {
      cleanup();
    };
  }, []);


  useEffect(() => {
    if (cameraOn) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
          localStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.error("Camera access denied:", err);
          setCameraOn(false);
        });
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    }

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraOn]);

  useEffect(() => {
    if (sessionState === 'connecting' && !durationTimerRef.current) {
      sessionStartTime.current = Date.now();
      durationTimerRef.current = setInterval(() => {
        setSessionDuration(Math.floor((Date.now() - sessionStartTime.current) / 1000));
      }, 1000);
    }
  }, [sessionState]);

  // ==================== MAIN FUNCTIONS ====================

  const initializeUltraFastSession = async () => {
    try {
      setSessionState('initializing');
      setError(null);
      setCurrentMessage('Initializing ultra-fast session...');

      console.log('🚀 Initializing ultra-fast standup session...');

      setSessionState('ready');
      setCurrentMessage('Ready to start ultra-fast conversation');

    } catch (error) {
      console.error('❌ Session initialization error:', error);
      setError(error.message);
      setSessionState('error');
    }
  };

  const startUltraFastConversation = async () => {
    try {
      setSessionState('connecting');
      setError(null);
      setCurrentMessage('Connecting to ultra-fast AI backend...');

      console.log('🚀 Starting ultra-fast conversation...');

      const response = await standupCallAPI.startStandup();

      if (!response) {
        throw new Error('No response from backend - check if server is running');
      }

      if (!response.session_id) {
        throw new Error(`Backend response missing session_id: ${JSON.stringify(response)}`);
      }

      setRealSessionId(response.session_id);
      setSummaryChunks(response.summary_chunks || 0);
      setIsConnected(true);
      setSessionState('idle');
      setCurrentMessage('Connected! AI will speak automatically...');
      setConversationCount(0);

      console.log('✅ Ultra-fast conversation started:', {
        testId: response.test_id,
        sessionId: response.session_id,
        summaryChunks: response.summary_chunks
      });

    } catch (error) {
      console.error('❌ Error starting ultra-fast conversation:', error);
      setError(`Backend connection failed: ${error.message}`);
      setSessionState('error');
    }
  };

  // ==================== WEBSOCKET HANDLERS ====================

  const handleWebSocketMessage = (data) => {
    console.log('📨 WebSocket message:', data.type, data.status);

    if (data.type === 'ai_response' && processingStartTime.current) {
      const elapsed = Date.now() - processingStartTime.current;
      setProcessingTime(elapsed);
      console.log(`⚡ AI response time: ${elapsed}ms`);
    }

    switch (data.type) {
      case 'ai_response':
        handleAIResponse(data);
        break;
      case 'audio_chunk':
        break;
      case 'audio_end':
        handleAudioEnd(data);
        break;
      case 'conversation_end':
        handleConversationEnd(data);
        break;
      case 'clarification':
        handleClarificationRequest(data);
        break;
      case 'error':
        handleServerError(data);
        break;
      case 'pong':
        break;
      default:
        console.warn('⚠️ Unknown message type:', data.type);
    }
  };

  const handleAIResponse = (data) => {
    console.log('🤖 AI Response received:', data.text);
    setCurrentMessage(data.text);
    setSessionState('speaking');
    setConversationCount(prev => prev + 1);
    processingStartTime.current = null;
  };

  const handleAudioEnd = (data) => {
    console.log('🎵 Audio ended, voice detection will restart automatically...');
    setTimeout(() => {
      if (sessionState !== 'complete' && sessionState !== 'error') {
        setSessionState('idle');
        setCurrentMessage('Your turn - speak naturally, I\'ll detect when you\'re done');
        processingStartTime.current = Date.now();
      }
    }, 200);
  };

  const handleConversationEnd = (data) => {
    console.log('🏁 Conversation ended');
    setCurrentMessage(data.text || 'Ultra-fast standup completed successfully!');
    setSessionState('complete');

    setTimeout(() => {
      if (realSessionId) {
        navigate(`/student/daily-standups/summary/${realSessionId}`);
      } else if (testId) {
        navigate(`/student/daily-standups/summary/${testId}`);
      }
    }, 2000);
  };

  const handleClarificationRequest = (data) => {
    console.log('❓ AI needs clarification:', data.text);
    setCurrentMessage(data.text);
    setSessionState('speaking');

    setTimeout(() => {
      setSessionState('idle');
      setCurrentMessage('Please speak more clearly');
    }, 1000);
  };

  const handleServerError = (data) => {
    console.error('❌ Server error:', data.text);
    setError(`Backend error: ${data.text}`);
    setSessionState('error');
  };

  const handleWebSocketError = (error) => {
    console.error('❌ WebSocket error:', error);
    setError(`Connection error: ${error.message}`);
    setSessionState('error');
    setIsConnected(false);
  };

  const handleWebSocketClose = (event) => {
    console.log('🔌 WebSocket closed:', event.code, event.reason);
    setIsConnected(false);

    if (sessionState !== 'complete' && event.code !== 1000) {
      setError(`Connection lost: Code ${event.code}, Reason: ${event.reason || 'Unknown'}`);
      setSessionState('error');
    }
  };

  // ==================== UTILITY FUNCTIONS ====================

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusMessage = () => {
    switch (sessionState) {
      case 'initializing':
        return 'Initializing ultra-fast system...';
      case 'ready':
        return 'Ready to start ultra-fast conversation';
      case 'connecting':
        return 'Connecting to AI backend...';
      case 'idle':
        return 'Listening for your voice (800ms detection)';
      case 'listening':
        return 'Recording your response';
      case 'speaking':
        return 'AI is responding';
      case 'processing':
        return 'Processing ultra-fast...';
      case 'complete':
        return 'Ultra-fast standup completed!';
      case 'error':
        return 'Connection Error - Check Backend';
      default:
        return 'Loading...';
    }
  };

  const getStatusIcon = () => {
    switch (sessionState) {
      case 'listening':
        return <Mic fontSize="inherit" />;
      case 'speaking':
        return <VolumeUp fontSize="inherit" />;
      case 'processing':
        return <Speed fontSize="inherit" />;
      case 'complete':
        return <CheckCircle fontSize="inherit" />;
      case 'error':
        return <ErrorIcon fontSize="inherit" />;
      case 'idle':
        return <RecordVoiceOver fontSize="inherit" />;
      default:
        return <RadioButtonChecked fontSize="inherit" />;
    }
  };

  const getStatusColor = () => {
    switch (sessionState) {
      case 'complete':
        return 'success';
      case 'error':
        return 'error';
      case 'listening':
        return 'warning';
      case 'speaking':
        return 'info';
      case 'processing':
        return 'secondary';
      default:
        return 'primary';
    }
  };

  const cleanup = () => {
    console.log('🧹 Cleaning up ultra-fast session...');

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    standupCallAPI.disconnect();
  };

  const handleGoBack = () => {
    cleanup();
    navigate('/student/daily-standups');
  };

  const handleRetry = () => {
    setError(null);
    setSessionState('ready');
    setCurrentMessage('');
    setConversationCount(0);
    setSessionDuration(0);
    setProcessingTime(0);
    setIsConnected(false);
  };

  // ==================== RENDER ====================

  return (
    <Fade in={true}>
      <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        {/* Header */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#ffffff',
            p: 3,
          }}
        >
          <Container maxWidth="xl">
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box display="flex" alignItems="center" gap={2}>
                <IconButton onClick={handleGoBack} sx={{ color: '#ffffff' }}>
                  <ArrowBack />
                </IconButton>
                <Box>
                  <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Ultra-Fast Daily Standup
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.9 }}>
                    {formatTime(sessionDuration)}
                    {realSessionId && ` • Session: ${realSessionId.slice(-8)}`}
                    {summaryChunks > 0 && ` • ${summaryChunks} topics`}
                    {processingTime > 0 && ` • ${processingTime}ms response`}
                  </Typography>
                </Box>
              </Box>

              <Chip
                label={getStatusMessage()}
                color={getStatusColor()}
                icon={getStatusIcon()}
                size="large"
                variant="filled"
                sx={{
                  bgcolor: alpha('#ffffff', 0.2),
                  color: '#ffffff',
                  '& .MuiChip-icon': { color: '#ffffff' }
                }}
              />
            </Box>
          </Container>
        </Box>

        <Container maxWidth="xl" sx={{ py: 4 }}>
          {/* Error Display */}
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 4, borderRadius: 2 }}
              action={
                <Button color="inherit" size="small" onClick={handleRetry}>
                  Retry Connection
                </Button>
              }
            >
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                Ultra-Fast Backend Connection Failed
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Error:</strong> {error}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Troubleshooting:</strong>
              </Typography>
              <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                <li>Check if backend server is running on http://192.168.48.201:8060</li>
                <li>Verify WebSocket endpoint: ws://192.168.48.201:8060/daily_standup/ws/</li>
                <li>Check network connectivity and firewall settings</li>
                <li>Ensure MongoDB and SQL Server connections are active</li>
              </Box>
            </Alert>
          )}

          {/* Performance Metrics */}
          {isConnected && (
            <Box sx={{ mb: 4 }}>
              <Card sx={{
                p: 3,
                bgcolor: alpha(theme.palette.success.main, 0.05),
                border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
                borderRadius: 3
              }}>
                <Typography variant="h6" color="success.main" gutterBottom sx={{ fontWeight: 'bold' }}>
                  ⚡ Ultra-Fast Performance Metrics
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Voice Detection:</strong> 800ms silence threshold
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Conversations:</strong> {conversationCount}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Summary Topics:</strong> {summaryChunks}
                    </Typography>
                  </Grid>
                  {processingTime > 0 && (
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Last Response Time:</strong> {processingTime}ms
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </Card>
            </Box>
          )}

          {/* Main Interview Interface */}
          {(sessionState === 'idle' || sessionState === 'listening' || sessionState === 'speaking') && isConnected ? (
            <Grid container spacing={4} sx={{ mb: 4 }}>
              {/* AI Interviewer Panel */}
              <Grid item xs={12} md={6}>
                <InterviewPanel
                  elevation={8}
                  active={sessionState === 'speaking'}
                  participant="ai"
                >
                  <StatusIndicator status={sessionState}>
                    <SmartToy fontSize="small" />
                    Interviewer
                  </StatusIndicator>

                  <ParticipantAvatar
                    active={sessionState === 'speaking'}
                    sx={{
                      bgcolor: '#60a5fa',
                      mb: 3
                    }}
                  >
                    <Headset fontSize="inherit" />
                  </ParticipantAvatar>

                  <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 2 }}>
                    Interviewer
                  </Typography>

                  {sessionState === 'speaking' && (
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body1" sx={{ mb: 2, opacity: 0.9 }}>
                        🎧 Speaking
                      </Typography>
                      <LinearProgress
                        variant="indeterminate"
                        sx={{
                          width: '100%',
                          height: 6,
                          borderRadius: 3,
                          bgcolor: alpha('#ffffff', 0.2),
                          '& .MuiLinearProgress-bar': {
                            bgcolor: '#ffffff'
                          }
                        }}
                      />
                    </Box>
                  )}

                  {sessionState !== 'speaking' && (
                    <Typography variant="body2" sx={{ opacity: 0.8, textAlign: 'center' }}>
                      Waiting to respond...
                    </Typography>
                  )}
                </InterviewPanel>
              </Grid>

              {/* User Panel */}
              <Grid item xs={12} md={6}>
                <InterviewPanel
                  elevation={8}
                  active={sessionState === 'idle' || sessionState === 'listening'}
                  participant="user"
                  
                >
                  <StatusIndicator status={sessionState}>
                    <Person fontSize="small" style={{zIndex :999}}/>
                    Interviewee
                  </StatusIndicator>
                  <Box sx={{ mb: 3, position: 'relative', width: '100%' }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{
                        width: '100%',
                        maxHeight: '200px',
                        // borderRadius: '16px',
                        // border: '4px solid rgba(255,255,255,0.4)',
                        // boxShadow: cameraOn ? '0 0 20px rgba(0,255,0,0.4)' : '0 0 10px rgba(255,0,0,0.3)',
                      }}
                    />
                    <IconButton
                      onClick={() => setCameraOn(prev => !prev)}
                      sx={{
                        position: 'absolute',
                        bottom: 18,
                        right: 18,
                        bgcolor: cameraOn ? 'error.main' :'success.main',
                        color: 'white',
                        '&:hover': {
                          bgcolor: cameraOn ?  'error.dark' : 'success.dark',
                        }
                      }}
                    >
                      {cameraOn ? <VideocamOff /> : <Videocam />  }
                    </IconButton>
                  </Box>

                  <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 2 }}>
                    Interviewee
                  </Typography>

                  {(sessionState === 'idle' || sessionState === 'listening') && (
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body1" sx={{ mb: 2, opacity: 0.9 }}>
                        👂 {sessionState === 'listening' ? 'Recording' : 'Listening'}
                      </Typography>
                      <LinearProgress
                        variant="indeterminate"
                        sx={{
                          width: '100%',
                          height: 6,
                          borderRadius: 3,
                          bgcolor: alpha('#ffffff', 0.2),
                          '& .MuiLinearProgress-bar': {
                            bgcolor: '#ffffff'
                          }
                        }}
                      />
                    </Box>
                  )}

                  {sessionState === 'speaking' && (
                    <Typography variant="body2" sx={{ opacity: 0.8, textAlign: 'center' }}>
                      Waiting for your turn...
                    </Typography>
                  )}
                </InterviewPanel>
              </Grid>



            </Grid>
          ) : (
            /* Traditional Interface for other states */
            <StatusCard isActive={sessionState !== 'ready' && sessionState !== 'error'} elevation={8}>
              <CardContent sx={{ p: 6, textAlign: 'center' }}>
                <MainAvatar status={sessionState}>
                  {getStatusIcon()}
                </MainAvatar>

                <Typography
                  variant="h4"
                  gutterBottom
                  sx={{
                    mb: 3,
                    fontWeight: 'bold',
                    background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {getStatusMessage()}
                </Typography>

                {currentMessage && sessionState !== 'ready' && (
                  <Box sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}>
                    <Typography
                      variant="h6"
                      sx={{
                        mb: 2,
                        fontStyle: sessionState === 'speaking' ? 'italic' : 'normal',
                        color: sessionState === 'speaking' ? theme.palette.info.main : theme.palette.text.primary,
                        lineHeight: 1.6,
                        fontSize: '1.1rem'
                      }}
                    >
                      {sessionState === 'speaking' ? `"${currentMessage}"` : currentMessage}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ mb: 4 }}>
                  {sessionState === 'connecting' && (
                    <Box>
                      <Typography variant="h5" color="primary.main" sx={{ mb: 2, fontWeight: 'bold' }}>
                        🔄 CONNECTING TO ULTRA-FAST BACKEND
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        Establishing WebSocket connection to AI interviewer...
                      </Typography>
                      <LinearProgress
                        variant="indeterminate"
                        color="primary"
                        sx={{ mt: 2, height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  )}

                  {sessionState === 'processing' && (
                    <Box>
                      <Typography variant="h5" color="secondary.main" sx={{ mb: 2, fontWeight: 'bold' }}>
                        ⚡ ULTRA-FAST PROCESSING
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        AI is generating response using summary-based questions...
                      </Typography>
                      <LinearProgress
                        variant="indeterminate"
                        color="secondary"
                        sx={{ mt: 2, height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  )}
                </Box>

                <Box sx={{ mb: 4 }}>
                  {sessionState === 'ready' && (
                    <Button
                      variant="contained"
                      size="large"
                      onClick={startUltraFastConversation}
                      startIcon={<PlayArrow />}
                      sx={{
                        px: 4,
                        py: 2,
                        fontSize: '1.2rem',
                        borderRadius: 3,
                        background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                        boxShadow: theme.shadows[8],
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: theme.shadows[12]
                        }
                      }}
                    >
                      Start Ultra-Fast Conversation
                    </Button>
                  )}

                  {sessionState === 'complete' && (
                    <Typography variant="h6" color="success.main" sx={{ fontWeight: 'bold' }}>
                      ✅ Redirecting to ultra-fast summary...
                    </Typography>
                  )}

                  {sessionState === 'error' && (
                    <Button
                      variant="contained"
                      color="error"
                      onClick={handleRetry}
                      startIcon={<ErrorIcon />}
                      sx={{ mr: 2 }}
                    >
                      Retry Connection
                    </Button>
                  )}
                </Box>
              </CardContent>
            </StatusCard>
          )}

          {/* Current AI Message Display */}
          {currentMessage && (sessionState === 'speaking' || sessionState === 'idle') && isConnected && (
            <Card sx={{
              mb: 4,
              p: 3,
              bgcolor: alpha(theme.palette.info.main, 0.05),
              border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
              borderRadius: 3
            }}>
              <Typography variant="h6" color="info.main" gutterBottom sx={{ fontWeight: 'bold' }}>
                💬 Current Conversation
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  fontStyle: sessionState === 'speaking' ? 'italic' : 'normal',
                  color: sessionState === 'speaking' ? theme.palette.info.main : theme.palette.text.primary,
                  lineHeight: 1.6,
                  fontSize: '1.1rem'
                }}
              >
                {sessionState === 'speaking' ? `AI: "${currentMessage}"` : currentMessage}
              </Typography>
            </Card>
          )}

          {/* Ultra-Fast Instructions */}
          <Card sx={{
            p: 4,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            borderRadius: 3,
            mb: 4
          }}>
            <Typography variant="h5" color="primary.main" gutterBottom sx={{ fontWeight: 'bold' }}>
              ⚡ Ultra-Fast Conversation Features
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Avatar sx={{
                    bgcolor: theme.palette.success.main,
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 2
                  }}>
                    <Speed />
                  </Avatar>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                    800ms Detection
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Fastest voice detection for minimal delays between responses
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Avatar sx={{
                    bgcolor: theme.palette.info.main,
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 2
                  }}>
                    <SmartToy />
                  </Avatar>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                    AI Questions
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Smart questions generated from your real project summaries
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Avatar sx={{
                    bgcolor: theme.palette.warning.main,
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 2
                  }}>
                    <MicNone />
                  </Avatar>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Auto Detection
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    No manual controls - just speak naturally and we'll handle the rest
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Avatar sx={{
                    bgcolor: theme.palette.secondary.main,
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 2
                  }}>
                    <Timer />
                  </Avatar>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Parallel Processing
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ultra-fast transcription and response generation in parallel
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Avatar sx={{
                    bgcolor: theme.palette.error.main,
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 2
                  }}>
                    <VolumeUp />
                  </Avatar>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Real-time Streaming
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Audio streams while AI generates the next response for speed
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <Box sx={{ textAlign: 'center', p: 2 }}>
                  <Avatar sx={{
                    bgcolor: theme.palette.primary.main,
                    width: 56,
                    height: 56,
                    mx: 'auto',
                    mb: 2
                  }}>
                    <CheckCircle />
                  </Avatar>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Smart Summary
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Automatic generation of structured standup summaries
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Card>

          {/* Development Debug Panel */}
          {process.env.NODE_ENV === 'development' && (
            <Card sx={{
              p: 3,
              bgcolor: alpha(theme.palette.warning.main, 0.1),
              border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
              borderRadius: 3
            }}>
              <Typography variant="h6" color="warning.main" gutterBottom sx={{ fontWeight: 'bold' }}>
                🛠️ Development Debug Panel
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    <strong>Session State:</strong> {sessionState}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    <strong>Test ID:</strong> {testId}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    <strong>Real Session ID:</strong> {realSessionId}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    <strong>Is Connected:</strong> {isConnected.toString()}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    <strong>Conversation Count:</strong> {conversationCount}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    <strong>Summary Chunks:</strong> {summaryChunks}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    <strong>Processing Time:</strong> {processingTime}ms
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={8}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    <strong>Current Message:</strong> {currentMessage.substring(0, 80)}...
                  </Typography>
                </Grid>
              </Grid>
            </Card>
          )}
        </Container>
      </Box>
    </Fade>
  );
};

export default StandupCallSession;
