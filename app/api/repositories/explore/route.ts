import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { indexRepository } from '@/lib/ai/client';

function normalizeRepoName(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^https?:\/\/github\.com\//i, '');
  clean = clean.replace(/\.git$/i, '');
  clean = clean.replace(/^\/+|\/+$/g, '');
  return clean;
}

/**
 * Fetch latest commit SHA and default branch from GitHub for a public repo
 */
async function fetchGitHubRepoDetails(repoFullName: string, accessToken?: string | null) {
  const headers: Record<string, string> = {
    'User-Agent': 'PRism-App',
    Accept: 'application/vnd.github+json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers });
  if (!repoRes.ok) {
    if (repoRes.status === 404) {
      throw new Error(`Repository "${repoFullName}" not found on GitHub or is private.`);
    }
    throw new Error(`GitHub API returned status ${repoRes.status} for "${repoFullName}".`);
  }
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch || 'main';

  // Fetch head commit SHA
  const branchRes = await fetch(`https://api.github.com/repos/${repoFullName}/branches/${encodeURIComponent(defaultBranch)}`, { headers });
  let headSha: string | null = null;
  if (branchRes.ok) {
    const branchData = await branchRes.json();
    headSha = branchData.commit?.sha || null;
  }

  return {
    fullName: repoData.full_name || repoFullName,
    owner: repoData.owner?.login || repoFullName.split('/')[0],
    name: repoData.name || repoFullName.split('/')[1],
    defaultBranch,
    isPrivate: repoData.private || false,
    headSha,
  };
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const rawRepo = body.repo_name || body.url || body.repository;
    if (!rawRepo) {
      return NextResponse.json({ error: 'Repository name or URL is required' }, { status: 400 });
    }

    const normalized = normalizeRepoName(rawRepo);
    const parts = normalized.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return NextResponse.json(
        { error: 'Invalid repository format. Please use "owner/repository" or full GitHub URL.' },
        { status: 400 }
      );
    }

    // 1. Fetch live info from GitHub to ensure existence & get default branch / current commit
    const ghDetails = await fetchGitHubRepoDetails(normalized, user.accessToken);

    // 2. Find or create global repository record in PRism database
    let repository = await prisma.repository.findUnique({
      where: { fullName: ghDetails.fullName },
    });

    if (!repository) {
      repository = await prisma.repository.create({
        data: {
          fullName: ghDetails.fullName,
          owner: ghDetails.owner,
          name: ghDetails.name,
          defaultBranch: ghDetails.defaultBranch,
          isPrivate: ghDetails.isPrivate,
          isTracked: false,
          currentCommit: ghDetails.headSha,
          indexStatus: 'NOT_INDEXED',
        },
      });
    } else {
      // Update current commit if available
      if (ghDetails.headSha && ghDetails.headSha !== repository.currentCommit) {
        repository = await prisma.repository.update({
          where: { id: repository.id },
          data: {
            currentCommit: ghDetails.headSha,
            // If already indexed but commit changed, mark STALE
            indexStatus: repository.indexStatus === 'INDEXED' && repository.indexedCommit !== ghDetails.headSha ? 'STALE' : repository.indexStatus,
          },
        });
      }
    }

    // 3. Link user to this explored repository (user-scoped relationship)
    await prisma.userExploredRepo.upsert({
      where: {
        userId_repositoryId: {
          userId: user.id,
          repositoryId: repository.id,
        },
      },
      create: {
        userId: user.id,
        repositoryId: repository.id,
      },
      update: {},
    });

    // 4. Check Global Index Status
    let indexingTriggered = false;
    const isUpToDate =
      repository.indexStatus === 'INDEXED' &&
      repository.indexedCommit &&
      ghDetails.headSha &&
      repository.indexedCommit === ghDetails.headSha;

    if (!isUpToDate) {
      // Need indexing (either first time, failed, or stale commit)
      const forceFull = repository.indexStatus !== 'INDEXED';
      await indexRepository(repository.fullName, user.accessToken || undefined, forceFull);
      indexingTriggered = true;
      repository = await prisma.repository.update({
        where: { id: repository.id },
        data: { indexStatus: 'INDEXING' },
      });
    }

    return NextResponse.json({
      success: true,
      repository: {
        id: repository.id,
        fullName: repository.fullName,
        owner: repository.owner,
        name: repository.name,
        defaultBranch: repository.defaultBranch,
        indexStatus: repository.indexStatus,
        indexedCommit: repository.indexedCommit,
        currentCommit: repository.currentCommit,
        lastIndexedAt: repository.lastIndexedAt,
        type: 'explored' as const,
      },
      reusedExistingIndex: isUpToDate,
      indexingTriggered,
      message: isUpToDate
        ? 'Reusing up-to-date global index.'
        : 'Indexing initiated in background.',
    });
  } catch (err: any) {
    console.error(`[Explore Repository] Error: ${err.message}`);
    return NextResponse.json(
      { error: err.message || 'Failed to process explore repository request' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const repoId = searchParams.get('repository_id');
    const repoName = searchParams.get('repo_name');

    if (!repoId && !repoName) {
      return NextResponse.json({ error: 'repository_id or repo_name required' }, { status: 400 });
    }

    let targetRepoId = repoId;
    if (!targetRepoId && repoName) {
      const repo = await prisma.repository.findUnique({ where: { fullName: repoName } });
      if (repo) targetRepoId = repo.id;
    }

    if (targetRepoId) {
      await prisma.userExploredRepo.deleteMany({
        where: {
          userId: user.id,
          repositoryId: targetRepoId,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`[Delete Explored Repo] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to remove explored repository' }, { status: 500 });
  }
}
