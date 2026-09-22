import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

const SESSION_COOKIE_NAME = 'prism_session';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.GITHUB_WEBHOOK_SECRET || 'prism-secure-session-secret-fallback-123456';
const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: string;
  githubId: string;
  githubUsername: string;
  email: string | null;
  avatarUrl: string | null;
  accessToken?: string | null;
}

/**
 * Creates an HMAC signature for a session payload.
 */
function signPayload(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

/**
 * Verifies and parses a signed session cookie.
 */
function verifySessionToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSig = signPayload(data);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }
  return data;
}

/**
 * Generates the GitHub OAuth authorization URL.
 */
export function getGitHubOAuthUrl(state?: string): string {
  const clientId =
    process.env.GITHUB_OAUTH_CLIENT_ID ||
    process.env.GITHUB_CLIENT_ID ||
    process.env.GITHUB_APP_CLIENT_ID ||
    '';
  const redirectUri = `${process.env.NEXTJS_URL || 'http://localhost:5050'}/api/auth/github/callback`;
  const scope = 'read:user user:email';
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Exchanges a GitHub OAuth temporary code for a user access token.
 */
export async function exchangeOAuthCode(code: string): Promise<string> {
  const clientId =
    process.env.GITHUB_OAUTH_CLIENT_ID ||
    process.env.GITHUB_CLIENT_ID ||
    process.env.GITHUB_APP_CLIENT_ID ||
    '';
  const clientSecret =
    process.env.GITHUB_OAUTH_CLIENT_SECRET ||
    process.env.GITHUB_CLIENT_SECRET ||
    process.env.GITHUB_APP_CLIENT_SECRET ||
    '';

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const data = await res.json();
  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to exchange GitHub OAuth code');
  }
  return data.access_token;
}

/**
 * Fetches the user profile and primary verified email from GitHub API.
 */
export async function fetchGitHubUser(accessToken: string): Promise<{
  id: string;
  login: string;
  email: string | null;
  avatar_url: string | null;
}> {
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'PRism-App',
      Accept: 'application/vnd.github+json',
    },
  });

  if (!userRes.ok) {
    throw new Error(`GitHub user fetch failed with status ${userRes.status}`);
  }

  const userData = await userRes.json();
  let email = userData.email || null;

  if (!email) {
    try {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'PRism-App',
          Accept: 'application/vnd.github+json',
        },
      });
      if (emailRes.ok) {
        const emails = await emailRes.json();
        const primary = emails.find((e: any) => e.primary && e.verified);
        if (primary) email = primary.email;
      }
    } catch {
      // Email fetch is best-effort
    }
  }

  return {
    id: String(userData.id),
    login: userData.login,
    email,
    avatar_url: userData.avatar_url || null,
  };
}

/**
 * Upserts a User & Account record in Prisma and sets an httpOnly session cookie.
 */
export async function createAuthenticatedUserSession(
  githubProfile: { id: string; login: string; email: string | null; avatar_url: string | null },
  accessToken: string
): Promise<SessionUser> {
  const user = await prisma.user.upsert({
    where: { githubId: githubProfile.id },
    create: {
      githubId: githubProfile.id,
      githubUsername: githubProfile.login,
      email: githubProfile.email,
      avatarUrl: githubProfile.avatar_url,
    },
    update: {
      githubUsername: githubProfile.login,
      email: githubProfile.email,
      avatarUrl: githubProfile.avatar_url,
    },
  });

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: 'github',
        providerAccountId: githubProfile.id,
      },
    },
    create: {
      userId: user.id,
      type: 'oauth',
      provider: 'github',
      providerAccountId: githubProfile.id,
      accessToken,
      tokenType: 'bearer',
      scope: 'read:user,user:email',
    },
    update: {
      accessToken,
      updatedAt: new Date(),
    },
  });

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);

  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires,
    },
  });

  const rawCookieVal = `${user.id}:${sessionToken}`;
  const signedCookie = `${rawCookieVal}.${signPayload(rawCookieVal)}`;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signedCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });

  return {
    id: user.id,
    githubId: user.githubId,
    githubUsername: user.githubUsername,
    email: user.email,
    avatarUrl: user.avatarUrl,
    accessToken,
  };
}

/**
 * Server-side helper to retrieve the currently logged in PRism user from session.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!cookie?.value) return null;

    const rawData = verifySessionToken(cookie.value);
    if (!rawData) return null;

    const [userId, sessionToken] = rawData.split(':');
    if (!userId || !sessionToken) return null;

    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          include: {
            accounts: {
              where: { provider: 'github' },
              take: 1,
            },
          },
        },
      },
    });

    if (!session || session.expires < new Date() || session.user.id !== userId) {
      return null;
    }

    const githubAccount = session.user.accounts[0];

    return {
      id: session.user.id,
      githubId: session.user.githubId,
      githubUsername: session.user.githubUsername,
      email: session.user.email,
      avatarUrl: session.user.avatarUrl,
      accessToken: githubAccount?.accessToken || null,
    };
  } catch {
    return null;
  }
}

/**
 * Destroys the current user session.
 */
export async function logoutUserSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (cookie?.value) {
      const rawData = verifySessionToken(cookie.value);
      if (rawData) {
        const [, sessionToken] = rawData.split(':');
        if (sessionToken) {
          await prisma.session.deleteMany({ where: { sessionToken } });
        }
      }
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // Silent logout cleanup
  }
}
