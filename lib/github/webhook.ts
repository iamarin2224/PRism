import crypto from 'crypto';
import { PREventPayload } from '@/lib/types';

export const REVIEW_TRIGGER_ACTIONS = ['opened', 'synchronize', 'reopened'] as const;

/**
 * Verifies the X-Hub-Signature-256 header against the raw request body.
 *
 * @param rawBody - The unparsed raw request body string or Buffer.
 * @param signatureHeader - The X-Hub-Signature-256 header value (e.g. sha256=...).
 * @param secret - The GITHUB_WEBHOOK_SECRET environment variable.
 * @returns True if the HMAC signature matches, false otherwise.
 */
export function verifyGitHubSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const signatureHash = parts[1];
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const computedHash = hmac.digest('hex');

  const sigBuf = Buffer.from(signatureHash, 'utf8');
  const compBuf = Buffer.from(computedHash, 'utf8');

  if (sigBuf.length !== compBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, compBuf);
}

/**
 * Extracts a clean, standardized representation of a GitHub pull_request payload.
 *
 * @param deliveryId - X-GitHub-Delivery header value.
 * @param payload - Parsed JSON webhook payload.
 * @returns Standardized PREventPayload object.
 */
export function extractPREventData(deliveryId: string | null, payload: any): PREventPayload {
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
