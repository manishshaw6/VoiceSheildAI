import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { query } from '../src/database/db.js';

let server;
let base;

test.before(() => new Promise(resolve => {
  server = app.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

test.after(() => new Promise(resolve => server.close(resolve)));

test('auth flow: register, duplicate check, login, profile, and logout', async () => {
  const testEmail = `test_${Date.now()}@voxshield.ai`;
  const testPassword = 'SecurePassword123!';
  const fullName = 'Test Security Agent';

  // 1. Register new user
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName,
      email: testEmail,
      password: testPassword,
      confirmPassword: testPassword
    })
  });
  const regBody = await regRes.json();
  assert.equal(regRes.status, 201, `Register failed: ${JSON.stringify(regBody)}`);
  assert.equal(regBody.status, 'ok');
  assert.ok(regBody.token);
  assert.equal(regBody.user.email, testEmail.toLowerCase());
  assert.equal(regBody.user.fullName, fullName);

  // 2. Duplicate registration attempt
  const dupRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName,
      email: testEmail,
      password: testPassword
    })
  });
  const dupBody = await dupRes.json();
  assert.equal(dupRes.status, 400);
  assert.equal(dupBody.error.code, 'DUPLICATE_USER');

  // 3. Login with incorrect password
  const badLoginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'WrongPassword'
    })
  });
  assert.equal(badLoginRes.status, 401);

  // 4. Login with correct credentials
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword
    })
  });
  const loginBody = await loginRes.json();
  assert.equal(loginRes.status, 200);
  assert.ok(loginBody.token);
  const authToken = loginBody.token;

  // 5. Fetch profile using Bearer token
  const meRes = await fetch(`${base}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const meBody = await meRes.json();
  assert.equal(meRes.status, 200);
  assert.equal(meBody.user.email, testEmail.toLowerCase());

  // 6. Access /auth/me without token should return 401
  const noTokenRes = await fetch(`${base}/api/auth/me`);
  assert.equal(noTokenRes.status, 401);
});
