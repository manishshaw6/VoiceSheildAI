/**
 * VoxShield Validation — Reality Defender Live Validation
 * Tests live Reality Defender deepfake detection API on selected samples.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { RealityDefenderAdapter } from '../src/services/realityDefenderService.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, 'samples');

async function main() {
  console.log('====================================================');
  console.log('🛡️ VoxShield — Phase 6: Reality Defender Live Validation');
  console.log('====================================================\n');

  const apiKey = process.env.REALITY_DEFENDER_API_KEY;
  console.log('API Key configured:', Boolean(apiKey), apiKey ? `(${apiKey.substring(0, 10)}...)` : '');

  const adapter = new RealityDefenderAdapter();
  const health = await adapter.checkHealth();
  console.log('Reality Defender Adapter Health:', JSON.stringify(health));

  const testFiles = [
    { id: 'sample_A_genuine', path: path.join(SAMPLES_DIR, 'sample_A_genuine_enrolled.wav') },
    { id: 'sample_E_synthetic', path: path.join(SAMPLES_DIR, 'sample_E_synthetic_generic.wav') }
  ];

  const results = [];

  for (const sample of testFiles) {
    console.log(`\nTesting sample: ${sample.id} (${path.basename(sample.path)})...`);
    const res = await adapter.analyze(sample.path);

    console.log('  Result:', {
      available: res.available,
      provider: res.provider,
      classification: res.classification,
      score: res.score,
      confidence: res.confidence,
      error: res.error || null,
      metadata: res.metadata
    });

    results.push({
      sample_id: sample.id,
      filename: path.basename(sample.path),
      available: res.available,
      classification: res.classification,
      score: res.score,
      confidence: res.confidence,
      error: res.error || null,
      metadata: res.metadata
    });
  }

  const resultsDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, 'reality_defender_validation_results.json');
  fs.writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\n✓ Results written to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal Reality Defender validation error:', err);
  process.exit(1);
});
