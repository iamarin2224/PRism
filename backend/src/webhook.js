const crypto = require('crypto');

const REVIEW_TRIGGER_ACTIONS = ['opened', 'synchronize', 'reopened'];

/**
 * Verifies the X-Hub-Signature-256 header against the raw request body.
 *
 * @param {Buffer|string} rawBody - The unparsed request body.
 * @param {string} signatureHeader - The X-Hub-Signature-256 header value (sha256=...).
 * @param {string} secret - The GITHUB_WEBHOOK_SECRET.
 * @returns {boolean} True if signature is valid, false otherwise.
 */
function verifyGitHubSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const signatureHash = parts[1];
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody || Buffer.from(''));
  const computedHash = hmac.digest('hex');

  const sigBuf = Buffer.from(signatureHash, 'utf8');
  const compBuf = Buffer.from(computedHash, 'utf8');

  // Prevent timing attacks and handle mismatched lengths safely
  if (sigBuf.length !== compBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, compBuf);
}

/**
 * Extracts a concise, clean internal representation of a pull_request event.
 *
 * @param {string} deliveryId - X-GitHub-Delivery header value.
 * @param {object} payload - Parsed JSON webhook payload.
 * @returns {object} Standardized PR event object.
 */
function extractPREventData(deliveryId, payload) {
  const pr = payload.pull_request || {};
  const repo = payload.repository || {};
  const head = pr.head || {};
  const base = pr.base || {};

  return {
    deliveryId: deliveryId || null,
    event: 'pull_request',
    action: payload.action,
    repository: {
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner?.login,
      htmlUrl: repo.html_url,
    },
    pullRequest: {
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.html_url,
      state: pr.state,
      sourceBranch: head.ref,
      sourceSha: head.sha,
      targetBranch: base.ref,
      targetSha: base.sha,
      author: pr.user?.login,
    },
    sender: payload.sender?.login || null,
    installationId: payload.installation?.id || null,
  };
}

/**
 * Express route handler for GitHub webhook requests.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} aiServiceUrl - Base URL for the FastAPI AI service.
 */
async function handleGitHubWebhook(req, res, aiServiceUrl) {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const deliveryId = req.headers['x-github-delivery'];
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  // 1. Validate configuration
  if (!secret) {
    console.error('[GitHub Webhook] GITHUB_WEBHOOK_SECRET is not configured in backend environment');
    return res.status(500).json({ error: 'Webhook secret is not configured on the server' });
  }

  // 2. Validate presence of event and signature headers
  if (!event) {
    return res.status(400).json({ error: 'Missing X-GitHub-Event header' });
  }

  if (!signature) {
    return res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
  }

  // 3. Verify HMAC signature before trusting the payload
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const isValid = verifyGitHubSignature(rawBody, signature, secret);

  if (!isValid) {
    console.warn(`[GitHub Webhook] Invalid signature rejected for delivery ${deliveryId || 'unknown'}`);
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  // 4. Handle GitHub "ping" event (sent during webhook setup / test)
  if (event === 'ping') {
    const zen = req.body?.zen || 'pong';
    console.log(`[GitHub Webhook] Ping event received (Zen: "${zen}")`);
    return res.status(200).json({
      status: 'pong',
      message: 'GitHub webhook ping received successfully',
      zen,
    });
  }

  // 5. Handle "pull_request" events
  if (event === 'pull_request') {
    const action = req.body?.action;
    const prNumber = req.body?.pull_request?.number;
    const repoFullName = req.body?.repository?.full_name;

    // Filter for review-triggering actions (opened, synchronize, reopened)
    if (!REVIEW_TRIGGER_ACTIONS.includes(action)) {
      console.log(
        `[GitHub Webhook] Ignored PR action '${action}' for ${repoFullName || 'repo'} #${prNumber || 'unknown'}`
      );
      return res.status(200).json({
        status: 'ignored',
        reason: `PR action '${action}' is not configured for automatic review`,
        action,
        prNumber,
      });
    }

    // Extract clean representation
    const prEventData = extractPREventData(deliveryId, req.body);
    console.log(
      `[GitHub Webhook] Recognized PR #${prEventData.pullRequest.number} (${prEventData.action}) from ${prEventData.repository.fullName} [${prEventData.pullRequest.sourceBranch} -> ${prEventData.pullRequest.targetBranch}]`
    );

    // Forward the structured event to FastAPI AI service
    try {
      const aiResponse = await fetch(`${aiServiceUrl}/api/github/pr-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prEventData),
      });

      if (!aiResponse.ok) {
        console.error(
          `[GitHub Webhook] AI service returned status ${aiResponse.status} for PR #${prEventData.pullRequest.number}`
        );
      } else {
        console.log(
          `[GitHub Webhook] Successfully forwarded PR #${prEventData.pullRequest.number} to AI service`
        );
      }
    } catch (aiErr) {
      console.error(`[GitHub Webhook] Failed to reach AI service: ${aiErr.message}`);
      // Note: We still acknowledge GitHub with 200/202 to avoid webhook redelivery loops
    }

    return res.status(200).json({
      status: 'success',
      message: 'Pull request event validated and queued for processing',
      event: {
        action: prEventData.action,
        repo: prEventData.repository.fullName,
        prNumber: prEventData.pullRequest.number,
      },
    });
  }

  // 6. Handle all other unhandled GitHub events safely
  console.log(`[GitHub Webhook] Ignored unhandled event type: '${event}'`);
  return res.status(200).json({
    status: 'ignored',
    reason: `GitHub event '${event}' is not handled`,
  });
}

module.exports = {
  verifyGitHubSignature,
  extractPREventData,
  handleGitHubWebhook,
  REVIEW_TRIGGER_ACTIONS,
};
