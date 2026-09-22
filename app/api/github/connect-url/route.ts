import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getGitHubAppConnectUrl } from '@/lib/github/app';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const connectUrl = getGitHubAppConnectUrl(user.id);
  return NextResponse.json({ connectUrl });
}
