import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // 1. Fetch all installations belonging to the user
    const userInstallations = await prisma.installation.findMany({
      where: { userId: user.id },
      select: { installationId: true },
    });

    const installIds = userInstallations.map((i) => i.installationId);

    if (installIds.length === 0) {
      return NextResponse.json({
        repositories: [],
        hasInstallations: false,
        message: 'No GitHub App installations found. Please connect your GitHub account.',
      });
    }

    // 2. Fetch all repositories across these installations
    const repositories = await prisma.repository.findMany({
      where: {
        installationId: { in: installIds },
      },
      select: {
        id: true,
        fullName: true,
        owner: true,
        name: true,
        defaultBranch: true,
        isPrivate: true,
        isTracked: true,
        indexStatus: true,
        indexedCommit: true,
        currentCommit: true,
        lastIndexedAt: true,
        installationId: true,
      },
      orderBy: [{ isTracked: 'desc' }, { fullName: 'asc' }],
    });

    // Convert BigInts for JSON serialization
    const serialized = repositories.map((r) => ({
      ...r,
      installationId: r.installationId ? r.installationId.toString() : null,
    }));

    return NextResponse.json({
      repositories: serialized,
      hasInstallations: true,
    });
  } catch (err: any) {
    console.error(`[Available Repositories] Error: ${err.message}`);
    return NextResponse.json({ error: 'Failed to fetch available repositories' }, { status: 500 });
  }
}
