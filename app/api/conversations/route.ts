import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const repoName = searchParams.get('repo_name');

    const whereClause: any = { userId: user.id };
    if (repoName) {
      whereClause.repoName = repoName;
    }

    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const serialized = conversations.map((c) => ({
      id: c.id,
      repoName: c.repoName,
      repositoryId: c.repositoryId,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages,
      lastMessage: c.messages[0]
        ? {
            role: c.messages[0].role,
            content: c.messages[0].content.slice(0, 120),
            createdAt: c.messages[0].createdAt,
          }
        : null,
    }));

    return NextResponse.json({ conversations: serialized });
  } catch (err: any) {
    console.error(`[List Conversations] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { repo_name, title } = body;

    if (!repo_name) {
      return NextResponse.json({ error: 'repo_name is required' }, { status: 400 });
    }

    // Optional link to repository ID
    const repo = await prisma.repository.findUnique({
      where: { fullName: repo_name },
      select: { id: true },
    });

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        repoName: repo_name,
        repositoryId: repo?.id || null,
        title: title || 'New Conversation',
      },
    });

    return NextResponse.json({ conversation });
  } catch (err: any) {
    console.error(`[Create Conversation] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
