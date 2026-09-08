/**
 * VoiceShieldAI - Transcription Service (AssemblyAI)
 * Functionality 5: Speech-to-text with word/segment timestamps and confidence
 */

import { AssemblyAI } from 'assemblyai';
import fs from 'fs';
import { config } from '../config/index.js';
import { withRetries, withTimeout } from '../core/resilience.js';

let assemblyClient = null;

function getClient() {
  if (!config.assemblyAiApiKey) {
    return null;
  }
  if (!assemblyClient) {
    assemblyClient = new AssemblyAI({ apiKey: config.assemblyAiApiKey });
  }
  return assemblyClient;
}

/**
 * Transcribes an audio file or buffer
 * @param {string|Buffer} audioInput - File path or audio Buffer
 * @returns {Promise<object>} Normalized transcription object
 */
export async function transcribeAudio(audioInput) {
  const client = getClient();
  if (!client) {
    console.warn('[TranscriptionService] ASSEMBLYAI_API_KEY not configured.');
    return {
      available: false,
      text: '',
      confidence: null,
      segments: [],
      error: 'ASSEMBLYAI_API_KEY is not configured.'
    };
  }

  try {
    console.log('[Transcription] Submitting audio for transcription...');
    const transcript = await withRetries(() => withTimeout(() => client.transcripts.transcribe({
      audio: audioInput, punctuate: true, format_text: true, speech_models: ['universal-2']
    }), config.timeouts.assemblyAI, 'Transcription provider'),
    { retries: config.retry.maxRetries, delayMs: config.retry.retryDelayMs });

    if (transcript.status === 'error') {
      console.error('[Transcription] AssemblyAI error:', transcript.error);
      return {
        available: false,
        text: '',
        confidence: 0,
        segments: [],
        error: transcript.error || 'Transcription failed'
      };
    }

    // Format segments from words or utterances
    const segments = [];
    if (transcript.utterances && transcript.utterances.length > 0) {
      transcript.utterances.forEach(u => {
        segments.push({
          start: Number((u.start / 1000).toFixed(2)),
          end: Number((u.end / 1000).toFixed(2)),
          text: u.text,
          ...(u.confidence == null ? {} : { confidence: u.confidence })
        });
      });
    } else if (transcript.words && transcript.words.length > 0) {
      // Chunk words into ~4-second segment windows
      let currentChunk = [];
      let chunkStart = transcript.words[0].start;

      for (let i = 0; i < transcript.words.length; i++) {
        const w = transcript.words[i];
        currentChunk.push(w.text);
        if (w.end - chunkStart >= 4000 || i === transcript.words.length - 1) {
          segments.push({
            start: Number((chunkStart / 1000).toFixed(2)),
            end: Number((w.end / 1000).toFixed(2)),
            text: currentChunk.join(' '),
            ...(w.confidence == null ? {} : { confidence: Number(w.confidence.toFixed(2)) })
          });
          currentChunk = [];
          if (i + 1 < transcript.words.length) {
            chunkStart = transcript.words[i + 1].start;
          }
        }
      }
    } else if (transcript.text) {
      segments.push({
        start: 0.0,
        end: Number(((transcript.audio_duration || 5000) / 1000).toFixed(2)),
        text: transcript.text,
        ...(transcript.confidence == null ? {} : { confidence: transcript.confidence })
      });
    }

    console.log(`[Transcription] Completed. Text length: ${transcript.text?.length || 0}`);

    return {
      available: true,
      provider: 'assemblyai',
      language: transcript.language_code || transcript.language || null,
      text: transcript.text || '',
      confidence: transcript.confidence == null ? null : Number(transcript.confidence.toFixed(2)),
      duration: transcript.audio_duration ? Number((transcript.audio_duration / 1000).toFixed(2)) : null,
      segments
    };
  } catch (err) {
    console.error('[Transcription] Error calling AssemblyAI:', err.message);
    return {
      available: false,
      provider: 'assemblyai',
      text: '',
      confidence: null,
      segments: [],
      error: err.message
    };
  }
}
