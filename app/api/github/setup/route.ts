import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import {
  verifyInstallationOnGitHub,
  listInstallationRepositories,
} from '@/lib/github/app';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const installationIdStr = searchParams.get('installation_id');
  const appUrl = process.env.NEXTJS_URL || 'http://localhost:5050';

  if (!installationIdStr) {
    return NextResponse.redirect(`${appUrl}/?error=missing_installation_id`);
  }

  const installationId = BigInt(installationIdStr);

  const user = await getCurrentUser();
  if (!user) {
    // If user is not yet logged in, redirect them to GitHub login first, preserving setup url
    return NextResponse.redirect(`${appUrl}/api/auth/github?state=${encodeURIComponent(`/api/github/setup?installation_id=${installationIdStr}`)}`);
  }

  try {
    // 1. Server-side verification with GitHub App API
    const installInfo = await verifyInstallationOnGitHub(Number(installationId));

    // 2. Persist/associate installation with the authenticated PRism user
    const installation = await prisma.installation.upsert({
      where: { installationId },
      create: {
        installationId,
        accountLogin: installInfo.account.login,
        accountType: installInfo.account.type || 'User',
        accountAvatar: installInfo.account.avatar_url || null,
        userId: user.id,
      },
      update: {
        accountLogin: installInfo.account.login,
        accountType: installInfo.account.type || 'User',
        accountAvatar: installInfo.account.avatar_url || null,
        userId: user.id,
      },
    });

    // 3. Discover repositories accessible by this installation
    const discoveredRepos = await listInstallationRepositories(Number(installationId));

    // 4. Populate available repositories in database with isTracked = false default
    for (const repo of discoveredRepos) {
      await prisma.repository.upsert({
        where: { fullName: repo.full_name },
        create: {
          fullName: repo.full_name,
          owner: repo.owner.login,
          name: repo.name,
          defaultBranch: repo.default_branch || 'main',
          installationId: installation.installationId,
          githubRepoId: BigInt(repo.id),
          isPrivate: repo.private || false,
          isTracked: false,
          indexStatus: 'NOT_INDEXED',
        },
        update: {
          installationId: installation.installationId,
          githubRepoId: BigInt(repo.id),
          isPrivate: repo.private || false,
          defaultBranch: repo.default_branch || 'main',
        },
      });
    }

    console.log(
      `[GitHub Setup] Successfully associated installation ${installationId} (${installInfo.account.login}) with user ${user.githubUsername} and discovered ${discoveredRepos.length} repositories.`
    );

    return NextResponse.redirect(`${appUrl}/?installed=true`);
  } catch (err: any) {
    console.error(`[GitHub Setup] Failed to verify installation: ${err.message}`);
    return NextResponse.redirect(`${appUrl}/?error=${encodeURIComponent(err.message || 'installation_failed')}`);
  }
}
