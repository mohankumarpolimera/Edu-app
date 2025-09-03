import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Container,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Chip,
  Button,
  Alert,
  CircularProgress,
  Divider,
  LinearProgress,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  ArrowBack,
  Download,
  Assessment,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  TrendingUp,
  Psychology,
  RecordVoiceOver,
  Group,
  Star,
  Timeline,
  ExpandMore,
  AudioFile,
  Timer,
  QuestionAnswer,
  Speed
} from '@mui/icons-material';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { interviewOperationsAPI } from '../../../services/API/studentmockinterview'

const InterviewResults = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Fetch results from API or localStorage
  useEffect(() => {
    fetchInterviewResults();
  }, [testId, retryCount]);

  const fetchInterviewResults = async () => {
    console.log('🔍 InterviewResults - testId:', testId);
    console.log('🔍 InterviewResults - location.state:', location.state);
    
    setLoading(true);
    setError(null);

    try {
      // First, try to get from navigation state
      let evaluationData = location.state?.evaluation;
      
      // If not in state, try localStorage
      if (!evaluationData) {
        const storedData = localStorage.getItem(`interview_results_${testId}`);
        if (storedData) {
          try {
            evaluationData = JSON.parse(storedData);
            console.log('📊 Found data in localStorage:', evaluationData);
          } catch (e) {
            console.warn('⚠️ Failed to parse localStorage data:', e);
          }
        }
      }

      // If still no data, fetch from API
      if (!evaluationData) {
        console.log('🌐 Fetching from API for testId:', testId);
        evaluationData = await interviewOperationsAPI.evaluateInterview(testId);
        console.log('📊 API Response:', evaluationData);
      }

      if (!evaluationData) {
        throw new Error('No interview results found. Please ensure the interview was completed successfully.');
      }

      // Validate and process the evaluation data
      const processedResults = processEvaluationData(evaluationData);
      setResults(processedResults);
      
      // Store in localStorage for future access
      localStorage.setItem(`interview_results_${testId}`, JSON.stringify(processedResults));
      console.log('✅ Results loaded and cached successfully');
      
    } catch (err) {
      console.error('❌ Failed to fetch interview results:', err);
      setError(err.message || 'Failed to load interview results');
    } finally {
      setLoading(false);
    }
  };

  const processEvaluationData = (data) => {
    console.log('🔄 Processing evaluation data:', data);
    
    // Handle different response formats from the backend
    const evaluation = data.evaluation || data.text || 'No evaluation available';
    const scores = data.scores || {};
    const analytics = data.analytics || data.interview_analytics || {};
    
    // Ensure scores are properly formatted
    const processedScores = {};
    Object.entries(scores).forEach(([key, value]) => {
      if (typeof value === 'number') {
        processedScores[key] = value;
      } else if (typeof value === 'string') {
        const numValue = parseFloat(value);
        processedScores[key] = isNaN(numValue) ? 0 : numValue;
      } else if (typeof value === 'object' && value?.score !== undefined) {
        processedScores[key] = parseFloat(value.score) || 0;
      } else {
        processedScores[key] = 0;
      }
    });

    // Ensure analytics are properly formatted
    const processedAnalytics = {
      duration_minutes: analytics.duration_minutes || 0,
      questions_per_round: analytics.questions_per_round || {},
      followup_questions: analytics.followup_questions || 0,
      fragments_covered: analytics.fragments_covered || 0,
      total_fragments: analytics.total_fragments || 0,
      websocket_used: analytics.websocket_used || false,
      tts_voice: analytics.tts_voice || 'Unknown',
      ...analytics
    };

    return {
      evaluation,
      scores: processedScores,
      analytics: processedAnalytics,
      pdf_url: data.pdf_url || `/weekly_interview/download_results/${testId}`,
      test_id: testId,
      student_name: analytics.student_name || 'Student'
    };
  };

  const getScoreColor = (score, maxScore = 10) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return 'success';
    if (percentage >= 60) return 'warning';
    return 'error';
  };

  const getScoreIcon = (score, maxScore = 10) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return <CheckCircle color="success" />;
    if (percentage >= 60) return <Warning color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const getScoreDescription = (scoreKey, score) => {
    const descriptions = {
      technical_score: 'Technical knowledge, problem-solving abilities, and coding skills',
      communication_score: 'Clarity of communication, articulation, and presentation skills',
      behavioral_score: 'Cultural fit, teamwork, and behavioral responses',
      overall_score: 'Overall interview performance and professional presence',
      weighted_overall: 'Comprehensive weighted score across all categories'
    };
    return descriptions[scoreKey] || 'Performance assessment for this category';
  };

  const handleDownloadPDF = async () => {
    try {
      console.log('📥 Attempting to download PDF for testId:', testId);
      
      if (results?.pdf_url) {
        // Create a link to download the PDF
        const link = document.createElement('a');
        link.href = results.pdf_url;
        link.download = `interview_results_${testId}.pdf`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('📄 PDF download initiated');
      } else {
        throw new Error('PDF URL not available');
      }
    } catch (error) {
      console.error('❌ PDF download failed:', error);
      alert('PDF download failed. Please try again later.');
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  const formatDisplayName = (key) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const renderScoreCard = (scoreKey, score) => {
    const maxScore = 10;
    const percentage = (score / maxScore) * 100;
    const displayName = formatDisplayName(scoreKey);
    
    return (
      <Grid item xs={12} md={6} lg={3} key={scoreKey}>
        <Paper
          elevation={2}
          sx={{
            p: 3,
            height: '100%',
            borderRadius: 2,
            border: `2px solid`,
            borderColor: `${getScoreColor(score)}.light`,
            '&:hover': {
              borderColor: `${getScoreColor(score)}.main`,
              transform: 'translateY(-2px)',
              transition: 'all 0.2s ease-in-out'
            }
          }}
        >
          <Box display="flex" alignItems="center" justifyContent="center" mb={2}>
            {getScoreIcon(score)}
            <Typography variant="h6" sx={{ ml: 1, fontWeight: 'bold' }}>
              {displayName}
            </Typography>
          </Box>
          
          <Typography 
            variant="h3" 
            color={`${getScoreColor(score)}.main`} 
            align="center"
            gutterBottom
            sx={{ fontWeight: 'bold' }}
          >
            {score.toFixed(1)}/{maxScore}
          </Typography>
          
          <LinearProgress
            variant="determinate"
            value={percentage}
            color={getScoreColor(score)}
            sx={{
              height: 10,
              borderRadius: 5,
              mb: 2
            }}
          />
          
          <Typography 
            variant="h6" 
            align="center" 
            color={`${getScoreColor(score)}.main`}
            sx={{ fontWeight: 'bold' }}
          >
            {percentage.toFixed(0)}%
          </Typography>
          
          <Typography 
            variant="body2" 
            color="text.secondary" 
            align="center"
            sx={{ mt: 1 }}
          >
            {getScoreDescription(scoreKey, score)}
          </Typography>
        </Paper>
      </Grid>
    );
  };

  const renderAnalyticsCard = (key, value) => {
    let displayValue = '';
    let icon = <Timeline />;
    
    if (typeof value === 'number') {
      displayValue = value.toFixed(2);
    } else if (typeof value === 'string') {
      displayValue = value;
    } else if (typeof value === 'boolean') {
      displayValue = value ? 'Yes' : 'No';
      icon = value ? <CheckCircle color="success" /> : <ErrorIcon color="error" />;
    } else if (typeof value === 'object' && key === 'questions_per_round') {
      displayValue = Object.entries(value)
        .map(([round, count]) => `${formatDisplayName(round)}: ${count}`)
        .join(', ');
    } else {
      displayValue = JSON.stringify(value);
    }
    
    // Special icons for specific metrics
    if (key.includes('duration')) icon = <Timer />;
    if (key.includes('voice') || key.includes('tts')) icon = <RecordVoiceOver />;
    if (key.includes('question')) icon = <QuestionAnswer />;
    if (key.includes('fragment')) icon = <Assessment />;
    if (key.includes('websocket') || key.includes('speed')) icon = <Speed />;
    
    return (
      <Grid item xs={12} sm={6} md={4} key={key}>
        <Paper sx={{ p: 2, borderRadius: 2, height: '100%' }}>
          <Box display="flex" alignItems="center" mb={1}>
            {icon}
            <Typography variant="subtitle1" sx={{ ml: 1, fontWeight: 'medium' }}>
              {formatDisplayName(key)}
            </Typography>
          </Box>
          <Typography variant="h6" color="primary.main" sx={{ fontWeight: 'bold' }}>
            {displayValue}
          </Typography>
        </Paper>
      </Grid>
    );
  };

  const renderPerformanceSummary = () => {
    if (!results?.scores) return null;

    const scoreEntries = Object.entries(results.scores);
    const averageScore = scoreEntries.reduce((sum, [_, score]) => sum + score, 0) / scoreEntries.length;
    const strengths = [];
    const improvements = [];

    scoreEntries.forEach(([key, score]) => {
      const category = formatDisplayName(key);
      if (score >= 7) {
        strengths.push(category);
      } else if (score < 6) {
        improvements.push(category);
      }
    });

    return (
      <Card sx={{ mb: 3, borderRadius: 2 }}>
        <CardHeader 
          title="Performance Summary" 
          avatar={<Psychology color="primary" />}
        />
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.light', color: 'white' }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  {averageScore.toFixed(1)}
                </Typography>
                <Typography variant="subtitle1">
                  Average Score
                </Typography>
              </Paper>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Box>
                <Typography variant="h6" gutterBottom color="success.main" sx={{ display: 'flex', alignItems: 'center' }}>
                  <Star sx={{ mr: 1 }} />
                  Strengths
                </Typography>
                {strengths.length > 0 ? (
                  <List dense>
                    {strengths.map((strength, index) => (
                      <ListItem key={index} sx={{ py: 0 }}>
                        <ListItemIcon>
                          <CheckCircle color="success" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={strength} />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Areas of strength will appear as scores improve
                  </Typography>
                )}
              </Box>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Box>
                <Typography variant="h6" gutterBottom color="warning.main" sx={{ display: 'flex', alignItems: 'center' }}>
                  <TrendingUp sx={{ mr: 1 }} />
                  Growth Areas
                </Typography>
                {improvements.length > 0 ? (
                  <List dense>
                    {improvements.map((improvement, index) => (
                      <ListItem key={index} sx={{ py: 0 }}>
                        <ListItemIcon>
                          <Warning color="warning" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText primary={improvement} />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Great job! All areas show strong performance
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="50vh">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading your interview results...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Please wait while we process your interview data
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>Interview Results Error</Typography>
          {error}
        </Alert>
        <Box display="flex" gap={2}>
          <Button
            variant="contained"
            onClick={handleRetry}
            sx={{ borderRadius: 2 }}
          >
            Retry Loading
          </Button>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => navigate('/student/mock-interviews')}
            sx={{ borderRadius: 2 }}
          >
            Back to Mock Interviews
          </Button>
        </Box>
      </Container>
    );
  }

  if (!results) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          No interview results found for test ID: {testId}
        </Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBack />}
          onClick={() => navigate('/student/mock-interviews')}
          sx={{ borderRadius: 2 }}
        >
          Back to Mock Interviews
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={4}>
        <Box display="flex" alignItems="center">
          <IconButton onClick={() => navigate('/student/mock-interviews')} sx={{ mr: 1 }}>
            <ArrowBack />
          </IconButton>
          <Assessment sx={{ mr: 1, color: 'primary.main' }} />
          <Box>
            <Typography variant="h4" fontWeight="bold" color="primary.main">
              Interview Results
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {results.student_name} • Test ID: {testId}
            </Typography>
          </Box>
        </Box>
        
        <Button
          variant="contained"
          startIcon={<Download />}
          onClick={handleDownloadPDF}
          sx={{ borderRadius: 2 }}
        >
          Download PDF Report
        </Button>
      </Box>

      {/* Performance Summary */}
      {renderPerformanceSummary()}

      {/* Scores Section */}
      {results.scores && Object.keys(results.scores).length > 0 && (
        <Card sx={{ mb: 3, borderRadius: 2 }}>
          <CardHeader 
            title="Performance Scores" 
            subheader="Detailed breakdown of your interview performance"
          />
          <CardContent>
            <Grid container spacing={3}>
              {Object.entries(results.scores).map(([scoreKey, score]) => 
                renderScoreCard(scoreKey, score)
              )}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Interview Analytics */}
      {results.analytics && Object.keys(results.analytics).length > 0 && (
        <Card sx={{ mb: 3, borderRadius: 2 }}>
          <CardHeader 
            title="Interview Analytics" 
            subheader="Technical details and metrics from your interview session"
          />
          <CardContent>
            <Grid container spacing={2}>
              {Object.entries(results.analytics).map(([key, value]) => 
                renderAnalyticsCard(key, value)
              )}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Detailed Evaluation */}
      <Card sx={{ mb: 3, borderRadius: 2 }}>
        <CardHeader
          title="Detailed Evaluation"
          subheader="Comprehensive feedback on your interview performance"
          avatar={<Assessment color="primary" />}
        />
        <CardContent>
          <Paper variant="outlined" sx={{ p: 3, bgcolor: 'grey.50' }}>
            <Typography 
              variant="body1" 
              sx={{ 
                whiteSpace: 'pre-line',
                lineHeight: 1.7,
                fontSize: '1.1rem'
              }}
            >
              {results.evaluation}
            </Typography>
          </Paper>
        </CardContent>
      </Card>

      {/* Round Progress Details */}
      {results.analytics?.questions_per_round && (
        <Card sx={{ mb: 3, borderRadius: 2 }}>
          <CardHeader title="Interview Round Progress" />
          <CardContent>
            <Grid container spacing={3}>
              {Object.entries(results.analytics.questions_per_round).map(([round, questionCount]) => {
                const roundName = formatDisplayName(round);
                const maxQuestions = round === 'greeting' ? 2 : 6;
                const progress = Math.min((questionCount / maxQuestions) * 100, 100);
                
                return (
                  <Grid item xs={12} sm={6} md={3} key={round}>
                    <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
                      <Typography variant="h6" gutterBottom color="primary.main">
                        {roundName}
                      </Typography>
                      <Typography variant="h4" color="primary" gutterBottom sx={{ fontWeight: 'bold' }}>
                        {questionCount}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          mb: 1
                        }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        {questionCount} of {maxQuestions} questions
                      </Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Box display="flex" gap={2} justifyContent="center" mt={4}>
        <Button
          variant="outlined"
          onClick={() => navigate('/student/mock-interviews')}
          sx={{ borderRadius: 2, px: 4 }}
        >
          Take Another Interview
        </Button>
        
        <Button
          variant="contained"
          onClick={() => navigate('/student/dashboard')}
          sx={{ borderRadius: 2, px: 4 }}
        >
          Back to Dashboard
        </Button>
      </Box>
    </Container>
  );
};

export default InterviewResults;