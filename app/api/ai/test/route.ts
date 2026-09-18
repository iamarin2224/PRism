import { NextRequest, NextResponse } from 'next/server';
import { testLLM } from '@/lib/ai/client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body.prompt;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Field "prompt" is required and must be a string' },
        { status: 400 }
      );
    }

    const data = await testLLM(prompt);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to communicate with AI service',
        details: error.message || 'Unknown error',
      },
      { status: 502 }
    );
  }
}
