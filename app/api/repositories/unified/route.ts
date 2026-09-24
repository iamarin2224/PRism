import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // 1. Fetch user's tracked / installed repositories
    const userInstallations = await prisma.installation.findMany({
      where: { userId: user.id },
      select: { installationId: true },
    });

    const installIds = userInstallations.map((i) => i.installationId);

    const myRepos = await prisma.repository.findMany({
      where: {
        installationId: { in: installIds },
        isTracked: true,
      },
      include: {
        _count: {
          select: { reviewRuns: true, conversations: { where: { userId: user.id } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // 2. Fetch user's explored repositories (public repositories user has explored)
    const userExplored = await prisma.userExploredRepo.findMany({
      where: { userId: user.id },
      include: {
        repository: {
          include: {
            _count: {
              select: { conversations: { where: { userId: user.id } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const serializedMyRepos = myRepos.map((r) => ({
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
      conversationCount: r._count.conversations,
      type: 'my_repo' as const,
    }));

    const serializedExploredRepos = userExplored
      .filter((ue) => ue.repository)
      .map((ue) => {
        const r = ue.repository;
        return {
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
          totalReviewRuns: 0,
          conversationCount: r._count.conversations,
          exploredAt: ue.createdAt,
          type: 'explored' as const,
        };
      });

    return NextResponse.json({
      myRepos: serializedMyRepos,
      exploredRepos: serializedExploredRepos,
    });
  } catch (err: any) {
    console.error(`[Unified Repositories] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to fetch unified repositories' }, { status: 500 });
  }
}
