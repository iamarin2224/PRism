'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { ConnectGitHubBanner } from '@/components/ConnectGitHubBanner';
import { useTrackedRepositories } from '@/lib/hooks/useRepositories';
import { useReviewsList, useApproveReview } from '@/lib/hooks/useReviews';

export default function DashboardPage() {
  const { hasInstallation } = useAuth();
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // TanStack Query hooks for cached, instant-loading server state
  const {
    data: repoData,
    isLoading: loadingRepos,
    isError: isRepoError,
    error: repoError,
    refetch: refetchRepos,
  } = useTrackedRepositories();

  const {
    data: reviewsData,
    isLoading: loadingReviews,
    isError: isRevError,
    error: revError,
    refetch: refetchReviews,
  } = useReviewsList({ limit: 10 });

  const approveReviewMutation = useApproveReview();

  const repositories = repoData?.repositories || [];
  const reviews = reviewsData?.reviews || [];
  const loading = loadingRepos && loadingReviews && repositories.length === 0 && reviews.length === 0;
  const error = (isRepoError && (repoError as Error)?.message) || (isRevError && (revError as Error)?.message) || null;

  // Quick 1-click HITL Approve from Dashboard
  const handleQuickApprove = async (reviewId: string) => {
    try {
      setApprovingId(reviewId);
      await approveReviewMutation.mutateAsync({ reviewId });
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  };

  const handleRefreshAll = () => {
    refetchRepos();
    refetchReviews();
  };

  // Metric Computations
  const trackedCount = repositories.length;
  const inProgressCount = reviews.filter((r) => r.status === 'IN_PROGRESS').length;
  const awaitingApprovalReviews = reviews.filter((r) => r.status === 'AWAITING_HUMAN_APPROVAL');
  const upToDateCount = repositories.filter((r) => r.indexStatus === 'INDEXED').length;
  const indexingCount = repositories.filter((r) => r.indexStatus === 'INDEXING').length;
  const needsReindexCount = repositories.filter((r) => r.indexStatus === 'STALE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header
        title="Overview"
        subtitle="Control & Telemetry Surface"
        actions={
          <button
            onClick={handleRefreshAll}
            className="prism-btn prism-btn-secondary prism-btn-sm"
            title="Refresh dashboard metrics"
          >
            ↻ Refresh
          </button>
        }
      />

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Onboarding Banner if GitHub App not connected */}
        {!hasInstallation && <ConnectGitHubBanner />}

        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '6px',
              backgroundColor: 'var(--status-red-bg)',
              border: '1px solid var(--status-red-border)',
              color: 'var(--status-red)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {/* Top Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          {/* Tracked Repos */}
          <div className="prism-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              TRACKED REPOSITORIES
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-h)', letterSpacing: '-0.02em' }}>
              {loading ? '—' : trackedCount}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
              <span style={{ color: '#34d399', fontWeight: 500 }}>● {upToDateCount} up to date</span>
              {indexingCount > 0 && <span style={{ color: '#fbbf24', fontWeight: 500 }}>• {indexingCount} indexing</span>}
              {needsReindexCount > 0 && <span style={{ color: '#fde047', fontWeight: 500 }}>• {needsReindexCount} stale</span>}
            </div>
          </div>

          {/* Active Reviews */}
          <div className="prism-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              ACTIVE REVIEWS RUNNING
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: inProgressCount > 0 ? 'var(--accent-cyan)' : 'var(--text-h)', letterSpacing: '-0.02em' }}>
              {loading ? '—' : inProgressCount}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {inProgressCount > 0 ? 'Autonomous agent swarm active' : 'No review runs in progress'}
            </div>
          </div>

          {/* Awaiting Approval */}
          <div
            className="prism-card"
            style={{
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              border: awaitingApprovalReviews.length > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border)',
              backgroundColor: awaitingApprovalReviews.length > 0 ? 'rgba(245, 158, 11, 0.04)' : 'var(--surface-card)',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, color: awaitingApprovalReviews.length > 0 ? '#fbbf24' : 'var(--text-muted)', letterSpacing: '0.04em' }}>
              HUMAN APPROVAL QUEUE
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: awaitingApprovalReviews.length > 0 ? '#fbbf24' : 'var(--text-h)', letterSpacing: '-0.02em' }}>
              {loading ? '—' : awaitingApprovalReviews.length}
            </div>
            <div style={{ fontSize: '11px', color: awaitingApprovalReviews.length > 0 ? '#fbbf24' : 'var(--text-muted)', marginTop: '2px' }}>
              {awaitingApprovalReviews.length > 0 ? 'Action required by developer' : 'All reviews cleared'}
            </div>
          </div>

          {/* Codebase Q&A Quick Jump */}
          <div className="prism-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                KNOWLEDGE BASE
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-h)', marginTop: '4px' }}>
                Code Q&A Engine
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Chat with indexed codebases
              </div>
            </div>
            <Link
              href="/qa"
              className="prism-btn prism-btn-secondary prism-btn-sm"
              style={{ marginTop: '8px', width: 'fit-content' }}
            >
              Open Q&A →
            </Link>
          </div>
        </div>

        {/* SECTION: Reviews Awaiting Human Approval (if any) */}
        {awaitingApprovalReviews.length > 0 && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.06)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }}>✋</span>
                <h3 style={{ margin: 0, fontSize: '14px', color: '#fbbf24', fontWeight: 600 }}>
                  Action Required: Reviews Awaiting Human Approval ({awaitingApprovalReviews.length})
                </h3>
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Confidence gate triggered
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {awaitingApprovalReviews.map((rev) => (
                <div
                  key={rev.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <StatusBadge type="review" value={rev.status} />
                    <div>
                      <Link
                        href={`/reviews/${rev.id}`}
                        style={{
                          fontWeight: 600,
                          fontSize: '13px',
                          color: 'var(--text-h)',
                          textDecoration: 'none',
                        }}
                      >
                        {rev.repoName} • PR #{rev.prNumber}
                      </Link>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {rev.findingsCount} actionable finding(s) detected
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Link
                      href={`/reviews/${rev.id}`}
                      className="prism-btn prism-btn-secondary prism-btn-sm"
                    >
                      Review Findings
                    </Link>
                    <button
                      onClick={() => handleQuickApprove(rev.id)}
                      disabled={approvingId === rev.id || approveReviewMutation.isPending}
                      className="prism-btn prism-btn-primary prism-btn-sm"
                    >
                      {approvingId === rev.id ? 'Posting...' : 'Approve & Post Review'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main 2-Column Split: Recent Reviews (Left) + Tracked Repositories (Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '18px', alignItems: 'start' }}>
          {/* Left Column: Recent Reviews */}
          <div className="prism-card" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14.5px', color: 'var(--text-h)' }}>Recent Reviews</h3>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Autonomous pull request reviews
                </div>
              </div>
              <Link href="/reviews" className="prism-btn prism-btn-secondary prism-btn-sm">
                View all →
              </Link>
            </div>

            {loadingReviews && reviews.length === 0 ? (
              <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                Loading reviews...
              </div>
            ) : reviews.length === 0 ? (
              <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                No reviews recorded yet. PRism will automatically review pull requests on tracked repositories.
              </div>
            ) : (
              <table className="prism-table">
                <thead>
                  <tr>
                    <th>Repository / PR</th>
                    <th>Status</th>
                    <th>Verdict</th>
                    <th>Findings</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.slice(0, 6).map((rev) => (
                    <tr key={rev.id}>
                      <td>
                        <Link
                          href={`/reviews/${rev.id}`}
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-h)',
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ color: 'var(--text)' }}>{rev.repoName}</span>
                          <span style={{ color: 'var(--accent-cyan)', marginLeft: '5px' }}>#{rev.prNumber}</span>
                        </Link>
                      </td>
                      <td>
                        <StatusBadge type="review" value={rev.status} />
                      </td>
                      <td>
                        <StatusBadge type="routing" value={rev.routingDecision} />
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: rev.findingsCount > 0 ? '#fb923c' : 'var(--text-muted)' }}>
                          {rev.findingsCount}
                        </span>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right Column: Tracked Repositories Status */}
          <div className="prism-card" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14.5px', color: 'var(--text-h)' }}>Tracked Repositories</h3>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Monitored codebases
                </div>
              </div>
              <Link href="/repositories" className="prism-btn prism-btn-secondary prism-btn-sm">
                Manage →
              </Link>
            </div>

            {loadingRepos && repositories.length === 0 ? (
              <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                Loading repositories...
              </div>
            ) : repositories.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                <div>No repositories tracked yet.</div>
                <Link
                  href="/repositories"
                  className="prism-btn prism-btn-primary prism-btn-sm"
                  style={{ marginTop: '10px' }}
                >
                  Browse Available Repositories
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {repositories.slice(0, 6).map((repo) => (
                  <div
                    key={repo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--surface-hover)',
                      border: '1px solid var(--border-subtle)',
                      transition: 'border-color 0.12s ease',
                    }}
                  >
                    <div style={{ overflow: 'hidden', paddingRight: '8px' }}>
                      <Link
                        href={`/repositories/${repo.id}`}
                        style={{
                          fontWeight: 600,
                          fontSize: '12.5px',
                          color: 'var(--text-h)',
                          textDecoration: 'none',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={repo.fullName}
                      >
                        {repo.fullName}
                      </Link>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {repo.totalReviewRuns ?? 0} reviews • {repo.isPrivate ? 'Private' : 'Public'}
                      </div>
                    </div>

                    <StatusBadge type="index" value={repo.indexStatus} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
