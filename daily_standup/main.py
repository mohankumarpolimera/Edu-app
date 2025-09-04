# -*- coding: utf-8 -*-
"""
Ultra-fast, real database daily standup backend with optimized performance
NO DUMMY DATA - Real connections only
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, UploadFile, Form
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import time
import uuid
import logging
import os
import io
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
from reportlab.lib.pagesizes import LETTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from datetime import datetime
import base64

# Local imports - use package-relative, keep names intact
from core import *
from core.ai_services import DS_SessionData as SessionData
from core.ai_services import DS_SessionStage as SessionStage
from core.ai_services import DS_SummaryManager as SummaryManager
from core.ai_services import ds_shared_clients as shared_clients
from core.config import config
from core.database import DatabaseManager
from core.ai_services import DS_OptimizedAudioProcessor as OptimizedAudioProcessor
# ⬇️ Unified Chatterbox TTS
from core.tts_processor import UnifiedTTSProcessor as UltraFastTTSProcessor
from core.ai_services import DS_OptimizedConversationManager as OptimizedConversationManager
from core.prompts import DailyStandupPrompts as prompts

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# ULTRA-FAST SESSION MANAGER - NO DUMMY DATA
# =============================================================================

class UltraFastSessionManager:
    def __init__(self):
        self.active_sessions: Dict[str, SessionData] = {}
        self.db_manager = DatabaseManager(shared_clients)
        self.audio_processor = OptimizedAudioProcessor(shared_clients)
        # ⬇️ INIT unified TTS with ref dir + encoding from config
        self.tts_processor = UltraFastTTSProcessor(
            ref_audio_dir=getattr(config, "REF_AUDIO_DIR", Path("ref_audios")),
            encode=getattr(config, "TTS_STREAM_ENCODING", "wav"),
        )
        self.conversation_manager = OptimizedConversationManager(shared_clients)

    async def create_session_fast(self, websocket: Optional[Any] = None) -> SessionData:
        session_id = str(uuid.uuid4())
        test_id = f"standup_{int(time.time())}"
        try:
            student_info_task = asyncio.create_task(self.db_manager.get_student_info_fast())
            summary_task = asyncio.create_task(self.db_manager.get_summary_fast())
            student_id, first_name, last_name, session_key = await student_info_task
            summary = await summary_task

            if not summary or len(summary.strip()) < 50:
                raise Exception("Invalid summary retrieved from database")
            if not first_name or not last_name:
                raise Exception("Invalid student data retrieved from database")

            session_data = SessionData(
                session_id=session_id,
                test_id=test_id,
                student_id=student_id,
                student_name=f"{first_name} {last_name}",
                session_key=session_key,
                created_at=time.time(),
                last_activity=time.time(),
                current_stage=SessionStage.GREETING,
                websocket=websocket,
            )

            SESSION_MAX_SECONDS = getattr(config, "SESSION_MAX_SECONDS", 15 * 60)  # default 15 minutes
            SESSION_SOFT_CUTOFF_SECONDS = getattr(config, "SESSION_SOFT_CUTOFF_SECONDS", 10)  # last 10 seconds
            now_ts = time.time()
            session_data.end_time = now_ts + SESSION_MAX_SECONDS
            session_data.soft_cutoff_time = session_data.end_time - SESSION_SOFT_CUTOFF_SECONDS
            session_data.awaiting_user = False  # Track if we’re waiting for user’s final reply

            fragment_manager = SummaryManager(shared_clients, session_data)
            if not fragment_manager.initialize_fragments(summary):
                raise Exception("Failed to initialize fragments from summary")
            session_data.summary_manager = fragment_manager

            # ⬇️ PIN ONE REFERENCE VOICE FOR THIS SESSION
            self.tts_processor.start_session(session_data.session_id)

            self.active_sessions[session_id] = session_data
            logger.info("Real session created %s for %s with %d fragments",
                        session_id, session_data.student_name, len(session_data.fragment_keys))
            return session_data
        except Exception as e:
            logger.error("Failed to create session: %s", e)
            raise Exception(f"Session creation failed: {e}")

    async def _end_due_to_time(self, session_data: SessionData):
        def _extract_topics(sd: SessionData):
            topics = []
            sm = getattr(sd, "summary_manager", None)
            if not sm:
                return topics

            fk = getattr(sd, "fragment_keys", None)
            frags = getattr(sm, "fragments", None)

            if fk and isinstance(frags, dict):
                for k in fk:
                    frag = frags.get(k)
                    if isinstance(frag, dict):
                        t = frag.get("title") or frag.get("heading") or frag.get("name")
                        if t:
                            topics.append(t)
                if topics:
                    return topics

            if isinstance(frags, list):
                for frag in frags:
                    if isinstance(frag, dict):
                        t = frag.get("title") or frag.get("heading") or frag.get("name")
                        if t:
                            topics.append(t)
                if topics:
                    return topics

            if fk:
                return [str(k) for k in fk]
            return topics

        try:
            topics = _extract_topics(session_data)
            conv_log = getattr(session_data, "conversation_log", []) or []
            conversation_summary = {
                "topics_covered": topics,
                "total_exchanges": len(conv_log),
            }
            user_final_response = (
                conv_log[-1].get("user_response") if conv_log and isinstance(conv_log[-1], dict) else None
            )

            closing_prompt = prompts.dynamic_session_completion(conversation_summary, user_final_response)

            loop = asyncio.get_event_loop()
            closing_text = await loop.run_in_executor(
                shared_clients.executor,
                self.conversation_manager._sync_openai_call,
                closing_prompt,
            )

            if not closing_text or not str(closing_text).strip():
                closing_text = f"Thanks {session_data.student_name}. We’ll end the session here."

            await self._send_quick_message(session_data, {
                "type": "conversation_end",
                "text": closing_text,
                "status": "complete",
                "enable_new_session": True
            })

            # ⬇️ PASS session_id SO THE STICKY VOICE IS USED
            try:
                async for audio_chunk in self.tts_processor.generate_ultra_fast_stream(
                    closing_text, session_id=session_data.session_id
                ):
                    if audio_chunk:
                        await self._send_quick_message(session_data, {
                            "type": "audio_chunk",
                            "audio": audio_chunk.hex(),
                            "status": "complete",
                        })
                await self._send_quick_message(session_data, {"type": "audio_end", "status": "complete"})
            except Exception as e:
                logger.error("TTS closing stream error: %s", e)

        except Exception as e:
            logger.error("Closing generation error: %s", e)
            fallback_text = f"Thanks {session_data.student_name}. This session will now end."
            await self._send_quick_message(session_data, {
                "type": "conversation_end",
                "text": fallback_text,
                "status": "complete",
                "enable_new_session": True
            })
            try:
                async for audio_chunk in self.tts_processor.generate_ultra_fast_stream(
                    fallback_text, session_id=session_data.session_id
                ):
                    if audio_chunk:
                        await self._send_quick_message(session_data, {
                            "type": "audio_chunk",
                            "audio": audio_chunk.hex(),
                            "status": "complete",
                        })
                await self._send_quick_message(session_data, {"type": "audio_end", "status": "complete"})
            except Exception as e2:
                logger.error("TTS fallback closing stream error: %s", e2)

        session_data.is_active = False
        await self.remove_session(session_data.session_id)

    async def remove_session(self, session_id: str):
        if session_id in self.active_sessions:
            # ⬇️ CLEAN THE PINNED VOICE
            try:
                self.tts_processor.end_session(session_id)
            except Exception:
                pass
            del self.active_sessions[session_id]
            logger.info("Removed session %s", session_id)

    async def process_audio_ultra_fast(self, session_id: str, audio_data: bytes):
        session_data = self.active_sessions.get(session_id)
        if not session_data or not session_data.is_active:
            logger.warning("Inactive session: %s", session_id)
            return

        start_time = time.time()
        try:
            now_ts = time.time()
            if hasattr(session_data, "end_time") and now_ts >= session_data.end_time:
                await self._end_due_to_time(session_data)
                return

            audio_size = len(audio_data)
            logger.info("Session %s: received %d bytes of audio", session_id, audio_size)

            if audio_size < 100:
                await self._send_quick_message(session_data, {
                    "type": "clarification",
                    "text": "I didn't hear anything clear. Could you please speak a bit louder?",
                    "status": session_data.current_stage.value,
                })
                return

            transcript, quality = await self.audio_processor.transcribe_audio_fast(audio_data)

            if not transcript or len(transcript.strip()) < 2:
                clarification_context = {
                    'clarification_attempts': getattr(session_data, 'clarification_attempts', 0),
                    'audio_quality': quality,
                    'audio_size': audio_size
                }
                session_data.clarification_attempts = clarification_context['clarification_attempts'] + 1

                if audio_size < 500:
                    clarification_message = "I received a very short audio clip. Please try speaking for a bit longer."
                elif quality < 0.3:
                    clarification_message = "The audio wasn't very clear. Could you please speak a bit louder and clearer?"
                else:
                    loop = asyncio.get_event_loop()
                    clarification_message = await loop.run_in_executor(
                        shared_clients.executor,
                        self.conversation_manager._sync_openai_call,
                        prompts.dynamic_clarification_request(clarification_context),
                    )

                await self._send_quick_message(session_data, {
                    "type": "clarification",
                    "text": clarification_message,
                    "status": session_data.current_stage.value,
                })
                return

            logger.info("Session %s: transcript='%s' quality=%.2f", session_id, transcript, quality)

            now_ts = time.time()
            soft_cutoff = getattr(session_data, "soft_cutoff_time", None)
            end_time = getattr(session_data, "end_time", None)
            if soft_cutoff and end_time and now_ts >= soft_cutoff:
                if getattr(session_data, "awaiting_user", False):
                    concept = session_data.current_concept if session_data.current_concept else "unknown"
                    is_followup = getattr(session_data, '_last_question_followup', False)
                    session_data.add_exchange("[FINAL_QUESTION_AWAITED_USER]", transcript, quality, concept, is_followup)
                    if session_data.summary_manager:
                        session_data.summary_manager.add_answer(transcript)
                    await self._end_due_to_time(session_data)
                    return
                else:
                    await self._end_due_to_time(session_data)
                    return

            session_data.awaiting_user = False

            ai_response = await self.conversation_manager.generate_fast_response(session_data, transcript)

            concept = session_data.current_concept if session_data.current_concept else "unknown"
            is_followup = getattr(session_data, '_last_question_followup', False)
            session_data.add_exchange(ai_response, transcript, quality, concept, is_followup)

            if session_data.summary_manager:
                session_data.summary_manager.add_answer(transcript)

            await self._update_session_state_fast(session_data)
            await self._send_response_with_ultra_fast_audio(session_data, ai_response)

            now_ts = time.time()
            soft_cutoff = getattr(session_data, "soft_cutoff_time", None)
            if session_data.current_stage == SessionStage.TECHNICAL and (not soft_cutoff or now_ts < soft_cutoff):
                session_data.awaiting_user = True

            processing_time = time.time() - start_time
            logger.info("Total processing time: %.2fs", processing_time)

        except Exception as e:
            logger.error("Audio processing error: %s", e)
            if "too small" in str(e).lower():
                error_message = "The audio recording was too short. Please try again."
            elif "transcription" in str(e).lower():
                error_message = "I had trouble understanding the audio. Please speak clearly into your microphone."
            else:
                error_message = "Sorry, there was a technical issue. Please try again."
            await self._send_quick_message(session_data, {"type": "error", "text": error_message, "status": "error"})

    async def _update_session_state_fast(self, session_data: SessionData):
        if session_data.current_stage == SessionStage.GREETING:
            session_data.greeting_count += 1
            if session_data.greeting_count >= config.GREETING_EXCHANGES:
                session_data.current_stage = SessionStage.TECHNICAL
                logger.info("Session %s moved to TECHNICAL stage", session_data.session_id)
        elif session_data.current_stage == SessionStage.TECHNICAL:
            if session_data.summary_manager and not session_data.summary_manager.should_continue_test():
                session_data.current_stage = SessionStage.COMPLETE
                logger.info("Session %s moved to COMPLETE stage", session_data.session_id)
                asyncio.create_task(self._finalize_session_fast(session_data))

    async def _finalize_session_fast(self, session_data: SessionData):
        try:
            evaluation, score = await self.conversation_manager.generate_fast_evaluation(session_data)
            save_success = await self.db_manager.save_session_result_fast(session_data, evaluation, score)
            if not save_success:
                logger.error("Failed to save session %s", session_data.session_id)

            completion_message = f"Great job! Your standup session is complete. You scored {score}/10. Thank you!"
            await self._send_quick_message(session_data, {
                "type": "conversation_end",
                "text": completion_message,
                "evaluation": evaluation,
                "score": score,
                "pdf_url": f"/daily_standup/download_results/{session_data.session_id}",
                "status": "complete",
            })

            # ⬇️ PASS session_id
            async for audio_chunk in self.tts_processor.generate_ultra_fast_stream(
                completion_message, session_id=session_data.session_id
            ):
                if audio_chunk:
                    await self._send_quick_message(session_data, {
                        "type": "audio_chunk",
                        "audio": audio_chunk.hex(),
                        "status": "complete",
                    })

            await self._send_quick_message(session_data, {"type": "audio_end", "status": "complete"})
            session_data.is_active = False
            logger.info("Session %s finalized and saved", session_data.session_id)
        except Exception as e:
            logger.error("Fast session finalization error: %s", e)
            session_data.is_active = False

    async def _send_response_with_ultra_fast_audio(self, session_data: SessionData, text: str):
        try:
            await self._send_quick_message(session_data, {
                "type": "ai_response",
                "text": text,
                "status": session_data.current_stage.value,
            })
            chunk_count = 0
            # ⬇️ PASS session_id
            async for audio_chunk in self.tts_processor.generate_ultra_fast_stream(
                text, session_id=session_data.session_id
            ):
                if audio_chunk and session_data.is_active:
                    await self._send_quick_message(session_data, {
                        "type": "audio_chunk",
                        "audio": audio_chunk.hex(),
                        "status": session_data.current_stage.value,
                    })
                    chunk_count += 1
            await self._send_quick_message(session_data, {"type": "audio_end", "status": session_data.current_stage.value})
            logger.info("Streamed %d audio chunks", chunk_count)
        except Exception as e:
            logger.error("Ultra-fast audio streaming error: %s", e)

    async def _send_quick_message(self, session_data: SessionData, message: dict):
        try:
            if session_data.websocket:
                await session_data.websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error("WebSocket send error: %s", e)

    async def get_session_result_fast(self, session_id: str) -> dict:
        try:
            result = await self.db_manager.get_session_result_fast(session_id)
            if not result:
                raise Exception(f"Session {session_id} not found in database")
            return result
        except Exception as e:
            logger.error("Error fetching session result: %s", e)
            raise Exception(f"Session result retrieval failed: {e}")


# =============================================================================
# FASTAPI APPLICATION - NO DUMMY DATA
# =============================================================================

app = FastAPI(title=config.APP_TITLE, version=config.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOW_ORIGINS,
    allow_credentials=config.CORS_ALLOW_CREDENTIALS,
    allow_methods=config.CORS_ALLOW_METHODS,
    allow_headers=config.CORS_ALLOW_HEADERS,
)

app.mount("/audio", StaticFiles(directory=str(config.AUDIO_DIR)), name="audio")

session_manager = UltraFastSessionManager()

@app.on_event("startup")
async def startup_event():
    logger.info("Ultra-Fast Daily Standup application starting...")
    try:
        db_manager = DatabaseManager(shared_clients)
        try:
            conn = db_manager.get_mysql_connection()
            conn.close()
            logger.info("MySQL connection test successful")
        except Exception as e:
            logger.error("MySQL connection test failed: %s", e)
            raise Exception(f"MySQL connection failed: {e}")

        try:
            await db_manager.get_mongo_client()
            logger.info("MongoDB connection test successful")
        except Exception as e:
            logger.error("MongoDB connection test failed: %s", e)
            raise Exception(f"MongoDB connection failed: {e}")

        logger.info("All database connections verified")
    except Exception as e:
        logger.error("Startup failed: %s", e)

@app.on_event("shutdown")
async def shutdown_event():
    await shared_clients.close_connections()
    await session_manager.db_manager.close_connections()
    logger.info("Daily Standup application shutting down")

@app.get("/start_test")
async def start_standup_session_fast():
    try:
        logger.info("Starting real standup session...")
        session_data = await session_manager.create_session_fast()
        greeting = "Hello! Welcome to your daily standup. How are you doing today?"
        logger.info("Real session created: %s", session_data.test_id)
        return {
            "status": "success",
            "message": "Session started successfully",
            "test_id": session_data.test_id,
            "session_id": session_data.session_id,
            "websocket_url": f"/daily_standup/ws/{session_data.session_id}",
            "greeting": greeting,
            "student_name": session_data.student_name,
            "fragments_count": len(session_data.fragment_keys) if session_data.fragment_keys else 0,
            "estimated_duration": len(session_data.fragment_keys) * session_data.questions_per_concept * config.ESTIMATED_SECONDS_PER_QUESTION,
        }
    except Exception as e:
        logger.error("Error starting session: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to start session: {str(e)}")

@app.websocket("/ws/{session_id}")
async def websocket_endpoint_ultra_fast(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        logger.info("WebSocket connected for session: %s", session_id)
        session_data = session_manager.active_sessions.get(session_id)
        if not session_data:
            logger.error("Session %s not found in active sessions", session_id)
            await websocket.send_text(json.dumps({
                "type": "error",
                "text": f"Session {session_id} not found. Please start a new session.",
                "status": "error",
            }))
            return

        session_data.websocket = websocket
        greeting = f"Hello {session_data.student_name}! Welcome to your daily standup. How are you doing today?"
        await websocket.send_text(json.dumps({"type": "ai_response", "text": greeting, "status": "greeting"}))
        # ⬇️ PASS session_id so we use the pinned voice
        async for audio_chunk in session_manager.tts_processor.generate_ultra_fast_stream(
            greeting, session_id=session_id
        ):
            if audio_chunk:
                await websocket.send_text(json.dumps({"type": "audio_chunk", "audio": audio_chunk.hex(), "status": "greeting"}))
        await websocket.send_text(json.dumps({"type": "audio_end", "status": "greeting"}))

        while session_data.is_active:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=config.WEBSOCKET_TIMEOUT)
                message = json.loads(data)
                if message.get("type") == "audio_data":
                    audio_data = base64.b64decode(message.get("audio", ""))
                    asyncio.create_task(session_manager.process_audio_ultra_fast(session_id, audio_data))
                elif message.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                logger.info("WebSocket timeout: %s", session_id)
                break
            except WebSocketDisconnect:
                logger.info("WebSocket disconnected: %s", session_id)
                break
            except Exception as e:
                logger.error("WebSocket error: %s", e)
                await websocket.send_text(json.dumps({"type": "error", "text": f"Error: {str(e)}", "status": "error"}))
                break
    except Exception as e:
        logger.error("WebSocket endpoint error: %s", e)
    finally:
        await session_manager.remove_session(session_id)
