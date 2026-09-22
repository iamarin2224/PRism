import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const repositoryId = searchParams.get('repository_id');
  const statusFilter = searchParams.get('status');
  const limit = Math.min(Number(searchParams.get('limit')) || 30, 100);

  try {
    // 1. Get all installation IDs belonging to the authenticated user
    const userInstallations = await prisma.installation.findMany({
      where: { userId: user.id },
      select: { installationId: true },
    });

    const installIds = userInstallations.map((i) => i.installationId);

    // 2. Query reviews strictly scoped to user's repositories
    const reviews = await prisma.reviewRun.findMany({
      where: {
        repository: {
          installationId: { in: installIds },
          ...(repositoryId ? { id: repositoryId } : {}),
        },
        ...(statusFilter ? { status: statusFilter as any } : {}),
      },
      include: {
        repository: {
          select: {
            id: true,
            fullName: true,
            owner: true,
            name: true,
          },
        },
        _count: {
          select: {
            findings: true,
            auditEvents: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const serialized = reviews.map((r) => ({
      id: r.id,
      repositoryId: r.repositoryId,
      repository: r.repository,
      repoName: r.repoName,
      prNumber: r.prNumber,
      commitSha: r.commitSha,
      baseSha: r.baseSha,
      status: r.status,
      routingDecision: r.routingDecision,
      totalTokensIn: r.totalTokensIn,
      totalTokensOut: r.totalTokensOut,
      totalCostUsd: r.totalCostUsd,
      durationMs: r.durationMs,
      findingsCount: r._count.findings,
      eventsCount: r._count.auditEvents,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json({ reviews: serialized });
  } catch (err: any) {
    console.error(`[List Reviews] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to list reviews' }, { status: 500 });
  }
}
