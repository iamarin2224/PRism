import { NextRequest, NextResponse } from 'next/server';
import { postPullRequestReview } from '@/lib/github/app';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repoFullName, prNumber, reviewMarkdown, comments, event } = body;

    if (!repoFullName || !prNumber || !reviewMarkdown) {
      return NextResponse.json(
        { error: 'Missing required fields: repoFullName, prNumber, and reviewMarkdown are required' },
        { status: 400 }
      );
    }

    const result = await postPullRequestReview(
      repoFullName,
      Number(prNumber),
      reviewMarkdown,
      comments || [],
      event || 'COMMENT'
    );

    return NextResponse.json({
      success: true,
      message: `Review successfully posted to GitHub PR #${prNumber} on ${repoFullName}`,
      result,
    });
  } catch (err: any) {
    console.error(`[GitHub Post Review] Error: ${err.message}`);
    return NextResponse.json({ error: err.message || 'Failed to post review to GitHub' }, { status: 500 });
  }
}
