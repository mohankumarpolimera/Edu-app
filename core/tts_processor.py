# Edu-app/core/tts_processor.py
# Unified TTS processors for daily_standup and weekly_interview
# Namespaced: DS_TTSProcessor, WI_TTSProcessor

import re
import logging
import asyncio
import edge_tts
from typing import List, AsyncGenerator

from .config import config

logger = logging.getLogger(__name__)

# =============================================================================
# DAILY STANDUP VERSION
# =============================================================================

class DS_TTSProcessor:
    """
    Ultra-fast TTS processor (Daily Standup version)
    Uses static config values for voice & rate
    """
    def __init__(self):
        self.voice = config.TTS_VOICE
        self.rate = config.TTS_RATE

    def split_text_optimized(self, text: str) -> List[str]:
        """Optimized text splitting for minimal latency"""
        sentences = re.split(r'[.!?]+', text)
        chunks, current_chunk = [], ""
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            if len(current_chunk) + len(sentence) > config.TTS_CHUNK_SIZE * 5:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                current_chunk += " " + sentence if current_chunk else sentence
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        return chunks if chunks else [text]

    async def generate_ultra_fast_stream(self, text: str) -> AsyncGenerator[bytes, None]:
        """Ultra-fast audio generation with parallel processing"""
        try:
            chunks = self.split_text_optimized(text)
            tasks = []
            for i, chunk in enumerate(chunks):
                if not chunk.strip():
                    continue
                if i == 0:
                    async for audio_chunk in self._generate_chunk_audio(chunk):
                        if audio_chunk:
                            yield audio_chunk
                else:
                    tasks.append(self._generate_chunk_audio(chunk))
            for task in tasks:
                async for audio_chunk in task:
                    if audio_chunk:
                        yield audio_chunk
        except Exception as e:
            logger.error(f"[DS_TTS] Ultra-fast TTS error: {e}")
            raise Exception(f"TTS generation failed: {e}")

    async def _generate_chunk_audio(self, chunk: str) -> AsyncGenerator[bytes, None]:
        try:
            tts = edge_tts.Communicate(chunk, self.voice, rate=self.rate)
            audio_data = b""
            async for tts_chunk in tts.stream():
                if tts_chunk["type"] == "audio":
                    audio_data += tts_chunk["data"]
            if audio_data:
                yield audio_data
            else:
                raise Exception("EdgeTTS returned empty audio data")
        except Exception as e:
            logger.error(f"[DS_TTS] Chunk error: {e}")
            raise Exception(f"TTS chunk generation failed: {e}")


# =============================================================================
# WEEKLY INTERVIEW VERSION
# =============================================================================

class WI_TTSProcessor:
    """
    Dynamic TTS processor (Weekly Interview version)
    Dynamic voice selection, retries, and health checks
    """
    def __init__(self):
        self.voice = config.TTS_VOICE
        self.rate = config.TTS_SPEED
        self.available_voices = None
        self._voices_checked = False
        self.voice_selection_strategy = "dynamic"

    async def _check_voice_availability(self):
        if self._voices_checked:
            return
        voices = await edge_tts.list_voices()
        self.available_voices = [v["Name"] for v in voices]
        voice_preferences = [
            config.TTS_VOICE,
            *[v for v in self.available_voices if "en-US" in v and "JennyNeural" in v],
            *[v for v in self.available_voices if "en-US" in v and "Neural" in v],
            *[v for v in self.available_voices if "en-GB" in v and "Neural" in v],
            *[v for v in self.available_voices if "en-AU" in v and "Neural" in v],
            *[v for v in self.available_voices if "en-IN" in v and "Neural" in v],
            *[v for v in self.available_voices if "en-" in v and "Neural" in v],
            *[v for v in self.available_voices if "en-" in v],
        ]
        seen, unique = set(), []
        for v in voice_preferences:
            if v and v not in seen and v in self.available_voices:
                unique.append(v)
                seen.add(v)
        if not unique:
            raise Exception("NO SUITABLE ENGLISH VOICES FOUND!")
        self.voice = unique[0]
        self._voices_checked = True

    def split_text_optimized(self, text: str) -> List[str]:
        if not text or not text.strip():
            raise Exception("Empty text for TTS")
        base_chunk_size = config.TTS_CHUNK_SIZE * 5
        if len(text) < 100:
            return [text.strip()]
        elif len(text) < 300:
            return [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
        else:
            sentences = re.split(r'[.!?]+', text)
            chunks, current_chunk = [], ""
            for s in sentences:
                s = s.strip()
                if not s:
                    continue
                if len(current_chunk) + len(s) > base_chunk_size:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    current_chunk = s
                else:
                    current_chunk += " " + s if current_chunk else s
            if current_chunk.strip():
                chunks.append(current_chunk.strip())
            return chunks if chunks else [text.strip()]

    async def generate_ultra_fast_stream(self, text: str) -> AsyncGenerator[bytes, None]:
        if not text.strip():
            raise Exception("Empty text for TTS")
        await self._check_voice_availability()
        chunks = self.split_text_optimized(text)
        for i, chunk in enumerate(chunks):
            audio_data = await self._generate_chunk_audio_with_dynamic_retry(chunk, i + 1)
            yield audio_data

    async def _generate_chunk_audio_with_dynamic_retry(self, chunk: str, idx: int, max_retries: int = 2) -> bytes:
        for attempt in range(max_retries):
            try:
                tts = edge_tts.Communicate(text=chunk, voice=self.voice, rate=self.rate)
                audio_data = b""
                async for tts_chunk in tts.stream():
                    if tts_chunk["type"] == "audio" and tts_chunk["data"]:
                        audio_data += tts_chunk["data"]
                if not audio_data:
                    raise Exception("Empty audio data")
                return audio_data
            except Exception as e:
                logger.error(f"[WI_TTS] Attempt {attempt+1}/{max_retries} failed: {e}")
                if attempt == max_retries - 1:
                    raise
                await asyncio.sleep(1.0)

    async def health_check(self) -> dict:
        try:
            await self._check_voice_availability()
            test_audio = await self._generate_chunk_audio_with_dynamic_retry("Test", 0, max_retries=1)
            return {
                "status": "healthy" if test_audio else "degraded",
                "voice": self.voice,
                "voices_found": len(self.available_voices or []),
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}