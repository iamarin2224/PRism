import { NextRequest, NextResponse } from 'next/server';
import {
  verifyGitHubSignature,
  extractPREventData,
  REVIEW_TRIGGER_ACTIONS,
} from '@/lib/github/webhook';
import { forwardPREvent } from '@/lib/ai/client';

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers.get('x-hub-signature-256');
  const event = req.headers.get('x-github-event');
  const deliveryId = req.headers.get('x-github-delivery');

  // 1. Validate server configuration
  if (!secret) {
    console.error(
      '[GitHub Webhook] GITHUB_WEBHOOK_SECRET is not configured in server environment'
    );
    return NextResponse.json(
      { error: 'Webhook secret is not configured on the server' },
      { status: 500 }
    );
  }

  // 2. Validate header presence
  if (!event) {
    return NextResponse.json({ error: 'Missing X-GitHub-Event header' }, { status: 400 });
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Hub-Signature-256 header' }, { status: 401 });
  }

  // 3. Read unparsed RAW text body for HMAC verification
  const rawBody = await req.text();
  const isValid = verifyGitHubSignature(rawBody, signature, secret);

  if (!isValid) {
    console.warn(`[GitHub Webhook] Invalid signature rejected for delivery ${deliveryId || 'unknown'}`);
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  // Parse JSON safely after verification
  let payload: any = {};
  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }
  }

  // 4. Handle GitHub "ping" event
  if (event === 'ping') {
    const zen = payload.zen || 'pong';
    console.log(`[GitHub Webhook] Ping event received (Zen: "${zen}")`);
    return NextResponse.json({
      status: 'pong',
      message: 'GitHub webhook ping received successfully',
      zen,
    });
  }

  // 5. Handle "pull_request" events
  if (event === 'pull_request') {
    const action = payload.action;
    const prNumber = payload.pull_request?.number;
    const repoFullName = payload.repository?.full_name;

    // Filter for review-triggering actions (opened, synchronize, reopened)
    if (!REVIEW_TRIGGER_ACTIONS.includes(action)) {
      console.log(
        `[GitHub Webhook] Ignored PR action '${action}' for ${repoFullName || 'repo'} #${prNumber || 'unknown'}`
      );
      return NextResponse.json({
        status: 'ignored',
        reason: `PR action '${action}' is not configured for automatic review`,
        action,
        prNumber,
      });
    }

    // Extract normalized representation
    const prEventData = extractPREventData(deliveryId, payload);
    console.log(
      `[GitHub Webhook] Recognized PR #${prEventData.pullRequest.number} (${prEventData.action}) from ${prEventData.repository.fullName} [${prEventData.pullRequest.sourceBranch} -> ${prEventData.pullRequest.targetBranch}]`
    );

    // Forward to FastAPI AI service
    try {
      await forwardPREvent(prEventData);
      console.log(
        `[GitHub Webhook] Successfully forwarded PR #${prEventData.pullRequest.number} to AI service`
      );
    } catch (aiErr: any) {
      console.error(`[GitHub Webhook] Failed to forward to AI service: ${aiErr.message}`);
      // Acknowledge webhook receipt to prevent GitHub retry flood
    }

    return NextResponse.json({
      status: 'success',
      message: 'Pull request event validated and queued for processing',
      event: {
        action: prEventData.action,
        repo: prEventData.repository.fullName,
        prNumber: prEventData.pullRequest.number,
      },
    });
  }

  // 6. Handle all other unhandled events safely
  console.log(`[GitHub Webhook] Ignored unhandled event type: '${event}'`);
  return NextResponse.json({
    status: 'ignored',
    reason: `GitHub event '${event}' is not handled`,
  });
}
