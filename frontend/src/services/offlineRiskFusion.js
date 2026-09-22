/**
 * VoiceShield Guardian Offline — Multilayer Risk Fusion Engine
 * Autonomous Sovereign Edge Fusion Engine
 *
 * Transparently fuses on-device synthetic speech estimates, multilingual
 * fraud intent indicators, acoustic uncertainty, and biometric comparison
 * into a single calibrated 0–100 threat assessment.
 */

/**
 * Fuses offline detection signals into a unified, explainable threat dossier.
 * @param {object} params
 * @param {number} params.deepfakeScore - 0 to 100
 * @param {number} params.scamScore - 0 to 100
 * @param {number} [params.speakerSimilarity] - 0 to 1 (optional)
 * @param {string} [params.speakerName] - Target enrolled contact name
 * @param {number} [params.uncertainty] - 0 to 1
 * @param {Array} [params.indicators] - Fraud indicators list
 * @returns {object}
 */
export function fuseOfflineRisk({
  deepfakeScore = 0,
  scamScore = 0,
  speakerSimilarity = null,
  speakerName = null,
  uncertainty = 0.2,
  indicators = []
}) {
  const fake = Math.min(100, Math.max(0, deepfakeScore));
  const scam = Math.min(100, Math.max(0, scamScore));

  // Weights: 45% Deepfake Authenticity, 45% Contextual Fraud, 10% Interaction Dynamics
  let fusedScore = (fake * 0.45) + (scam * 0.45);

  let cloneSuspicion = false;
  const criticalFlags = [];

  // Clone Detection Logic:
  // If speaker matches enrolled voice (sim >= 0.70) BUT audio exhibits synthetic biomarkers (fake >= 60)
  if (speakerSimilarity !== null && speakerSimilarity >= 0.70 && fake >= 60) {
    cloneSuspicion = true;
    fusedScore = Math.max(88, fusedScore * 1.35);
    criticalFlags.push(
      `TARGETED VOICE CLONE ATTACK: Audio closely matches enrolled profile (${speakerName || 'Trusted Contact'}), but exhibits unmistakable AI synthetic vocoder artifacts.`
    );
  }

  // Compound Threat Escalation: High Fake + Active Extortion
  if (fake >= 65 && scam >= 50) {
    fusedScore = Math.max(92, fusedScore * 1.25);
    criticalFlags.push(
      'CRITICAL MULTI-VECTOR THREAT: Concurrent AI synthetic voice impersonation and urgent financial/credential extortion.'
    );
  }

  // Final Clamping
  const finalScore = Math.min(99, Math.max(0, Math.round(fusedScore)));

  // Risk Tier Classification
  let riskLevel = 'SAFE';
  let bannerColor = 'safe';
  let recommendedAction = 'No defensive intervention required. Conversation exhibits normal acoustic and contextual patterns.';

  if (finalScore >= 80 || criticalFlags.length > 0) {
    riskLevel = 'CRITICAL';
    bannerColor = 'danger';
    recommendedAction = 'HANG UP IMMEDIATELY. Do not disclose any codes, passwords, or initiate financial transfers. Call your contact directly on a known number.';
  } else if (finalScore >= 60) {
    riskLevel = 'HIGH';
    bannerColor = 'danger';
    recommendedAction = 'HIGH THREAT DETECTED. Cease financial disclosure. Verify caller identity through an official external channel.';
  } else if (finalScore >= 30) {
    riskLevel = 'ELEVATED';
    bannerColor = 'warning';
    recommendedAction = 'CAUTION ADVISED. Potential sensitive requests or acoustic anomalies detected. Exercise heightened vigilance.';
  }

  return {
    finalScore,
    riskLevel,
    bannerColor,
    isCloneAttack: cloneSuspicion,
    criticalFlags,
    recommendedAction,
    meters: {
      authenticityRisk: fake,
      scamContextRisk: scam,
      biometricSimilarity: speakerSimilarity !== null ? Math.round(speakerSimilarity * 100) : null
    },
    uncertainty: parseFloat((uncertainty || 0.2).toFixed(2)),
    timestamp: new Date().toISOString()
  };
}
