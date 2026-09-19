import { NextRequest, NextResponse } from 'next/server';
import { indexRepository, getRepositoryRagStatus, listRepositories, queryRepository } from '@/lib/ai/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoName = searchParams.get('repo_name');

  try {
    if (!repoName) {
      const repos = await listRepositories();
      return NextResponse.json(repos);
    }
    const status = await getRepositoryRagStatus(repoName);
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch RAG status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'index';

    if (action === 'query') {
      const { repo_name, query, top_k } = body;
      if (!repo_name || !query) {
        return NextResponse.json(
          { error: 'repo_name and query are required for Q&A' },
          { status: 400 }
        );
      }
      const answer = await queryRepository(repo_name, query, top_k || 5);
      return NextResponse.json(answer);
    }

    // Default: index
    const { repo_name, github_token, force_full } = body;
    if (!repo_name) {
      return NextResponse.json(
        { error: 'repo_name is required for indexing' },
        { status: 400 }
      );
    }
    const result = await indexRepository(repo_name, github_token, force_full || false);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to process RAG request' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repoName = searchParams.get('repo_name');

  if (!repoName) {
    return NextResponse.json({ error: 'repo_name is required' }, { status: 400 });
  }

  try {
    const { deleteRepository } = await import('@/lib/ai/client');
    const result = await deleteRepository(repoName);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete repository' },
      { status: 500 }
    );
  }
}
