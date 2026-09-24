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
            className="prism-btn prism-btn-secondary"
            title="Refresh dashboard metrics"
          >
            ↻ Refresh
          </button>
        }
      />

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {/* Tracked Repos */}
          <div className="prism-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
              TRACKED REPOSITORIES
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-h)' }}>
              {loading ? '—' : trackedCount}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
              <span style={{ color: '#34d399' }}>{upToDateCount} up to date</span>
              {indexingCount > 0 && <span style={{ color: '#fbbf24' }}>• {indexingCount} indexing</span>}
              {needsReindexCount > 0 && <span style={{ color: '#fde047' }}>• {needsReindexCount} stale</span>}
            </div>
          </div>

          {/* Active Reviews */}
          <div className="prism-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
              ACTIVE REVIEWS RUNNING
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: inProgressCount > 0 ? 'var(--accent-cyan)' : 'var(--text-h)' }}>
              {loading ? '—' : inProgressCount}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {inProgressCount > 0 ? 'Autonomous swarm analyzing PRs' : 'No active review runs'}
            </div>
          </div>

          {/* Awaiting Approval */}
          <div
            className="prism-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              border: awaitingApprovalReviews.length > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border)',
              backgroundColor: awaitingApprovalReviews.length > 0 ? 'rgba(245, 158, 11, 0.04)' : 'var(--surface)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: awaitingApprovalReviews.length > 0 ? '#fbbf24' : 'var(--text-muted)' }}>
              HUMAN APPROVAL QUEUE
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: awaitingApprovalReviews.length > 0 ? '#fbbf24' : 'var(--text-h)' }}>
              {loading ? '—' : awaitingApprovalReviews.length}
            </div>
            <div style={{ fontSize: '11px', color: awaitingApprovalReviews.length > 0 ? '#fbbf24' : 'var(--text-muted)' }}>
              {awaitingApprovalReviews.length > 0 ? 'Action required by developer' : 'All reviews posted or auto-cleared'}
            </div>
          </div>

          {/* Codebase Q&A Quick Jump */}
          <div className="prism-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                KNOWLEDGE BASE
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-h)', marginTop: '6px' }}>
                Code Q&A Engine
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Ask architecture queries on indexed code
              </div>
            </div>
            <Link
              href="/qa"
              className="prism-btn prism-btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px', marginTop: '10px', width: 'fit-content' }}
            >
              Open Q&A →
            </Link>
          </div>
        </div>

        {/* SECTION: Reviews Awaiting Human Approval (if any) */}
        {awaitingApprovalReviews.length > 0 && (
          <div
            style={{
              padding: '20px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>✋</span>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#fbbf24', fontWeight: 600 }}>
                  Action Required: Reviews Awaiting Human Approval
                </h3>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {awaitingApprovalReviews.length} review(s) paused by confidence gate
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {awaitingApprovalReviews.map((rev) => (
                <div
                  key={rev.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <StatusBadge type="review" value={rev.status} />
                    <div>
                      <Link
                        href={`/reviews/${rev.id}`}
                        style={{
                          fontWeight: 600,
                          fontSize: '14px',
                          color: 'var(--text-h)',
                          textDecoration: 'none',
                        }}
                      >
                        {rev.repoName} • PR #{rev.prNumber}
                      </Link>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {rev.findingsCount} critical or low-confidence finding(s) detected
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Link
                      href={`/reviews/${rev.id}`}
                      className="prism-btn prism-btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      Review Findings
                    </Link>
                    <button
                      onClick={() => handleQuickApprove(rev.id)}
                      disabled={approvingId === rev.id || approveReviewMutation.isPending}
                      className="prism-btn prism-btn-primary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Column: Recent Reviews */}
          <div className="prism-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-h)' }}>Recent Reviews</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Autonomous review executions triggered by GitHub pull requests
                </div>
              </div>
              <Link href="/reviews" className="prism-btn prism-btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }}>
                View all →
              </Link>
            </div>

            {loadingReviews && reviews.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading reviews...
              </div>
            ) : reviews.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
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
                          <span style={{ color: 'var(--text-muted)' }}>{rev.repoName}</span>
                          <span style={{ color: 'var(--accent-cyan)', marginLeft: '6px' }}>#{rev.prNumber}</span>
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
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right Column: Tracked Repositories Status */}
          <div className="prism-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-h)' }}>Tracked Repositories</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Monitored for push & PR events
                </div>
              </div>
              <Link href="/repositories" className="prism-btn prism-btn-secondary" style={{ fontSize: '11px', padding: '4px 10px' }}>
                Manage →
              </Link>
            </div>

            {loadingRepos && repositories.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading repositories...
              </div>
            ) : repositories.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                <div>No repositories tracked yet.</div>
                <Link
                  href="/repositories"
                  className="prism-btn prism-btn-primary"
                  style={{ marginTop: '12px', fontSize: '12px', padding: '6px 14px' }}
                >
                  Browse Available Repositories
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {repositories.slice(0, 6).map((repo) => (
                  <div
                    key={repo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <Link
                        href={`/repositories/${repo.id}`}
                        style={{
                          fontWeight: 600,
                          fontSize: '13px',
                          color: 'var(--text-h)',
                          textDecoration: 'none',
                        }}
                      >
                        {repo.fullName}
                      </Link>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
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
