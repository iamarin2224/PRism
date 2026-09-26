import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { queryRepositoryStream, queryRepository } from '@/lib/ai/client';

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
    const { content, stream = true } = body;

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

    if (!stream) {
      // Non-streaming fallback
      const ragResult = await queryRepository(conversation.repoName, content.trim(), 5);
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: ragResult.answer || 'No answer generated.',
          sources: ragResult.sources ? JSON.parse(JSON.stringify(ragResult.sources)) : null,
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
      return NextResponse.json({ userMessage, assistantMessage });
    }

    // 3. Streaming response pipeline
    const aiResponse = await queryRepositoryStream(conversation.repoName, content.trim(), 5);
    if (!aiResponse.body) {
      throw new Error('AI service did not return a stream body');
    }

    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let accumulatedAnswer = '';
    let sources: any = null;

    const readable = new ReadableStream({
      async start(controller) {
        // Send initial user message event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'user_message', message: userMessage })}\n\n`)
        );

        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            buffer += text;

            // Process SSE lines
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                try {
                  const eventData = JSON.parse(trimmed.slice(6));
                  if (eventData.type === 'sources') {
                    sources = eventData.sources;
                  } else if (eventData.type === 'delta') {
                    accumulatedAnswer += eventData.content;
                  } else if (eventData.type === 'done') {
                    if (eventData.full_answer) {
                      accumulatedAnswer = eventData.full_answer;
                    }
                  }
                } catch {
                  // Ignore JSON parse error on partial chunks
                }
              }
              controller.enqueue(encoder.encode(`${line}\n\n`));
            }
          }

          // Handle any remaining text in buffer
          if (buffer.trim().startsWith('data: ')) {
            try {
              const eventData = JSON.parse(buffer.trim().slice(6));
              if (eventData.type === 'delta') accumulatedAnswer += eventData.content;
              if (eventData.type === 'sources') sources = eventData.sources;
            } catch {}
            controller.enqueue(encoder.encode(`${buffer}\n\n`));
          }

          // 4. Save completed assistant message to Prisma
          const assistantMessage = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              role: 'ASSISTANT',
              content: accumulatedAnswer.trim() || 'No answer generated.',
              sources: sources ? JSON.parse(JSON.stringify(sources)) : null,
            },
          });

          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'saved',
                userMessage,
                assistantMessage,
              })}\n\n`
            )
          );
        } catch (streamErr: any) {
          console.error('[Streaming error]:', streamErr);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: streamErr.message || 'Stream processing failed',
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error(`[Post Message] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to post message' }, { status: 500 });
  }
}

