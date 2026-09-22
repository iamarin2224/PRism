import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const userInstallations = await prisma.installation.findMany({
      where: { userId: user.id },
      select: { installationId: true },
    });

    const installIds = userInstallations.map((i) => i.installationId);

    const trackedRepos = await prisma.repository.findMany({
      where: {
        installationId: { in: installIds },
        isTracked: true,
      },
      include: {
        _count: {
          select: { reviewRuns: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const serialized = trackedRepos.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      owner: r.owner,
      name: r.name,
      defaultBranch: r.defaultBranch,
      isPrivate: r.isPrivate,
      isTracked: r.isTracked,
      indexStatus: r.indexStatus,
      indexedCommit: r.indexedCommit,
      currentCommit: r.currentCommit,
      lastIndexedAt: r.lastIndexedAt,
      errorMessage: r.errorMessage,
      installationId: r.installationId ? r.installationId.toString() : null,
      totalReviewRuns: r._count.reviewRuns,
    }));

    return NextResponse.json({ repositories: serialized });
  } catch (err: any) {
    console.error(`[Tracked Repositories] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to fetch tracked repositories' }, { status: 500 });
  }
}
