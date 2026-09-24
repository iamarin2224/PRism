import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { indexRepository } from '@/lib/ai/client';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const repoId = body.repo_id;
    const repoName = body.repo_name;

    if (!repoId && !repoName) {
      return NextResponse.json({ error: 'repo_id or repo_name is required' }, { status: 400 });
    }

    const repository = await prisma.repository.findFirst({
      where: {
        OR: [{ id: repoId || undefined }, { fullName: repoName || undefined }],
      },
      include: {
        installation: true,
      },
    });

    if (!repository) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    if (!repository.installation || repository.installation.userId !== user.id) {
      return NextResponse.json({ error: 'Access denied: You do not own this repository' }, { status: 403 });
    }

    const updated = await prisma.repository.update({
      where: { id: repository.id },
      data: {
        indexStatus: 'INDEXING',
      },
    });

    try {
      await indexRepository(repository.fullName, undefined, true);
    } catch (aiErr: any) {
      console.warn(`[Reindex] Background enqueue notice: ${aiErr.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Reindexing scheduled for ${repository.fullName}`,
      repository: {
        id: updated.id,
        fullName: updated.fullName,
        indexStatus: updated.indexStatus,
      },
    });
  } catch (err: any) {
    console.error(`[Reindex] Error: ${err.message}`);
    return NextResponse.json({ error: err.message || 'Failed to trigger reindexing' }, { status: 500 });
  }
}
