import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null, hasInstallation: false }, { status: 401 });
  }

  const forceSync = req.nextUrl.searchParams.get('sync') === 'true';

  let installations = await prisma.installation.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      installationId: true,
      accountLogin: true,
      accountType: true,
      accountAvatar: true,
    },
  });

  // Only run external GitHub sync if force requested or if user has no DB installations recorded
  if (forceSync || installations.length === 0) {
    try {
      const { syncUserInstallations } = await import('@/lib/github/app');
      const syncedCount = await syncUserInstallations(user.id, user.githubUsername, user.accessToken);
      if (syncedCount > 0 || forceSync) {
        installations = await prisma.installation.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            installationId: true,
            accountLogin: true,
            accountType: true,
            accountAvatar: true,
          },
        });
      }
    } catch (syncErr: any) {
      console.warn(`[/api/auth/me] Sync notice: ${syncErr.message}`);
    }
  }

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
