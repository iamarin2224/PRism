import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { queryRepository } from '@/lib/ai/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id: conversationId } = await params;

  try {
    const body = await req.json();
    const { content } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Message content cannot be empty' }, { status: 400 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 1. Create User Message
    const userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: content.trim(),
      },
    });

    // 2. Auto-generate title if this is the first user message / default title
    if (conversation.title === 'New Conversation') {
      const generatedTitle = content.trim().length > 40
        ? `${content.trim().slice(0, 37)}...`
        : content.trim();

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { title: generatedTitle },
      });
    }

    // 3. Query RAG engine for grounded answer
    let assistantMessage;
    try {
      const ragResult = await queryRepository(conversation.repoName, content.trim(), 5);

      assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: ragResult.answer || 'No answer generated.',
          sources: ragResult.sources ? JSON.parse(JSON.stringify(ragResult.sources)) : null,
        },
      });
    } catch (ragError: any) {
      console.error(`[RAG Query Error in Conversation ${conversation.id}]:`, ragError);
      assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: `Error generating response: ${ragError.message || 'Failed to retrieve code context or connect to AI service.'}`,
        },
      });
    }

    // Update conversation updatedAt timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      userMessage,
      assistantMessage,
    });
  } catch (err: any) {
    console.error(`[Post Message] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to post message' }, { status: 500 });
  }
}
