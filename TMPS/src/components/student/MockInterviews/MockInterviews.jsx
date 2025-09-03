// Fixed MockInterviews.jsx - Compatible with backend session handling
// src/components/student/MockInterviews/MockInterviews.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Container, Typography, Button, Box, Card, CardContent, 
  Alert, CircularProgress, Grid, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions
} from '@mui/material';
import { PlayArrow, Mic, Assessment, Videocam, VolumeUp } from '@mui/icons-material';
import { createInterviewSession, testAPIConnection } from '../../../services/API/index2'

const StudentMockInterviews = () => {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState(null);
  const [systemReady, setSystemReady] = useState(false);
  const [mediaPermissions, setMediaPermissions] = useState({
    camera: false,
    microphone: false,
    checked: false
  });
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  useEffect(() => {
    checkSystemReady();
    checkMediaPermissions();
  }, []);

  const checkSystemReady = async () => {
    try {
      console.log('🔍 Checking backend interview system...');
      
      const connectionTest = await testAPIConnection();
      
      if (connectionTest.status === 'success') {
        setSystemReady(true);
        setError(null);
        console.log('✅ Backend system ready!');
      } else {
        throw new Error(connectionTest.message || 'Backend connection failed');
      }
      
    } catch (error) {
      console.error('❌ Backend check failed:', error);
      setError(`Backend not ready: ${error.message}`);
      setSystemReady(false);
    }
  };

  const checkMediaPermissions = async () => {
    try {
      // Check if we're in a secure context and have media support
      const isSecureContext = window.isSecureContext;
      const hasNavigator = typeof navigator !== 'undefined';
      const hasMediaDevices = hasNavigator && navigator.mediaDevices;
      const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';

      console.log('🔍 Media environment check:', {
        isSecureContext,
        hasNavigator,
        hasMediaDevices,
        hasGetUserMedia,
        protocol: window.location.protocol,
        hostname: window.location.hostname
      });

      if (!hasNavigator) {
        throw new Error('Navigator API not available');
      }

      if (!hasMediaDevices) {
        throw new Error('MediaDevices API not supported. Please use a modern browser with HTTPS.');
      }

      if (!hasGetUserMedia) {
        throw new Error('getUserMedia not supported. Please update your browser.');
      }

      if (!isSecureContext && window.location.protocol !== 'file:') {
        throw new Error('Media access requires HTTPS. Please use https:// instead of http://');
      }

      // Check if permissions are already granted (if supported)
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const permissions = await Promise.all([
            navigator.permissions.query({ name: 'camera' }),
            navigator.permissions.query({ name: 'microphone' })
          ]);

          const cameraGranted = permissions[0].state === 'granted';
          const microphoneGranted = permissions[1].state === 'granted';

          setMediaPermissions({
            camera: cameraGranted,
            microphone: microphoneGranted,
            checked: true
          });

          console.log('🎥 Media permissions:', { camera: cameraGranted, microphone: microphoneGranted });
        } else {
          // Permission API not supported, assume permissions needed
          console.log('📋 Permission API not supported, will check during interview start');
          setMediaPermissions({ camera: false, microphone: false, checked: true });
        }
      } catch (permError) {
        console.log('📋 Permission query failed, will check during interview start:', permError.message);
        setMediaPermissions({ camera: false, microphone: false, checked: true });
      }

    } catch (error) {
      console.error('❌ Media environment check failed:', error);
      setMediaPermissions({ camera: false, microphone: false, checked: true });
      setError(`Media not supported: ${error.message}`);
    }
  };

  const requestMediaPermissions = async () => {
    try {
      console.log('🎥 Requesting camera and microphone permissions...');
      
      // Double-check media API availability
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('getUserMedia is not supported in this browser or context. Please use HTTPS and a modern browser.');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Stop the stream immediately - we just wanted to get permissions
      stream.getTracks().forEach(track => track.stop());
      
      setMediaPermissions({
        camera: true,
        microphone: true,
        checked: true
      });
      
      setShowPermissionDialog(false);
      setError(null); // Clear any previous errors
      console.log('✅ Media permissions granted');
      
      return true;
      
    } catch (error) {
      console.error('❌ Media permission request failed:', error);
      
      let errorMessage = 'Media access failed: ';
      
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Permission denied by user. Please allow camera and microphone access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera or microphone found. Please connect media devices.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage += 'Media capture not supported. Please use HTTPS and a modern browser.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Media device in use by another application.';
      } else {
        errorMessage += error.message;
      }
      
      setError(errorMessage);
      return false;
    }
  };

  const startInterview = async () => {
    try {
      setIsStarting(true);
      setError(null);
      
      // Critical check: Ensure we're in a secure context and have media API support
      if (!window.isSecureContext && window.location.protocol !== 'file:') {
        throw new Error('🔒 HTTPS Required: Camera and microphone access requires a secure connection. Please access this page using HTTPS.');
      }
      
      if (!navigator.mediaDevices) {
        throw new Error('🌐 Browser Not Supported: Your browser doesn\'t support media devices. Please use a modern browser like Chrome, Firefox, Safari, or Edge.');
      }
      
      if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('📱 API Not Available: getUserMedia is not supported. Please update your browser to the latest version.');
      }
      
      // Check media permissions first (only if we have the API)
      if (!mediaPermissions.camera || !mediaPermissions.microphone) {
        console.log('🎥 Requesting media permissions before starting interview...');
        const granted = await requestMediaPermissions();
        if (!granted) {
          setIsStarting(false);
          return;
        }
      }
      
      console.log('🎯 Creating new interview session...');
      
      // Create session using the backend API
      const sessionData = await createInterviewSession();
      
      console.log('✅ SESSION DATA RECEIVED:');
      console.log('Full response:', sessionData);
      console.log('Session ID:', sessionData.sessionId);
      console.log('Test ID:', sessionData.testId);
      console.log('Student Name:', sessionData.studentName);
      
      // Validate required session data
      if (!sessionData.sessionId) {
        throw new Error('Backend did not return session_id');
      }
      
      if (!sessionData.testId) {
        throw new Error('Backend did not return test_id');
      }
      
      console.log('🎬 NAVIGATING TO VIDEO INTERVIEW with parameters:');
      console.log('Session ID:', sessionData.sessionId);
      console.log('Test ID:', sessionData.testId);
      console.log('Student Name:', sessionData.studentName);
      
      // Navigate with proper parameter naming and state
      navigate(`/student/mock-interviews/session/${sessionData.sessionId}`, {
        state: {
          testId: sessionData.testId,
          studentName: sessionData.studentName,
          sessionData: sessionData,
          mediaPermissions: mediaPermissions
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to start interview:', error);
      setError(error.message || `Failed to start interview: ${error.toString()}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handlePermissionDialog = () => {
    setShowPermissionDialog(true);
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box textAlign="center" mb={4}>
        <Videocam sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
        <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
           AI Video Mock Interview
        </Typography>
        <Typography variant="h6" color="text.secondary">
          Practice with AI-powered video conversations and real-time voice processing
        </Typography>
      </Box>

      {/* System Status */}
      <Box mb={4}>
        {systemReady ? (
          <Alert severity="success" sx={{ borderRadius: 2 }}>
            <strong>System Ready!</strong> Backend interview system is online with voice recognition and streaming TTS.
          </Alert>
        ) : error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            <strong>System Issue:</strong> {error}
            <Button 
              size="small" 
              onClick={checkSystemReady} 
              sx={{ ml: 2 }}
            >
              Retry
            </Button>
          </Alert>
        ) : (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            <CircularProgress size={20} sx={{ mr: 1 }} />
            Checking backend interview system...
          </Alert>
        )}
      </Box>

      {/* HTTPS and Browser Compatibility Check */}
      <Box mb={4}>
        {/* HTTPS Security Check */}
        {!window.isSecureContext && window.location.protocol !== 'file:' && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom color="error">
              🔒 HTTPS Required for Video Interview
            </Typography>
            <Typography variant="body1" paragraph>
              <strong>Current URL:</strong> {window.location.href}
            </Typography>
            <Typography variant="body2" paragraph>
              Camera and microphone access requires a secure HTTPS connection. Please access this page using:
            </Typography>
            <Typography variant="body1" sx={{ 
              bgcolor: 'grey.100', 
              p: 1, 
              borderRadius: 1, 
              fontFamily: 'monospace',
              fontSize: '0.9rem'
            }}>
              https://{window.location.host}{window.location.pathname}
            </Typography>
            <Button 
              variant="contained" 
              color="primary"
              sx={{ mt: 2 }}
              onClick={() => {
                const httpsUrl = `https://${window.location.host}${window.location.pathname}${window.location.search}`;
                window.location.href = httpsUrl;
              }}
            >
              🔄 Switch to HTTPS
            </Button>
          </Alert>
        )}
        
        {/* Browser API Support Check */}
        {window.isSecureContext && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom color="error">
              🌐 Browser Not Compatible
            </Typography>
            <Typography variant="body2" paragraph>
              Your browser doesn't support camera/microphone access. Please use a modern browser:
            </Typography>
            <Typography variant="body2" component="div">
              ✅ <strong>Supported Browsers:</strong><br/>
              • Chrome 53+ • Firefox 36+ • Safari 11+ • Edge 12+<br/>
              • Make sure you're using the latest version
            </Typography>
            <Typography variant="body2" component="div" sx={{ mt: 1 }}>
              🔍 <strong>Current Browser Info:</strong><br/>
              • User Agent: {navigator.userAgent.split(' ')[0]}...<br/>
              • MediaDevices: {navigator.mediaDevices ? '✅ Available' : '❌ Not Available'}<br/>
              • getUserMedia: {navigator.mediaDevices?.getUserMedia ? '✅ Available' : '❌ Not Available'}
            </Typography>
          </Alert>
        )}

        {/* Media Permissions Status - Only show if browser supports it */}
        {mediaPermissions.checked && window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (
          <Alert 
            severity={mediaPermissions.camera && mediaPermissions.microphone ? "success" : "warning"} 
            sx={{ borderRadius: 2, mb: 2 }}
          >
            <Typography variant="subtitle2" gutterBottom>
              📹 Media Permissions Status:
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
              <Chip 
                label={`Camera: ${mediaPermissions.camera ? 'Granted' : 'Not Granted'}`}
                color={mediaPermissions.camera ? 'success' : 'warning'}
                size="small"
              />
              <Chip 
                label={`Microphone: ${mediaPermissions.microphone ? 'Granted' : 'Not Granted'}`}
                color={mediaPermissions.microphone ? 'success' : 'warning'}
                size="small"
              />
            </Box>
            {(!mediaPermissions.camera || !mediaPermissions.microphone) && (
              <Button 
                size="small" 
                onClick={handlePermissionDialog}
                variant="outlined"
                sx={{ mt: 1 }}
              >
                Test Media Access
              </Button>
            )}
          </Alert>
        )}
      </Box>

      {/* Main Interview Card */}
      <Card sx={{ borderRadius: 3, boxShadow: 3 }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Assessment sx={{ fontSize: 50, color: 'primary.main', mb: 2 }} />
          
          <Typography variant="h4" gutterBottom>
            Ready for AI Mock Interview?
          </Typography>
          
          <Typography variant="body1" color="text.secondary" paragraph>
            This AI interviewer will conduct a realistic interview with voice recognition, 
            streaming TTS responses, and intelligent conversation flow. Your microphone is required.
          </Typography>

          <Box sx={{ my: 3 }}>
            <Grid container spacing={2} justifyContent="center">
              <Grid item>
                <Chip 
                  label="🎤 Voice Recognition" 
                  variant="outlined" 
                  color="primary" 
                />
              </Grid>
              <Grid item>
                <Chip 
                  label="🗣️ Streaming TTS" 
                  variant="outlined" 
                  color="success" 
                />
              </Grid>
              <Grid item>
                <Chip 
                  label="🤖 AI-Powered Questions" 
                  variant="outlined" 
                  color="primary" 
                />
              </Grid>
              <Grid item>
                <Chip 
                  label="📊 Real-time Feedback" 
                  variant="outlined" 
                  color="success" 
                />
              </Grid>
            </Grid>
          </Box>

          <Button
            variant="contained"
            size="large"
            startIcon={isStarting ? <CircularProgress size={20} color="inherit" /> : <PlayArrow />}
            onClick={startInterview}
            disabled={
              !systemReady || 
              isStarting || 
              !window.isSecureContext ||
              (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
            }
            sx={{
              borderRadius: 3,
              py: 1.5,
              px: 4,
              fontSize: '1.1rem',
              fontWeight: 'bold'
            }}
          >
            {isStarting ? 'Starting Interview...' : 'Start AI Interview'}
          </Button>

          {/* Button Status Messages */}
          {!window.isSecureContext ? (
            <Typography variant="caption" display="block" sx={{ mt: 2, color: 'error.main' }}>
              ⚠️ HTTPS required for microphone access
            </Typography>
          ) : !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia ? (
            <Typography variant="caption" display="block" sx={{ mt: 2, color: 'error.main' }}>
              ⚠️ Browser doesn't support media devices. Please use a modern browser.
            </Typography>
          ) : systemReady ? (
            <Typography variant="caption" display="block" sx={{ mt: 2, color: 'text.secondary' }}>
              The interview requires microphone access for voice recognition
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      {/* Features Information */}
      <Card sx={{ mt: 3, bgcolor: 'grey.50', borderRadius: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom color="primary">
            🎯 AI Interview Features:
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>🎤 Voice Recognition:</strong>
              </Typography>
              <Typography variant="body2" gutterBottom>
                • Real-time speech-to-text<br/>
                • Natural conversation flow<br/>
                • Automatic silence detection<br/>
                • High-quality transcription
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>🗣️ AI Voice Responses:</strong>
              </Typography>
              <Typography variant="body2" gutterBottom>
                • Streaming text-to-speech<br/>
                • Natural voice synthesis<br/>
                • Real-time audio delivery<br/>
                • Professional interview tone
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>🤖 Smart AI Interviewer:</strong>
              </Typography>
              <Typography variant="body2" gutterBottom>
                • Context-aware questions<br/>
                • Multiple interview rounds<br/>
                • Technical and behavioral questions<br/>
                • Adaptive conversation flow
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>📊 Performance Analysis:</strong>
              </Typography>
              <Typography variant="body2" gutterBottom>
                • Real-time evaluation<br/>
                • Detailed feedback report<br/>
                • Scoring across multiple areas<br/>
                • PDF results download
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Permission Dialog */}
      <Dialog 
        open={showPermissionDialog} 
        onClose={() => setShowPermissionDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          🎤 Microphone Access Required
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            The AI interview requires access to your microphone to function properly.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your microphone is used for voice recognition to capture your responses for the AI interviewer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPermissionDialog(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={requestMediaPermissions}
            startIcon={<Mic />}
          >
            Grant Access
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default StudentMockInterviews;