export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'VoxShield Voice Security API', version: '1.0.0',
    description: 'Provider-independent voice security orchestration, evidence fusion, policy, and forensic audit API.' },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'System', description: 'Liveness, readiness, and provider state.' },
    { name: 'Analysis', description: 'Audio intelligence and fused security assessment.' },
    { name: 'Speaker', description: 'Speaker enrollment and independent identity verification.' },
    { name: 'Forensics', description: 'History, incidents, reports, and audit trail.' }
  ],
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Process liveness', responses: { 200: { description: 'Process is alive.' } } } },
    '/ready': { get: { tags: ['System'], summary: 'Analysis readiness', responses: { 200: { description: 'Core analysis is ready.' }, 503: { description: 'A required local dependency is unavailable.' } } } },
    '/system/providers': { get: { tags: ['System'], summary: 'Provider status without credentials', responses: { 200: { description: 'Provider status map.' } } } },
    '/audio/analyze': { post: { tags: ['Analysis'], summary: 'Analyze an audio file',
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['audio'], properties: {
        audio: { type: 'string', format: 'binary' }, speakerId: { type: 'string' } } } } } },
      responses: { 200: { description: 'Normalized evidence, risk, policy, and explanation.' },
        400: { $ref: '#/components/responses/BadRequest' }, 422: { description: 'Audio is unusable; providers were not called.' } } } },
    '/speaker/enroll': { post: { tags: ['Speaker'], summary: 'Enroll a speaker profile', responses: { 201: { description: 'Profile enrolled.' }, 400: { $ref: '#/components/responses/BadRequest' } } } },
    '/speaker/verify': { post: { tags: ['Speaker'], summary: 'Verify speaker identity', responses: { 200: { description: 'Calibrated match and mismatch probabilities.' } } } },
    '/speaker/profiles': { get: { tags: ['Speaker'], summary: 'List speaker profiles', responses: { 200: { description: 'Profiles without embeddings.' } } } },
    '/history': { get: { tags: ['Forensics'], summary: 'List analysis history', responses: { 200: { description: 'Analysis history.' } } } },
    '/incidents/{id}': { get: { tags: ['Forensics'], summary: 'Get immutable incident snapshot', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Incident.' }, 404: { description: 'Not found.' } } } },
    '/audit': { get: { tags: ['Forensics'], summary: 'Get sanitized audit trail', responses: { 200: { description: 'Audit events.' } } } }
  },
  components: { schemas: { Error: { type: 'object', properties: { error: { type: 'object', required: ['code', 'message'], properties: {
    code: { type: 'string' }, message: { type: 'string' }, request_id: { type: 'string' } } } } } },
  responses: { BadRequest: { description: 'Invalid request.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } }
};

export function docsHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>VoxShield API Docs</title>
  <meta name="viewport" content="width=device-width"><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 20px;color:#172033}code{background:#eef2f7;padding:3px 6px;border-radius:4px}li{margin:10px 0}a{color:#245eea}</style></head>
  <body><h1>VoxShield Voice Security API</h1><p>Stable base: <code>/api/v1</code>. Legacy <code>/api</code> routes remain compatible.</p>
  <h2>Core workflow</h2><ol><li>POST multipart audio to <code>/api/v1/audio/analyze</code>.</li><li>Inspect <code>audioQuality</code>, normalized <code>evidence</code>, <code>risk</code>, and <code>policy</code>.</li><li>Use <code>unavailable</code> to distinguish missing signals from safe ones.</li></ol>
  <p><a href="/openapi.json">OpenAPI 3.1 JSON</a> · <a href="/api/v1/system/providers">Provider status</a> · <a href="/ready">Readiness</a></p></body></html>`;
}
