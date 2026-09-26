/**
 * PRism — GitHub Webhook Next.js Route Handler Test Suite
 *
 * Verifies HMAC-SHA256 signature verification, header parsing,
 * event filtering, and forwarding logic against Next.js (http://localhost:5050).
 */

const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const TARGET_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:5050';
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'development_webhook_secret';

function computeSignature(payloadString, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  return `sha256=${hmac.digest('hex')}`;
}

async function runTest(testName, { event, signature, body, expectedStatus, assertFn }) {
  const payloadStr = typeof body === 'string' ? body : JSON.stringify(body || {});
  const headers = { 'Content-Type': 'application/json' };

  if (event !== undefined) headers['X-GitHub-Event'] = event;
  if (signature !== undefined) headers['X-Hub-Signature-256'] = signature;
  headers['X-GitHub-Delivery'] = crypto.randomUUID();

  try {
    const res = await fetch(`${TARGET_URL}/api/github/webhook`, {
      method: 'POST',
      headers,
      body: payloadStr,
    });

    const statusMatch = res.status === expectedStatus;
    const json = await res.json().catch(() => ({}));
    const customPass = assertFn ? assertFn(json, res) : true;

    if (statusMatch && customPass) {
      console.log(`  ✓ ${testName} (Status: ${res.status})`);
      return true;
    } else {
      console.error(`  ✗ ${testName}`);
      console.error(`    Expected Status: ${expectedStatus}, Got: ${res.status}`);
      console.error(`    Response Body:`, json);
      return false;
    }
  } catch (err) {
    console.error(`  ✗ ${testName} -> Network Error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log(`  PRism GitHub Webhook Test Suite (Next.js)`);
  console.log(`  Target: ${TARGET_URL}/api/github/webhook`);
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  // 1. Missing signature header
  total++;
  if (
    await runTest('1. Reject request with missing signature header', {
      event: 'pull_request',
      body: { action: 'opened' },
      expectedStatus: 401,
    })
  ) passed++;

  // 2. Invalid signature header
  total++;
  if (
    await runTest('2. Reject request with invalid signature', {
      event: 'pull_request',
      signature: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      body: { action: 'opened' },
      expectedStatus: 401,
    })
  ) passed++;

  // 3. Missing X-GitHub-Event header
  total++;
  const validSigNoEvent = computeSignature(JSON.stringify({ action: 'opened' }), SECRET);
  if (
    await runTest('3. Reject request with missing X-GitHub-Event header', {
      signature: validSigNoEvent,
      body: { action: 'opened' },
      expectedStatus: 400,
    })
  ) passed++;

  // 4. Valid signature with ping event
  total++;
  const pingBody = { zen: 'Keep it logically awesome.' };
  const pingPayload = JSON.stringify(pingBody);
  if (
    await runTest('4. Accept valid ping event (returns pong)', {
      event: 'ping',
      signature: computeSignature(pingPayload, SECRET),
      body: pingPayload,
      expectedStatus: 200,
      assertFn: (json) => json.status === 'pong',
    })
  ) passed++;

  // 5. Valid signature with PR opened event
  total++;
  const prOpenedBody = {
    action: 'opened',
    repository: {
      name: 'PRism',
      full_name: 'octocat/PRism',
      owner: { login: 'octocat' },
      html_url: 'https://github.com/octocat/PRism',
    },
    pull_request: {
      number: 42,
      title: 'Fix authorization bypass in refund endpoint',
      state: 'open',
      head: { ref: 'fix/auth-bug', sha: 'a1b2c3d4e5' },
      base: { ref: 'main', sha: 'f9e8d7c6b5' },
      user: { login: 'developer1' },
      html_url: 'https://github.com/octocat/PRism/pull/42',
    },
    sender: { login: 'developer1' },
  };
  const prOpenedPayload = JSON.stringify(prOpenedBody);
  if (
    await runTest('5. Accept and process PR "opened" action', {
      event: 'pull_request',
      signature: computeSignature(prOpenedPayload, SECRET),
      body: prOpenedPayload,
      expectedStatus: 200,
      assertFn: (json) => json.status === 'success' && json.event?.prNumber === 42,
    })
  ) passed++;

  // 6. Valid signature with PR synchronize event
  total++;
  const prSyncBody = { ...prOpenedBody, action: 'synchronize' };
  const prSyncPayload = JSON.stringify(prSyncBody);
  if (
    await runTest('6. Accept and process PR "synchronize" action', {
      event: 'pull_request',
      signature: computeSignature(prSyncPayload, SECRET),
      body: prSyncPayload,
      expectedStatus: 200,
      assertFn: (json) => json.status === 'success',
    })
  ) passed++;

  // 7. Valid signature with PR reopened event
  total++;
  const prReopenedBody = { ...prOpenedBody, action: 'reopened' };
  const prReopenedPayload = JSON.stringify(prReopenedBody);
  if (
    await runTest('7. Accept and process PR "reopened" action', {
      event: 'pull_request',
      signature: computeSignature(prReopenedPayload, SECRET),
      body: prReopenedPayload,
      expectedStatus: 200,
      assertFn: (json) => json.status === 'success',
    })
  ) passed++;

  // 8. Ignored PR action (e.g., closed)
  total++;
  const prClosedBody = { ...prOpenedBody, action: 'closed' };
  const prClosedPayload = JSON.stringify(prClosedBody);
  if (
    await runTest('8. Safely ignore non-trigger PR action ("closed")', {
      event: 'pull_request',
      signature: computeSignature(prClosedPayload, SECRET),
      body: prClosedPayload,
      expectedStatus: 200,
      assertFn: (json) => json.status === 'ignored',
    })
  ) passed++;

  // 9. Ignored unhandled event (e.g., issues)
  total++;
  const issuesBody = { action: 'opened', issue: { number: 10 } };
  const issuesPayload = JSON.stringify(issuesBody);
  if (
    await runTest('9. Safely ignore unhandled event ("issues")', {
      event: 'issues',
      signature: computeSignature(issuesPayload, SECRET),
      body: issuesPayload,
      expectedStatus: 200,
      assertFn: (json) => json.status === 'ignored',
    })
  ) passed++;

  console.log('\n------------------------------------------------------');
  console.log(`  Results: ${passed} / ${total} tests passed.`);
  console.log('------------------------------------------------------\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
