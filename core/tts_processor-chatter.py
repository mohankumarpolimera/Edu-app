# Edu-app/core/tts_processor.py
# Unified TTS processors for daily_standup and weekly_interview
# Replaced Edge TTS with ChatterboxTTS (voice cloning via audio prompt)
# Namespaced: DS_TTSProcessor, WI_TTSProcessor

import re
import io
import logging
import asyncio
from typing import List, AsyncGenerator, Optional, Iterable, Tuple

import torch
import torchaudio as ta
from chatterbox.tts import ChatterboxTTS

from .config import config

logger = logging.getLogger(__name__)

# =============================================================================
# Shared Chatterbox Engine (singleton-ish) to avoid reloading model per call
# =============================================================================

class _ChatterboxEngine:
    _model: Optional[ChatterboxTTS] = None
    _sr: Optional[int] = None
    _device: Optional[str] = None
    _lock = asyncio.Lock()

    @classmethod
    async def get(cls) -> Tuple[ChatterboxTTS, int, str]:
        if cls._model is not None:
            return cls._model, cls._sr, cls._device
        async with cls._lock:
            if cls._model is not None:
                return cls._model, cls._sr, cls._device
            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"[TTS] Loading ChatterboxTTS on device={device} ...")
            # You can pass model_id or cache_dir if you have a specific checkpoint
            model = await asyncio.to_thread(ChatterboxTTS.from_pretrained, device=device)
            cls._model = model
            cls._sr = getattr(model, "sr", 24000)  # default fallback
            cls._device = device
            logger.info(f"[TTS] ChatterboxTTS loaded (sr={cls._sr})")
            return cls._model, cls._sr, cls._device


# Utility: encode a mono torch tensor to WAV bytes
def _tensor_to_wav_bytes(waveform: torch.Tensor, sr: int) -> bytes:
    """
    waveform: torch.Tensor shape [T] or [1, T], dtype float32/float64 in [-1,1]
    returns: WAV bytes
    """
    if waveform.dim() == 1:
        waveform = waveform.unsqueeze(0)  # [1, T]
    buf = io.BytesIO()
    # torchaudio.save expects CPU tensor
    wf = waveform.detach().cpu()
    ta.save(buf, wf, sr, format="wav")
    return buf.getvalue()


# Utility: run a blocking generator without freezing the event loop, yielding results as they arrive
async def _stream_in_executor(gen_fn, *args, **kwargs) -> AsyncGenerator:
    """
    Bridges a blocking generator (like model.generate_stream) into an async generator.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue(maxsize=8)
    SENTINEL = object()

    def _runner():
        try:
            for item in gen_fn(*args, **kwargs):
                # item is (audio_chunk_tensor, metrics)
                asyncio.run_coroutine_threadsafe(queue.put(item), loop)
        except Exception as e:
            asyncio.run_coroutine_threadsafe(queue.put(e), loop)
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(SENTINEL), loop)

    await asyncio.to_thread(_runner)  # start the runner in a thread (returns immediately)
    while True:
        item = await queue.get()
        if item is SENTINEL:
            break
        if isinstance(item, Exception):
            raise item
        yield item


# =============================================================================
# DAILY STANDUP VERSION (static config -> single audio prompt)
# =============================================================================

class DS_TTSProcessor:
    """
    Ultra-fast TTS processor (Daily Standup version) using ChatterboxTTS.
    - Static audio prompt (voice clone) via config.TTS_AUDIO_PROMPT_PATH
    - Streams WAV bytes chunk-by-chunk for minimal latency
    Config additions expected (if not present, add to your .env/config):
      TTS_AUDIO_PROMPT_PATH
      TTS_EXAGGERATION (float, e.g., 0.7)
      TTS_CFG_WEIGHT (float, e.g., 0.3)
      TTS_CHUNK_SIZE (int frames or model-native units; we use same name)
    """
    def __init__(self):
        # Keep names for compatibility, though Chatterbox doesn’t use rate/voice strings
        self.audio_prompt_path = getattr(config, "TTS_AUDIO_PROMPT_PATH", "reference_voice.wav")
        self.exaggeration = float(getattr(config, "TTS_EXAGGERATION", 0.7))
        self.cfg_weight = float(getattr(config, "TTS_CFG_WEIGHT", 0.3))
        self.chunk_size = int(getattr(config, "TTS_CHUNK_SIZE", 25))  # lower => lower latency

    def split_text_optimized(self, text: str) -> List[str]:
        """Optimized text splitting for minimal latency (kept from your original)."""
        sentences = re.split(r'[.!?]+', text)
        chunks, current_chunk = [], ""
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            # Use larger packing factor, as model benefits from coherent phrases
            max_len = max(80, self.chunk_size * 12)
            if len(current_chunk) + len(sentence) > max_len:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                current_chunk += " " + sentence if current_chunk else sentence
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        return chunks if chunks else [text]

    async def generate_ultra_fast_stream(self, text: str) -> AsyncGenerator[bytes, None]:
        """
        Streams WAV bytes. First chunk is yielded as soon as the model emits audio.
        """
        if not text or not text.strip():
            raise Exception("Empty text for TTS")
        model, sr, _device = await _ChatterboxEngine.get()

        # Stream whole text (let the model chunk internally), but we also allow
        # external chunking when text is long, to parallelize future enhancements.
        chunks = self.split_text_optimized(text)
        for i, chunk in enumerate(chunks):
            # Bridge the sync generator to async
            async for (audio_tensor, metrics) in _stream_in_executor(
                model.generate_stream,
                chunk,
                audio_prompt_path=self.audio_prompt_path,
                exaggeration=self.exaggeration,
                cfg_weight=self.cfg_weight,
                chunk_size=self.chunk_size,
            ):
                if metrics and getattr(metrics, "latency_to_first_chunk", None):
                    # Log only once per outer chunk
                    logger.debug(f"[DS_TTS] First chunk latency: {metrics.latency_to_first_chunk:.3f}s (subchunk of {i+1}/{len(chunks)})")
                if not isinstance(audio_tensor, torch.Tensor) or audio_tensor.numel() == 0:
                    continue
                yield _tensor_to_wav_bytes(audio_tensor, sr)


# =============================================================================
# WEEKLY INTERVIEW VERSION (dynamic prompt selection, retry, health)
# =============================================================================

class WI_TTSProcessor:
    """
    Dynamic TTS processor (Weekly Interview) using ChatterboxTTS.
    - Dynamic audio prompt selection (supports multiple prompt paths)
    - Retries per outer chunk
    - Health check endpoint
    Expected config keys (add if missing):
      TTS_AUDIO_PROMPT_PATH         -> default prompt
      TTS_ALT_PROMPT_PATHS          -> optional CSV of additional prompt paths
      TTS_EXAGGERATION (float)
      TTS_CFG_WEIGHT (float)
      TTS_CHUNK_SIZE (int)
      TTS_MAX_RETRIES (int, e.g., 2)
    """
    def __init__(self):
        self.default_prompt = getattr(config, "TTS_AUDIO_PROMPT_PATH", "ajitha-new-1.wav")
        alt_csv = getattr(config, "TTS_ALT_PROMPT_PATHS", "")
        self.alt_prompts: List[str] = [p.strip() for p in alt_csv.split(",") if p.strip()] if alt_csv else []
        self.exaggeration = float(getattr(config, "TTS_EXAGGERATION", 0.7))
        self.cfg_weight = float(getattr(config, "TTS_CFG_WEIGHT", 0.3))
        self.chunk_size = int(getattr(config, "TTS_CHUNK_SIZE", 25))
        self.max_retries = int(getattr(config, "TTS_MAX_RETRIES", 2))

        # Strategy could later use user/participant locale/profile:
        self.voice_selection_strategy = "dynamic"

    def _select_prompt_path(self) -> str:
        # Simple strategy: prefer default; otherwise first available alt
        return self.default_prompt if self.default_prompt else (self.alt_prompts[0] if self.alt_prompts else "")

    def split_text_optimized(self, text: str) -> List[str]:
        if not text or not text.strip():
            raise Exception("Empty text for TTS")
        if len(text) < 100:
            return [text.strip()]
        elif len(text) < 300:
            return [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
        else:
            sentences = re.split(r'[.!?]+', text)
            chunks, current_chunk = [], ""
            base_chunk_size = max(120, self.chunk_size * 14)
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
        prompt_path = self._select_prompt_path()
        model, sr, _device = await _ChatterboxEngine.get()

        chunks = self.split_text_optimized(text)
        for idx, chunk in enumerate(chunks, start=1):
            # Retry whole outer chunk on failure
            for attempt in range(1, self.max_retries + 1):
                try:
                    async for (audio_tensor, metrics) in _stream_in_executor(
                        model.generate_stream,
                        chunk,
                        audio_prompt_path=prompt_path,
                        exaggeration=self.exaggeration,
                        cfg_weight=self.cfg_weight,
                        chunk_size=self.chunk_size,
                    ):
                        if metrics and getattr(metrics, "latency_to_first_chunk", None):
                            logger.debug(f"[WI_TTS] First subchunk latency: {metrics.latency_to_first_chunk:.3f}s (chunk {idx}/{len(chunks)})")
                        if not isinstance(audio_tensor, torch.Tensor) or audio_tensor.numel() == 0:
                            continue
                        yield _tensor_to_wav_bytes(audio_tensor, sr)
                    # success for this outer chunk → break retry loop
                    break
                except Exception as e:
                    logger.error(f"[WI_TTS] Chunk {idx} attempt {attempt}/{self.max_retries} failed: {e}")
                    if attempt >= self.max_retries:
                        raise
                    await asyncio.sleep(0.8)

    async def health_check(self) -> dict:
        try:
            prompt_path = self._select_prompt_path()
            model, sr, _device = await _ChatterboxEngine.get()

            first_latency: Optional[float] = None
            got_audio = False

            async for (audio_tensor, metrics) in _stream_in_executor(
                model.generate_stream,
                "Test synthesis.",
                audio_prompt_path=prompt_path,
                exaggeration=self.exaggeration,
                cfg_weight=self.cfg_weight,
                chunk_size=max(10, self.chunk_size // 2),
            ):
                if not first_latency and metrics and getattr(metrics, "latency_to_first_chunk", None):
                    first_latency = float(metrics.latency_to_first_chunk)
                if isinstance(audio_tensor, torch.Tensor) and audio_tensor.numel() > 0:
                    got_audio = True
                    break  # one subchunk is enough for health

            return {
                "status": "healthy" if got_audio else "degraded",
                "first_chunk_latency": first_latency,
                "prompt_path": prompt_path,
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}
