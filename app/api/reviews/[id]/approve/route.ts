import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

export async function POST(
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
        findings: true,
      },
    });

    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    if (!review.repository?.installation || review.repository.installation.userId !== user.id) {
      return NextResponse.json({ error: 'Access denied: You do not own this review' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const approvedFindings = body.approved_findings || review.findings;
    const routingDecision = body.routing_decision || 'POST_GITHUB';

    // Call FastAPI Workflow Engine to resume LangGraph from checkpoint
    const aiRes = await fetch(`${AI_SERVICE_URL}/api/reviews/${id}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved_findings: approvedFindings,
        routing_decision: routingDecision,
      }),
    });

    const aiData = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      throw new Error(aiData.detail || aiData.error || `AI service resume failed (${aiRes.status})`);
    }

    // Update database state
    const updated = await prisma.reviewRun.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        routingDecision: routingDecision,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Review approved and resumed successfully',
      review: updated,
      result: aiData,
    });
  } catch (err: any) {
    console.error(`[Approve Review] Error: ${err.message}`);
    return NextResponse.json({ error: err.message || 'Failed to approve review' }, { status: 500 });
  }
}
