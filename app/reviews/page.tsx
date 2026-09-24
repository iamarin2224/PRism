'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { useReviewsList } from '@/lib/hooks/useReviews';

export default function ReviewsListPage() {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError, error: queryError, refetch } = useReviewsList({
    status: statusFilter,
    limit: 50,
  });

  const reviews = data?.reviews || [];
  const loading = isLoading && reviews.length === 0;
  const error = isError ? (queryError as Error)?.message || 'Error loading reviews' : null;

  const filteredReviews = reviews.filter((r) =>
    r.repoName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(r.prNumber).includes(searchTerm)
  );

  const statuses = [
    { label: 'All Reviews', value: 'ALL' },
    { label: 'Awaiting Approval', value: 'AWAITING_HUMAN_APPROVAL' },
    { label: 'In Progress', value: 'IN_PROGRESS' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Failed', value: 'FAILED' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header
        title="Reviews"
        subtitle="Automated Review Runs & Verdicts"
        breadcrumbs={[{ label: 'PRism', href: '/' }, { label: 'Reviews' }]}
        actions={
          <button
            onClick={() => refetch()}
            className="prism-btn prism-btn-secondary"
            title="Refresh reviews list"
          >
            ↻ Refresh
          </button>
        }
      />

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

        {/* Filters Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: statusFilter === s.value ? 'var(--accent)' : 'var(--surface)',
                  color: statusFilter === s.value ? '#ffffff' : 'var(--text)',
                  border: statusFilter === s.value ? '1px solid var(--accent)' : '1px solid var(--border)',
                  transition: 'all 0.15s ease',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ width: '280px' }}>
            <input
              type="text"
              className="prism-input"
              placeholder="Search by repo or PR #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Reviews Table */}
        <div className="prism-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading review history...
            </div>
          ) : filteredReviews.length === 0 ? (
            <div style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '15px', color: 'var(--text-h)', marginBottom: '6px' }}>
                No reviews found
              </div>
              <div style={{ fontSize: '13px', maxWidth: '440px', margin: '0 auto 16px' }}>
                PRism will automatically trigger multi-agent reviews whenever a pull request is opened or updated on a tracked repository.
              </div>
              <Link href="/repositories" className="prism-btn prism-btn-primary">
                View Tracked Repositories →
              </Link>
            </div>
          ) : (
            <table className="prism-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>PR #</th>
                  <th>Commit</th>
                  <th>Status</th>
                  <th>Verdict</th>
                  <th>Findings</th>
                  <th>Spans</th>
                  <th>Duration</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredReviews.map((rev) => (
                  <tr key={rev.id}>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--text-h)' }}>
                        {rev.repoName}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/reviews/${rev.id}`}
                        style={{
                          fontWeight: 700,
                          color: 'var(--accent-cyan)',
                          textDecoration: 'none',
                        }}
                      >
                        #{rev.prNumber}
                      </Link>
                    </td>
                    <td>
                      <code style={{ fontSize: '11px' }}>{rev.commitSha.substring(0, 7)}</code>
                    </td>
                    <td>
                      <StatusBadge type="review" value={rev.status} />
                    </td>
                    <td>
                      <StatusBadge type="routing" value={rev.routingDecision} />
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          color: rev.findingsCount > 0 ? '#fb923c' : 'var(--text-muted)',
                        }}
                      >
                        {rev.findingsCount}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {rev.eventsCount ?? 0}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {rev.durationMs ? `${(rev.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/reviews/${rev.id}`}
                        className="prism-btn prism-btn-secondary"
                        style={{ fontSize: '11px', padding: '4px 10px' }}
                      >
                        View Report →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
