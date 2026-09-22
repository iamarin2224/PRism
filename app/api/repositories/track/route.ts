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
    const body = await req.json();
    const repoId = body.repo_id;
    const repoName = body.repo_name;

    if (!repoId && !repoName) {
      return NextResponse.json({ error: 'repo_id or repo_name is required' }, { status: 400 });
    }

    // 1. Fetch the target repository and verify user ownership through its installation
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
      return NextResponse.json({ error: 'Access denied: You do not own this repository installation' }, { status: 403 });
    }

    // 2. Mark repository as tracked and set indexStatus to INDEXING
    const updated = await prisma.repository.update({
      where: { id: repository.id },
      data: {
        isTracked: true,
        indexStatus: 'INDEXING',
      },
    });

    // 3. Trigger asynchronous background indexing via FastAPI + ARQ
    try {
      await indexRepository(
        repository.fullName,
        undefined, // Uses GitHub App installation token on backend
        true // Full index for initial track
      );
    } catch (aiErr: any) {
      console.warn(`[Track Repository] Indexing enqueue notice: ${aiErr.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Repository ${repository.fullName} is now tracked and indexing has been scheduled.`,
      repository: {
        id: updated.id,
        fullName: updated.fullName,
        isTracked: updated.isTracked,
        indexStatus: updated.indexStatus,
      },
    });
  } catch (err: any) {
    console.error(`[Track Repository] Error: ${err.message}`);
    return NextResponse.json({ error: err.message || 'Failed to track repository' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repo_id');
    const repoName = searchParams.get('repo_name');

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
      return NextResponse.json({ error: 'Access denied: You do not own this repository installation' }, { status: 403 });
    }

    const updated = await prisma.repository.update({
      where: { id: repository.id },
      data: {
        isTracked: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Repository ${repository.fullName} is no longer tracked.`,
      repository: {
        id: updated.id,
        fullName: updated.fullName,
        isTracked: updated.isTracked,
      },
    });
  } catch (err: any) {
    console.error(`[Untrack Repository] Error: ${err.message}`);
    return NextResponse.json({ error: err.message || 'Failed to untrack repository' }, { status: 500 });
  }
}
