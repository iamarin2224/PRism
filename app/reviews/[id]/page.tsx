'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { FindingCard, FindingData } from '@/components/FindingCard';
import { Timeline, TimelineEvent } from '@/components/Timeline';

interface ReviewDetailData {
  id: string;
  repositoryId?: string | null;
  repoName: string;
  repository?: {
    id: string;
    fullName: string;
    owner: string;
    name: string;
  } | null;
  prNumber: number;
  commitSha: string;
  baseSha: string;
  status: string;
  routingDecision: string | null;
  totalTokensIn?: number;
  totalTokensOut?: number;
  totalCostUsd?: number;
  durationMs?: number | null;
  errorMessage?: string | null;
  findings: FindingData[];
  createdAt: string;
  updatedAt: string;
}

export default function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [review, setReview] = useState<ReviewDetailData | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'findings' | 'events'>('findings');
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);

  const fetchReviewData = useCallback(async () => {
    try {
      setError(null);
      const [revRes, evRes] = await Promise.all([
        fetch(`/api/reviews/${id}`, { cache: 'no-store' }),
        fetch(`/api/reviews/${id}/events`, { cache: 'no-store' }),
      ]);

      if (!revRes.ok) {
        const err = await revRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch review');
      }

      const revData = await revRes.json();
      setReview(revData.review);

      if (evRes.ok) {
        const evData = await evRes.json();
        setEvents(evData.events || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading review');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReviewData();
  }, [fetchReviewData]);

  // Auto-polling if review is still in progress
  useEffect(() => {
    if (review?.status !== 'IN_PROGRESS' && review?.status !== 'QUEUED') return;

    const interval = setInterval(() => {
      fetchReviewData();
    }, 3000);

    return () => clearInterval(interval);
  }, [review?.status, fetchReviewData]);

  // HITL Approval Handler
  const handleApprove = async () => {
    if (!review) return;
    try {
      setApproving(true);
      const res = await fetch(`/api/reviews/${review.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_decision: 'POST_GITHUB' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to approve and resume review');
      }

      await fetchReviewData();
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading review report...
      </div>
    );
  }

  if (error || !review) {
    return (
      <div style={{ padding: '40px 32px' }}>
        <div
          style={{
            padding: '16px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-red-bg)',
            border: '1px solid var(--status-red-border)',
            color: 'var(--status-red)',
            marginBottom: '16px',
          }}
        >
          {error || 'Review not found'}
        </div>
        <Link href="/reviews" className="prism-btn prism-btn-secondary">
          ← Back to Reviews
        </Link>
      </div>
    );
  }

  const isAwaitingApproval = review.status === 'AWAITING_HUMAN_APPROVAL';
  const isCompleted = review.status === 'COMPLETED';
  const isInProgress = review.status === 'IN_PROGRESS' || review.status === 'QUEUED';

  const filteredFindings =
    severityFilter === 'ALL'
      ? review.findings
      : review.findings.filter((f) => f.severity.toUpperCase() === severityFilter);

  const criticalCount = review.findings.filter((f) => f.severity.toLowerCase() === 'critical').length;
  const highCount = review.findings.filter((f) => f.severity.toLowerCase() === 'high').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header
        title={`PR #${review.prNumber} • ${review.repoName}`}
        subtitle={`Commit ${review.commitSha.substring(0, 7)}`}
        breadcrumbs={[
          { label: 'PRism', href: '/' },
          { label: 'Reviews', href: '/reviews' },
          { label: `PR #${review.prNumber}` },
        ]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={fetchReviewData}
              className="prism-btn prism-btn-secondary"
              title="Refresh review data"
            >
              ↻ Refresh
            </button>
            {review.repositoryId && (
              <Link
                href={`/repositories/${review.repositoryId}`}
                className="prism-btn prism-btn-secondary"
              >
                Repository Info
              </Link>
            )}
          </div>
        }
      />

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Human-in-the-Loop Approval Action Banner */}
        {isAwaitingApproval && (
          <div
            style={{
              padding: '20px 24px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '18px' }}>✋</span>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#fbbf24', fontWeight: 600 }}>
                  Human Approval Required
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)' }}>
                This review was paused by the confidence & severity gate (detected{' '}
                {criticalCount > 0 ? `${criticalCount} critical finding(s)` : 'findings requiring confirmation'}).
                Inspect the verified findings below and approve to post the formatted review directly to GitHub.
              </p>
            </div>

            <button
              onClick={handleApprove}
              disabled={approving}
              className="prism-btn prism-btn-primary"
              style={{
                fontSize: '13px',
                padding: '10px 20px',
                backgroundColor: '#fbbf24',
                color: '#000000',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {approving ? 'Posting to GitHub...' : 'Approve & Post Review'}
            </button>
          </div>
        )}

        {/* Live Processing Notice */}
        {isInProgress && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '8px',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-cyan)',
                animation: 'pulse 1.2s infinite',
              }}
            />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--accent-cyan)', fontSize: '14px' }}>
                Review In Progress
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text)' }}>
                Parallel specialist agents (Security, Quality, Tests, Docs) and Critic Verifier are actively executing. Telemetry will update in real time.
              </div>
            </div>
          </div>
        )}

        {/* Review Metadata Summary Card */}
        <div className="prism-card" style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                STATUS
              </span>
              <div style={{ marginTop: '4px' }}>
                <StatusBadge type="review" value={review.status} size="md" />
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                VERDICT
              </span>
              <div style={{ marginTop: '4px' }}>
                <StatusBadge type="routing" value={review.routingDecision} size="md" />
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                TOTAL FINDINGS
              </span>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-h)', marginTop: '2px' }}>
                {review.findings.length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {criticalCount} critical • {highCount} high
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                EXECUTION TIME
              </span>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-h)', marginTop: '2px' }}>
                {review.durationMs ? `${(review.durationMs / 1000).toFixed(2)}s` : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Total swarm latency
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                EVENTS SPAN
              </span>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-h)', marginTop: '2px' }}>
                {events.length} Spans
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Recorded in telemetry spine
              </div>
            </div>
          </div>
        </div>

        {/* Tab Controls: Findings vs Events Spine */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('findings')}
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: activeTab === 'findings' ? 'var(--text-h)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeTab === 'findings' ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              Actionable Findings ({review.findings.length})
            </button>
            <button
              onClick={() => setActiveTab('events')}
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: activeTab === 'events' ? 'var(--text-h)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeTab === 'events' ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              Events Spine Telemetry ({events.length})
            </button>
          </div>

          {/* Severity filter (only visible on findings tab) */}
          {activeTab === 'findings' && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: severityFilter === sev ? 'var(--surface-active)' : 'transparent',
                    color: severityFilter === sev ? 'var(--text-h)' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TAB 1: FINDINGS LIST */}
        {activeTab === 'findings' && (
          <div>
            {filteredFindings.length === 0 ? (
              <div
                style={{
                  padding: '48px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--surface)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '18px', marginBottom: '6px' }}>✓</div>
                <div style={{ fontWeight: 600, color: 'var(--text-h)', marginBottom: '4px' }}>
                  No findings detected for this filter
                </div>
                <div style={{ fontSize: '12px' }}>
                  {severityFilter === 'ALL'
                    ? 'PRism specialists and Critic verifier did not identify any actionable defects. LGTM!'
                    : `No findings with severity "${severityFilter}" found.`}
                </div>
              </div>
            ) : (
              filteredFindings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))
            )}
          </div>
        )}

        {/* TAB 2: EVENTS SPINE TIMELINE */}
        {activeTab === 'events' && (
          <div className="prism-card" style={{ padding: '24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: 'var(--text-h)' }}>
                Append-Only Audit & Telemetry Spine
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                Immutable execution timeline of LangGraph agent spans, vector context retrieval, critic validations, and confidence gating decisions.
              </p>
            </div>

            <Timeline events={events} />
          </div>
        )}
      </div>
    </div>
  );
}
