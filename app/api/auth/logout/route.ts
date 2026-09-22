import { NextResponse } from 'next/server';
import { logoutUserSession } from '@/lib/auth/session';

export async function POST() {
  await logoutUserSession();
  return NextResponse.json({ success: true, message: 'Logged out successfully' });
}
