import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface GitHubInstallationInfo {
  id: number;
  account: {
    login: string;
    id: number;
    type: string;
    avatar_url: string;
  };
  app_id: number;
  target_id: number;
  target_type: string;
  permissions: Record<string, string>;
  events: string[];
}

export interface DiscoveredRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
}

/**
 * Loads the GitHub App private key from environment or file.
 */
function getPrivateKey(): string {
  if (process.env.GITHUB_PRIVATE_KEY) {
    let key = process.env.GITHUB_PRIVATE_KEY.trim();
    // Handle escaped newlines from environment strings
    if (key.includes('\\n')) {
      key = key.replace(/\\n/g, '\n');
    }
    return key;
  }

  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
  if (keyPath) {
    const resolvedPath = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);
    if (fs.existsSync(resolvedPath)) {
      return fs.readFileSync(resolvedPath, 'utf8').trim();
    }
  }

  throw new Error(
    'GitHub App Private Key is not configured. Please set GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH.'
  );
}

/**
 * Encodes an object to base64url.
 */
function base64UrlEncode(obj: Record<string, any>): string {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generates an RS256-signed JWT for GitHub App authentication (valid for 9 minutes).
 */
export function generateAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) {
    throw new Error('GITHUB_APP_ID is not configured in server environment.');
  }

  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iat: now - 60, // Issued 60 seconds in the past to account for clock drift
    exp: now + 9 * 60, // Expires in 9 minutes (GitHub max is 10 min)
    iss: appId,
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const message = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const signature = signer
    .sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${message}.${signature}`;
}

/**
 * Returns the GitHub App Connect/Install URL.
 */
export function getGitHubAppConnectUrl(state?: string): string {
  const appSlug = process.env.GITHUB_APP_SLUG || 'prism-agentic-reviewer';
  const url = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  if (state) {
    url.searchParams.set('state', state);
  }
  return url.toString();
}

/**
 * Verifies that a given installationId is valid and active on GitHub.
 */
export async function verifyInstallationOnGitHub(
  installationId: number | bigint
): Promise<GitHubInstallationInfo> {
  const jwt = generateAppJwt();
  const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PRism-App',
    },
  });

  if (!res.ok) {
    throw new Error(
      `GitHub App installation verification failed for ID ${installationId} (status: ${res.status})`
    );
  }

  return res.json();
}

/**
 * Obtains a short-lived Installation Access Token for repository operations.
 */
export async function getInstallationAccessToken(
  installationId: number | bigint
): Promise<{ token: string; expires_at: string }> {
  const jwt = generateAppJwt();
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PRism-App',
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to generate installation token for ID ${installationId} (${res.status}): ${errText}`
    );
  }

  const data = await res.json();
  return {
    token: data.token,
    expires_at: data.expires_at,
  };
}

/**
 * Discovers repositories accessible under a GitHub App installation.
 */
export async function listInstallationRepositories(
  installationId: number | bigint
): Promise<DiscoveredRepository[]> {
  const { token } = await getInstallationAccessToken(installationId);
  const res = await fetch('https://api.github.com/installation/repositories?per_page=100', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PRism-App',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to list repositories for installation ID ${installationId} (${res.status}): ${errText}`
    );
  }

  const data = await res.json();
  return data.repositories || [];
}
