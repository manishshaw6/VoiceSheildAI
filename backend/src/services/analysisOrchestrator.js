import { performance } from 'perf_hooks';
import { assessAudioQuality } from '../audio/qualityGate.js';
import { preprocessWav } from '../audio/preprocessor.js';
import { voiceActivityDetector } from '../audio/vadService.js';
import { createForensicRecord } from '../audio/hashService.js';
import { getIntelligenceProvider } from '../integrations/providers.js';
import { calculateFusedRisk } from './riskEngine.js';
import { evaluatePolicy } from '../policy/policyEngine.js';
import { explainAssessment } from './explainabilityService.js';
import { createEvidence } from '../schemas/evidence.js';
import { EvidenceCategory, Severity, AuditAction } from '../core/constants.js';
import { config } from '../config/index.js';
import { getCachedAnalysis as getCache, setCachedAnalysis as setCache } from '../audio/hashService.js';
import { createIncident } from './incidentService.js';
import { recordAudit } from './auditService.js';

const elapsed = start => Math.round(performance.now() - start);

export async function orchestrateAnalysis({ analysisId, requestId, filePath, audioBuffer, originalName, targetSpeakerId = null }) {
  const totalStart = performance.now();
  const forensic = createForensicRecord(originalName, audioBuffer);
  const cached = config.cache.enabled ? getCache(forensic.sha256, config.cache.ttlSec) : null;
  if (cached) return { ...cached, analysisId, requestId, timestamp: new Date().toISOString(), cached: true,
    cachedFromAnalysisId: cached.analysisId };

  await recordAudit(AuditAction.ANALYSIS_STARTED, { resource: analysisId, callId: analysisId, requestId,
    metadata: { filename: originalName, size: audioBuffer.length } });

  const qualityStart = performance.now();
  const audioQuality = assessAudioQuality(audioBuffer, originalName);
  const telemetry = { audioQualityMs: elapsed(qualityStart) };
  const qualityEvidence = createEvidence({ callId: analysisId, category: EvidenceCategory.AUDIO_QUALITY,
    source: 'audio_quality_gate', score: 1 - audioQuality.qualityScore, confidence: 1,
    reliability: 1, quality: audioQuality.qualityScore, weight: 0,
    severity: audioQuality.usable ? Severity.LOW : Severity.HIGH,
    explanation: audioQuality.usable ? 'Audio passed the quality gate.' : 'Audio quality is insufficient for reliable analysis.' });
  if (!audioQuality.usable) return { success: false, analysisId, requestId, timestamp: new Date().toISOString(),
    state: 'AUDIO_UNUSABLE', audioQuality, forensic, evidence: [qualityEvidence],
    unavailable: ['deepfake', 'speaker', 'transcription', 'context'], telemetry: { ...telemetry, totalMs: elapsed(totalStart) } };

  const preprocessed = preprocessWav(audioBuffer, { targetSampleRate: config.audio.targetSampleRate });
  const vad = preprocessed ? voiceActivityDetector.detect(preprocessed.samples, preprocessed.sampleRate) :
    { available: false, windows: [], speechDuration: null, speechRatio: null, reason: 'VAD requires decodable PCM WAV audio.' };

  const stageStarts = { deepfake: performance.now(), stt: performance.now(), speaker: performance.now() };
  const deepfakeProvider = getIntelligenceProvider('deepfake');
  const transcriptionProvider = getIntelligenceProvider('transcription');
  const speakerProvider = getIntelligenceProvider('speaker');
  const [deepfake, transcription, speaker] = await Promise.all([
    deepfakeProvider.analyze(filePath).then(value => { telemetry.deepfakeMs = elapsed(stageStarts.deepfake); return value; }),
    transcriptionProvider.transcribe(filePath).then(value => { telemetry.sttMs = elapsed(stageStarts.stt); return value; }),
    speakerProvider.verify({ audioBuffer, targetSpeakerId, threshold: config.speaker.matchThreshold })
      .then(value => { telemetry.speakerMs = elapsed(stageStarts.speaker); return value; })
  ]);

  const contextStart = performance.now();
  const contextAnalysis = transcription.available
    ? await getIntelligenceProvider('context').analyze({ callId: analysisId, text: transcription.text, segments: transcription.segments })
    : { context: null, evidence: [], rules: null, llm: null };
  telemetry.contextMs = elapsed(contextStart);

  const evidence = [qualityEvidence, ...contextAnalysis.evidence];
  if (deepfake.available && deepfake.score != null) evidence.push(createEvidence({ callId: analysisId,
    category: EvidenceCategory.VOICE_SYNTHETIC, source: deepfake.provider, score: deepfake.score,
    confidence: deepfake.confidence, reliability: 0.9, quality: audioQuality.qualityScore,
    weight: config.riskWeights.deepfake, severity: deepfake.score >= 0.8 ? Severity.CRITICAL : Severity.MEDIUM,
    explanation: deepfake.score >= 0.7 ? 'Synthetic speech indicators were detected with high confidence.' : 'Voice authenticity analysis completed.' }));
  if (speaker.enrolled && speaker.similarity != null) evidence.push(createEvidence({ callId: analysisId,
    category: speaker.match ? EvidenceCategory.SPEAKER_MATCH : EvidenceCategory.SPEAKER_MISMATCH,
    source: 'local_speaker', score: speaker.match ? speaker.similarity : 1 - speaker.similarity,
    confidence: speaker.confidence, reliability: 0.65, quality: audioQuality.qualityScore,
    weight: speaker.match ? 0 : config.riskWeights.speaker, severity: speaker.match ? Severity.LOW : Severity.HIGH,
    explanation: speaker.match ? 'The voice matched the enrolled speaker.' : 'The voice did not match the enrolled speaker.' }));

  const fusionStart = performance.now();
  const risk = calculateFusedRisk({ evidence, speakerResult: speaker, audioQuality });
  const policy = evaluatePolicy(risk);
  const explanation = explainAssessment(evidence, policy);
  risk.recommendedAction = explanation.recommendedResponse;
  telemetry.fusionMs = elapsed(fusionStart);
  telemetry.totalMs = elapsed(totalStart);
  const unavailable = [!deepfake.available && 'deepfake', !transcription.available && 'transcription',
    !speaker.enrolled && 'speaker', !contextAnalysis.context && 'context'].filter(Boolean);

  let incident = null;
  if (policy.createIncident) {
    incident = await createIncident({ callId: analysisId, risk, evidence, transcription,
      speaker, authenticity: deepfake, policy, forensic });
    await recordAudit(AuditAction.INCIDENT_CREATED, { resource: incident.incidentId, callId: analysisId,
      requestId, metadata: { severity: risk.level, score: risk.score } });
  }
  await recordAudit(AuditAction.RISK_UPDATED, { resource: analysisId, callId: analysisId, requestId,
    metadata: { score: risk.score, level: risk.level, confidence: risk.confidence } });

  const indicators = [
    ...(contextAnalysis.rules?.indicators || []).map(item => ({ ...item, source: 'rule_engine' })),
    ...(contextAnalysis.llm?.indicators || []).map(item => ({ ...item, source: contextAnalysis.llm.provider,
      label: String(item.type || 'Context signal').replace(/_/g, ' '), severity: contextAnalysis.llm.severity }))
  ];
  const phraseEvidence = contextAnalysis.context?.evidence || [];
  const timeline = (transcription.segments || []).map(segment => {
    const matches = phraseEvidence.filter(item => item.start === segment.start && item.end === segment.end);
    const riskScore = matches.reduce((peak, item) => Math.max(peak,
      item.severity === 'CRITICAL' ? 90 : item.severity === 'HIGH' ? 70 : item.severity === 'MEDIUM' ? 45 : 20), 0);
    return { start: segment.start, end: segment.end, text: segment.text, risk: riskScore,
      flagged: matches.length > 0, indicators: matches.map(item => item.type.replace(/_/g, ' ')) };
  });

  const result = { success: true, analysisId, requestId, timestamp: new Date().toISOString(), filename: originalName,
    duration: audioQuality.duration || transcription.duration || 0, audioQuality, preprocessing: {
      normalized: Boolean(preprocessed), sampleRate: preprocessed?.sampleRate || null, vad
    }, forensic, deepfake: { ...deepfake, fakeProbability: deepfake.score }, transcription, speaker,
    scam: contextAnalysis.llm, threatRules: contextAnalysis.rules, context: contextAnalysis.context,
    evidence, indicators, timeline,
    risk, policy, explanation, incident, unavailable, cached: false,
    ...(config.isDevelopment ? { telemetry } : {}) };
  if (config.cache.enabled) setCache(forensic.sha256, result);
  return result;
}
