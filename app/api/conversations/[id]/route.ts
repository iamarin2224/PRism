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
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        repository: {
          select: {
            id: true,
            fullName: true,
            indexStatus: true,
            lastIndexedAt: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ conversation });
  } catch (err: any) {
    console.error(`[Get Conversation] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { title } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }

    const conversation = await prisma.conversation.updateMany({
      where: {
        id,
        userId: user.id,
      },
      data: {
        title: title.trim(),
      },
    });

    if (conversation.count === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, title: title.trim() });
  } catch (err: any) {
    console.error(`[Update Conversation] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await prisma.conversation.deleteMany({
      where: {
        id,
        userId: user.id,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`[Delete Conversation] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
