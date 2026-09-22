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
    const review = await prisma.reviewRun.findUnique({
      where: { id },
      include: {
        repository: {
          include: {
            installation: true,
          },
        },
        findings: {
          orderBy: [{ severity: 'asc' }, { confidence: 'desc' }],
        },
      },
    });

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    // Enforce strict multi-user ownership check
    if (!review.repository?.installation || review.repository.installation.userId !== user.id) {
      return NextResponse.json({ error: 'Access denied: You do not own this review' }, { status: 403 });
    }

    return NextResponse.json({
      review: {
        id: review.id,
        repositoryId: review.repositoryId,
        repoName: review.repoName,
        repository: {
          id: review.repository.id,
          fullName: review.repository.fullName,
          owner: review.repository.owner,
          name: review.repository.name,
          defaultBranch: review.repository.defaultBranch,
        },
        prNumber: review.prNumber,
        commitSha: review.commitSha,
        baseSha: review.baseSha,
        status: review.status,
        routingDecision: review.routingDecision,
        totalTokensIn: review.totalTokensIn,
        totalTokensOut: review.totalTokensOut,
        totalCostUsd: review.totalCostUsd,
        durationMs: review.durationMs,
        errorMessage: review.errorMessage,
        findings: review.findings,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      },
    });
  } catch (err: any) {
    console.error(`[Review Detail] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to fetch review detail' }, { status: 500 });
  }
}
