import { NextRequest, NextResponse } from 'next/server';
import { getGitHubOAuthUrl } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const state = searchParams.get('state') || undefined;
  const authUrl = getGitHubOAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
