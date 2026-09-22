import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeOAuthCode,
  fetchGitHubUser,
  createAuthenticatedUserSession,
} from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const state = searchParams.get('state');

  const appUrl = process.env.NEXTJS_URL || 'http://localhost:5050';

  if (error || !code) {
    console.error(`[GitHub OAuth Callback] Error: ${error} - ${errorDescription}`);
    return NextResponse.redirect(`${appUrl}/?error=${encodeURIComponent(errorDescription || error || 'auth_failed')}`);
  }

  try {
    const accessToken = await exchangeOAuthCode(code);
    const githubProfile = await fetchGitHubUser(accessToken);
    await createAuthenticatedUserSession(githubProfile, accessToken);

    // If state contains a post-auth redirect target (e.g. setup url), follow it
    if (state && state.startsWith('/')) {
      return NextResponse.redirect(`${appUrl}${state}`);
    }

    return NextResponse.redirect(`${appUrl}/`);
  } catch (err: any) {
    console.error(`[GitHub OAuth Callback] Authentication error: ${err.message}`);
    return NextResponse.redirect(`${appUrl}/?error=${encodeURIComponent(err.message || 'auth_failed')}`);
  }
}
