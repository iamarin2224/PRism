import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const repository = await prisma.repository.findFirst({
      where: {
        OR: [{ id }, { fullName: decodeURIComponent(id) }],
      },
      include: {
        installation: true,
        reviewRuns: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            _count: {
              select: { findings: true, auditEvents: true },
            },
          },
        },
      },
    });

    if (!repository) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    if (!repository.installation || repository.installation.userId !== user.id) {
      return NextResponse.json({ error: 'Access denied: You do not own this repository' }, { status: 403 });
    }

    const reviews = repository.reviewRuns.map((r) => ({
      id: r.id,
      prNumber: r.prNumber,
      commitSha: r.commitSha,
      baseSha: r.baseSha,
      status: r.status,
      routingDecision: r.routingDecision,
      totalCostUsd: r.totalCostUsd,
      durationMs: r.durationMs,
      findingsCount: r._count.findings,
      eventsCount: r._count.auditEvents,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json({
      repository: {
        id: repository.id,
        fullName: repository.fullName,
        owner: repository.owner,
        name: repository.name,
        defaultBranch: repository.defaultBranch,
        isPrivate: repository.isPrivate,
        isTracked: repository.isTracked,
        indexStatus: repository.indexStatus,
        indexedCommit: repository.indexedCommit,
        currentCommit: repository.currentCommit,
        lastIndexedAt: repository.lastIndexedAt,
        errorMessage: repository.errorMessage,
        createdAt: repository.createdAt,
        updatedAt: repository.updatedAt,
        installationId: repository.installationId ? repository.installationId.toString() : null,
      },
      reviews,
    });
  } catch (err: any) {
    console.error(`[Repository Detail] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to fetch repository detail' }, { status: 500 });
  }
}
