import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

    // 4.1 Verify repository tracking status
    const repository = await prisma.repository.findUnique({

      where: { fullName: repoFullName },
    });

    if (!repository || !repository.isTracked) {
      console.log(
        `[GitHub Webhook] Ignored PR action '${action}' for untracked repository '${repoFullName || 'unknown'}' #${prNumber || 'unknown'}`
      );
      return NextResponse.json({
        status: 'ignored',
        reason: 'Repository is not tracked in PRism',
        repo: repoFullName,
        prNumber,
      });
    }

    // Extract normalized representation
    const prEventData = extractPREventData(deliveryId, payload);
    console.log(
      `[GitHub Webhook] Recognized PR #${prEventData.pullRequest.number} (${prEventData.action}) from tracked repo ${prEventData.repository.fullName} [${prEventData.pullRequest.sourceBranch} -> ${prEventData.pullRequest.targetBranch}]`
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

  // 6. Handle "push" events (automatic incremental indexing for tracked repos)
  if (event === 'push') {
    const repoFullName = payload.repository?.full_name;
    const afterCommit = payload.after;
    const ref = payload.ref;

    if (!repoFullName) {
      return NextResponse.json({ error: 'Missing repository in push payload' }, { status: 400 });
    }

    // Verify repository tracking
    const repository = await prisma.repository.findUnique({
      where: { fullName: repoFullName },
    });

    if (!repository || !repository.isTracked) {
      console.log(`[GitHub Webhook] Ignored push event for untracked repository '${repoFullName}'`);
      return NextResponse.json({
        status: 'ignored',
        reason: 'Repository is not tracked in PRism',
        repo: repoFullName,
      });
    }

    console.log(
      `[GitHub Webhook] Received push event for tracked repo ${repoFullName} (ref: ${ref || 'unknown'}, after: ${afterCommit || 'unknown'})`
    );

    // Extract modified/added/removed files from commits if available
    const commits = payload.commits || [];
    const addedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const deletedFiles: string[] = [];

    for (const c of commits) {
      if (Array.isArray(c.added)) addedFiles.push(...c.added);
      if (Array.isArray(c.modified)) modifiedFiles.push(...c.modified);
      if (Array.isArray(c.removed)) deletedFiles.push(...c.removed);
    }

    const changedFilesMap = {
      added: Array.from(new Set(addedFiles)),
      modified: Array.from(new Set(modifiedFiles)),
      deleted: Array.from(new Set(deletedFiles)),
    };

    try {
      const { forwardPushEvent } = await import('@/lib/ai/client');
      await forwardPushEvent(repoFullName, afterCommit, ref, changedFilesMap);
      console.log(`[GitHub Webhook] Successfully enqueued incremental indexing for ${repoFullName}`);
    } catch (pushErr: any) {
      console.error(`[GitHub Webhook] Failed to forward push event to AI service: ${pushErr.message}`);
    }

    return NextResponse.json({
      status: 'success',
      message: `Push event received and incremental indexing queued for repository ${repoFullName}`,
      repo: repoFullName,
      ref,
      headCommit: afterCommit,
    });
  }


  // 7. Handle all other unhandled events safely
  console.log(`[GitHub Webhook] Ignored unhandled event type: '${event}'`);
  return NextResponse.json({
    status: 'ignored',
    reason: `GitHub event '${event}' is not handled`,
  });
}

