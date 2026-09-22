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
      },
    });

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    if (!review.repository?.installation || review.repository.installation.userId !== user.id) {
      return NextResponse.json({ error: 'Access denied: You do not own this review' }, { status: 403 });
    }

    const events = await prisma.auditEvent.findMany({
      where: { reviewRunId: id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      reviewId: id,
      repoName: review.repoName,
      prNumber: review.prNumber,
      events: events.map((e) => ({
        id: e.id,
        spanId: e.spanId,
        nodeName: e.nodeName,
        eventType: e.eventType,
        payload: e.payload,
        tokensIn: e.tokensIn,
        tokensOut: e.tokensOut,
        costUsd: e.costUsd,
        durationMs: e.durationMs,
        createdAt: e.createdAt,
      })),
    });
  } catch (err: any) {
    console.error(`[Review Events] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to fetch review events timeline' }, { status: 500 });
  }
}
