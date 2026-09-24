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
  const appSlug = process.env.GITHUB_APP_SLUG || 'prism-agentic-code-intelligence';
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

/**
 * Discovers existing GitHub App installations for a user, verifies active status on GitHub,
 * prunes any uninstalled installations from the database, and syncs accessible repositories.
 */
export async function syncUserInstallations(
  userId: string,
  githubUsername: string,
  accessToken?: string | null
): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  const activeInstallations: GitHubInstallationInfo[] = [];

  // Method 1: Query using user OAuth access token if available
  if (accessToken) {
    try {
      const res = await fetch('https://api.github.com/user/installations', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'PRism-App',
        },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.installations)) {
          activeInstallations.push(...data.installations);
        }
      }
    } catch (err: any) {
      console.warn(`[Sync Installations] OAuth query notice: ${err.message}`);
    }
  }

  // Method 2: Query using App JWT for user account installation if not found yet
  if (activeInstallations.length === 0 && githubUsername) {
    try {
      const jwt = generateAppJwt();
      const res = await fetch(`https://api.github.com/users/${githubUsername}/installation`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'PRism-App',
        },
        cache: 'no-store',
      });
      if (res.ok) {
        const inst = await res.json();
        if (inst && inst.id) {
          activeInstallations.push(inst);
        }
      }
    } catch (err: any) {
      console.warn(`[Sync Installations] App JWT query notice: ${err.message}`);
    }
  }

  // 2. Fetch existing DB installations for this user
  const dbInstallations = await prisma.installation.findMany({
    where: { userId },
  });

  const activeIdsSet = new Set(activeInstallations.map((i) => BigInt(i.id)));

  // 3. For any DB installation not present in activeInstallations, verify directly with GitHub before pruning
  for (const dbInst of dbInstallations) {
    if (!activeIdsSet.has(dbInst.installationId)) {
      let isStillValid = false;
      try {
        const verified = await verifyInstallationOnGitHub(dbInst.installationId);
        if (verified && verified.id) {
          isStillValid = true;
          activeInstallations.push(verified);
          activeIdsSet.add(BigInt(verified.id));
        }
      } catch {
        // Verification failed (e.g. 404 Not Found), confirming it was uninstalled on GitHub
        isStillValid = false;
      }

      if (!isStillValid) {
        console.log(`[Sync Installations] Pruning uninstalled GitHub App installation ${dbInst.installationId} for user ${userId}`);
        
        // Find all repos tied to this uninstalled installation
        const tiedRepos = await prisma.repository.findMany({
          where: { installationId: dbInst.installationId },
        });

        for (const repo of tiedRepos) {
          if (repo.isPrivate) {
            // Private repo: purge chunks and repository for privacy/security
            await prisma.$executeRaw`DELETE FROM code_chunks WHERE repo_name = ${repo.fullName}`;
            await prisma.repository.delete({ where: { id: repo.id } });
          } else {
            // Public repo: retain vector index for Public Explorer/Q&A, disassociate App
            await prisma.repository.update({
              where: { id: repo.id },
              data: { installationId: null, isTracked: false },
            });
          }
        }

        // Delete the installation record
        await prisma.installation.delete({
          where: { installationId: dbInst.installationId },
        });
      }
    }
  }

  // 4. Upsert active installations and discover accessible repositories
  let syncedCount = 0;

  for (const inst of activeInstallations) {
    try {
      const installationId = BigInt(inst.id);

      const installation = await prisma.installation.upsert({
        where: { installationId },
        create: {
          installationId,
          accountLogin: inst.account.login,
          accountType: inst.account.type || 'User',
          accountAvatar: inst.account.avatar_url || null,
          userId: userId,
        },
        update: {
          accountLogin: inst.account.login,
          accountType: inst.account.type || 'User',
          accountAvatar: inst.account.avatar_url || null,
          userId: userId,
        },
      });

      // Discover and populate accessible repositories
      try {
        const repos = await listInstallationRepositories(Number(installation.installationId));
        for (const repo of repos) {
          // Check if repository already has indexed code chunks in vector store
          const chunkStats: any = await prisma.$queryRaw`
            SELECT count(*)::int as count, max(commit_sha) as last_commit
            FROM code_chunks
            WHERE repo_name = ${repo.full_name}
          `;
          const chunkCount = chunkStats?.[0]?.count || 0;
          const hasChunks = chunkCount > 0;
          const chunkCommit = chunkStats?.[0]?.last_commit || null;

          const existing = await prisma.repository.findUnique({
            where: { fullName: repo.full_name },
          });

          const resolvedStatus = existing?.indexStatus && existing.indexStatus !== 'NOT_INDEXED'
            ? existing.indexStatus
            : (hasChunks ? 'INDEXED' : 'NOT_INDEXED');

          const resolvedIndexedCommit = existing?.indexedCommit || (hasChunks ? chunkCommit : null);

          await prisma.repository.upsert({
            where: { fullName: repo.full_name },
            create: {
              fullName: repo.full_name,
              owner: repo.owner.login,
              name: repo.name,
              defaultBranch: repo.default_branch || 'main',
              installationId: installation.installationId,
              githubRepoId: BigInt(repo.id),
              isPrivate: repo.private || false,
              isTracked: existing?.isTracked ?? hasChunks,
              indexStatus: resolvedStatus,
              indexedCommit: resolvedIndexedCommit,
              currentCommit: resolvedIndexedCommit,
            },
            update: {
              installationId: installation.installationId,
              githubRepoId: BigInt(repo.id),
              isPrivate: repo.private || false,
              defaultBranch: repo.default_branch || 'main',
              indexStatus: resolvedStatus,
              indexedCommit: resolvedIndexedCommit,
            },
          });
        }
      } catch (repoErr: any) {
        console.warn(`[Sync Installations] Could not list repos for installation ${installationId}: ${repoErr.message}`);
      }

      syncedCount++;
    } catch (instErr: any) {
      console.error(`[Sync Installations] Error syncing installation ${inst.id}: ${instErr.message}`);
    }
  }

  return syncedCount;
}
