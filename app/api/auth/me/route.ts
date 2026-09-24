import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null, hasInstallation: false }, { status: 401 });
  }

  // Fast direct local DB query only — zero external API latency
  const installations = await prisma.installation.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      installationId: true,
      accountLogin: true,
      accountType: true,
      accountAvatar: true,
    },
  });

  return NextResponse.json({
    authenticated: true,
    hasInstallation: installations.length > 0,
    installations: installations.map((i) => ({
      ...i,
      installationId: i.installationId.toString(),
    })),
    user: {
      id: user.id,
      githubId: user.githubId,
      githubUsername: user.githubUsername,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
  });
}
