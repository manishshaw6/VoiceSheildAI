/**
 * VoxShield Validation — ECAPA-TDNN Speaker Calibration
 * Evaluates SpeechBrain ECAPA-TDNN embeddings on test samples.
 * Computes pairwise cosine similarities and recommends a threshold.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MlServiceClient } from '../src/integrations/mlServiceClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, 'samples');
const METADATA_PATH = path.join(__dirname, 'metadata.json');

const mlClient = new MlServiceClient({ baseUrl: 'http://127.0.0.1:8001', timeoutMs: 30000 });

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return null;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function main() {
  console.log('====================================================');
  console.log('🔬 VoxShield — Phase 3: ECAPA-TDNN Speaker Calibration');
  console.log('====================================================\n');

  // Verify ML service health
  const health = await mlClient.health();
  console.log('ML Service Health:', JSON.stringify(health.ecapa));
  if (!health.ecapa?.loaded) {
    console.error('❌ ECAPA model not loaded in ML service!');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
  const embeddings = {};
  const latencies = [];

  console.log(`\n1. Extracting embeddings for ${metadata.length} samples...`);
  for (const item of metadata) {
    const filePath = path.join(SAMPLES_DIR, item.filename);
    const audioBuffer = fs.readFileSync(filePath);
    const start = Date.now();
    const resp = await mlClient.speakerEmbedding(audioBuffer, item.filename);
    const latency = Date.now() - start;
    latencies.push(latency);

    if (resp.available && Array.isArray(resp.embedding)) {
      embeddings[item.sample_id] = {
        embedding: resp.embedding,
        dimensions: resp.embedding.length,
        speechDuration: resp.speech_duration,
        latencyMs: latency
      };
      console.log(`  ✓ ${item.filename}: ${resp.embedding.length} dims, speech=${resp.speech_duration}s (${latency}ms)`);
    } else {
      embeddings[item.sample_id] = {
        error: resp.reason || 'unavailable',
        latencyMs: latency
      };
      console.log(`  ⚠ ${item.filename}: Rejected / Unavailable (${resp.reason}) (${latency}ms)`);
    }
  }

  // Pairwise Similarity Matrix
  const sampleIds = Object.keys(embeddings).filter(id => embeddings[id].embedding);
  console.log('\n2. Pairwise Cosine Similarity Matrix:');
  console.log(''.padEnd(28) + sampleIds.map(s => s.replace('sample_', '').substring(0, 10).padEnd(12)).join(''));

  const matrix = {};
  for (const idA of sampleIds) {
    matrix[idA] = {};
    let rowStr = idA.replace('sample_', '').substring(0, 26).padEnd(28);
    for (const idB of sampleIds) {
      const sim = cosineSimilarity(embeddings[idA].embedding, embeddings[idB].embedding);
      matrix[idA][idB] = sim;
      rowStr += (sim !== null ? sim.toFixed(4) : 'N/A').padEnd(12);
    }
    console.log(rowStr);
  }

  // Target Comparisons
  console.log('\n3. Speaker Verification Key Scenarios:');
  const genuineA = embeddings['sample_A_genuine_enrolled']?.embedding;
  const sameB = embeddings['sample_B_same_speaker']?.embedding;
  const diffC = embeddings['sample_C_different_speaker']?.embedding;
  const scamD = embeddings['sample_D_different_scam']?.embedding;
  const synthE = embeddings['sample_E_synthetic_generic']?.embedding;

  const sameSim = genuineA && sameB ? cosineSimilarity(genuineA, sameB) : null;
  const diffSim = genuineA && diffC ? cosineSimilarity(genuineA, diffC) : null;
  const scamSim = genuineA && scamD ? cosineSimilarity(genuineA, scamD) : null;
  const synthSim = genuineA && synthE ? cosineSimilarity(genuineA, synthE) : null;

  console.log(`  - Genuine (A) vs Same Speaker (B):      cosine = ${sameSim?.toFixed(4)}`);
  console.log(`  - Genuine (A) vs Different Speaker (C): cosine = ${diffSim?.toFixed(4)}`);
  console.log(`  - Genuine (A) vs Different Scam (D):    cosine = ${scamSim?.toFixed(4)}`);
  console.log(`  - Genuine (A) vs Synthetic Generic (E): cosine = ${synthSim?.toFixed(4)}`);

  // Recommended Threshold
  let recommendedThreshold = 0.70;
  if (sameSim !== null && diffSim !== null) {
    recommendedThreshold = Number(((sameSim + diffSim) / 2).toFixed(2));
    console.log(`\n4. Recommended Empirical Threshold: ${recommendedThreshold} (Separation: ${(sameSim - diffSim).toFixed(4)})`);
  }

  const results = {
    timestamp: new Date().toISOString(),
    ml_health: health,
    embeddings_summary: Object.entries(embeddings).map(([id, info]) => ({
      sample_id: id,
      available: !info.error,
      dimensions: info.dimensions || 0,
      speech_duration: info.speechDuration || 0,
      latency_ms: info.latencyMs,
      error: info.error || null
    })),
    pairwise_matrix: matrix,
    key_scenarios: {
      same_speaker_sim: sameSim,
      diff_speaker_sim: diffSim,
      scam_speaker_sim: scamSim,
      synth_speaker_sim: synthSim,
      recommended_threshold: recommendedThreshold
    }
  };

  const resultsDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, 'ecapa_calibration_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results written to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal calibration error:', err);
  process.exit(1);
});
