import { NextResponse } from 'next/server';
import { checkAiHealth } from '@/lib/ai/client';

export async function GET() {
  try {
    const data = await checkAiHealth();
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
