# weekly_interview/core/__init__.py
"""
Core module for Enhanced Mock Interview System
Exports all essential components for clean imports
"""

from core.config import config
from core.database import DatabaseManager
from core.content_service import ContentService
from core.ai_services import (
    wi_shared_clients as shared_clients,
    WI_InterviewSession as InterviewSession,
    WI_InterviewStage as InterviewStage,
    WI_EnhancedInterviewFragmentManager as EnhancedInterviewFragmentManager,
    WI_OptimizedAudioProcessor as OptimizedAudioProcessor,
    WI_OptimizedConversationManager as OptimizedConversationManager,
)

__all__ = [
    "wi_shared_clients",
    "EnhancedInterviewFragmentManager", "WI_EnhancedInterviewFragmentManager",
    "InterviewSession", "WI_InterviewSession",
    "InterviewStage", "WI_InterviewStage",
    "OptimizedAudioProcessor", "WI_OptimizedAudioProcessor",
    "OptimizedConversationManager", "WI_OptimizedConversationManager",
]