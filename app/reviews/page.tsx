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
            className="prism-btn prism-btn-secondary prism-btn-sm"
            title="Refresh reviews list"
          >
            ↻ Refresh
          </button>
        }
      />

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '3px',
              borderRadius: '7px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              flexWrap: 'wrap',
              gap: '2px',
            }}
          >
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: statusFilter === s.value ? 'var(--accent)' : 'transparent',
                  color: statusFilter === s.value ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  transition: 'all 0.12s ease',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ width: '260px' }}>
            <input
              type="text"
              className="prism-input"
              placeholder="Search repo or PR #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Reviews Table */}
        <div className="prism-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading review history...
            </div>
          ) : filteredReviews.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '14.5px', color: 'var(--text-h)', marginBottom: '4px', fontWeight: 600 }}>
                No reviews found
              </div>
              <div style={{ fontSize: '12.5px', maxWidth: '440px', margin: '0 auto 14px' }}>
                PRism automatically triggers multi-agent reviews whenever a pull request is opened or updated on a tracked repository.
              </div>
              <Link href="/repositories" className="prism-btn prism-btn-primary prism-btn-sm">
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
                      <code style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {rev.commitSha?.substring(0, 7) || '—'}
                      </code>
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
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/reviews/${rev.id}`}
                        className="prism-btn prism-btn-secondary prism-btn-sm"
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
