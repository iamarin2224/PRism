import { NextRequest, NextResponse } from 'next/server';
import { testStructured } from '@/lib/ai/client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = body.code;

    const data = await testStructured(code);
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
