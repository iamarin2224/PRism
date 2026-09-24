'use client';

import React, { use } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { useRepositoryDetail, useReindexRepository } from '@/lib/hooks/useRepositories';

export default function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, isLoading, isError, error: queryError, refetch } = useRepositoryDetail(id);
  const reindexMutation = useReindexRepository();

  const repository = data?.repository;
  const reviews = data?.reviews || [];
  const error = isError ? (queryError as Error)?.message || 'Error loading repository' : null;

  const handleReindex = async () => {
    if (!repository) return;
    try {
      await reindexMutation.mutateAsync(repository.id);
      refetch();
    } catch (err: any) {
      alert(`Reindexing error: ${err.message}`);
    }
  };

  if (isLoading && !repository) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading repository information...
      </div>
    );
  }

  if (error || !repository) {
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
          {error || 'Repository not found'}
        </div>
        <Link href="/repositories" className="prism-btn prism-btn-secondary">
          ← Back to Repositories
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header
        title={repository.fullName}
        subtitle={repository.isPrivate ? 'Private Repository' : 'Public Repository'}
        breadcrumbs={[
          { label: 'PRism', href: '/' },
          { label: 'Repositories', href: '/repositories' },
          { label: repository.name },
        ]}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleReindex}
              disabled={reindexMutation.isPending || repository.indexStatus === 'INDEXING'}
              className="prism-btn prism-btn-primary"
              style={{ fontSize: '12px' }}
            >
              {repository.indexStatus === 'INDEXING' || reindexMutation.isPending ? '⏳ Indexing in Background...' : '↻ Reindex'}
            </button>
            <Link
              href={`/qa?repo=${encodeURIComponent(repository.fullName)}`}
              className="prism-btn prism-btn-secondary"
              style={{ fontSize: '12px' }}
            >
              Ask Code Q&A →
            </Link>
          </div>
        }
      />

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Repo Metadata Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div className="prism-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              INDEXING STATUS
            </span>
            <div style={{ marginTop: '4px' }}>
              <StatusBadge type="index" value={repository.indexStatus} size="md" />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {repository.indexStatus === 'INDEXED'
                ? 'Semantic index ready'
                : repository.indexStatus === 'INDEXING'
                ? 'Generating vector embeddings'
                : repository.indexStatus === 'STALE'
                ? 'New commits require delta update'
                : 'Not indexed'}
            </div>
          </div>

          <div className="prism-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              DEFAULT BRANCH
            </span>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-h)' }}>
              {repository.defaultBranch || 'main'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Target branch for reviews
            </div>
          </div>

          <div className="prism-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              INDEXED COMMIT
            </span>
            <div style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: 'var(--accent-cyan)' }}>
              {repository.indexedCommit ? repository.indexedCommit.substring(0, 10) : 'None'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Current SHA in vector index
            </div>
          </div>

          <div className="prism-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
              LAST INDEXED AT
            </span>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-h)' }}>
              {repository.lastIndexedAt
                ? new Date(repository.lastIndexedAt).toLocaleDateString() +
                  ' ' +
                  new Date(repository.lastIndexedAt).toLocaleTimeString()
                : 'Never'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Latest embedding sync
            </div>
          </div>
        </div>

        {/* Error notice if failed */}
        {repository.errorMessage && (
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
            <strong>Indexing Error:</strong> {repository.errorMessage}
          </div>
        )}

        {/* Recent Reviews for this Repository */}
        <div className="prism-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-h)' }}>
              Recent Reviews ({reviews.length})
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Pull requests reviewed by PRism agents for {repository.fullName}
            </div>
          </div>

          {reviews.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No reviews have been triggered for this repository yet. When a pull request is opened on GitHub, PRism will automatically analyze the diff.
            </div>
          ) : (
            <table className="prism-table">
              <thead>
                <tr>
                  <th>PR #</th>
                  <th>Commit</th>
                  <th>Status</th>
                  <th>Verdict</th>
                  <th>Findings</th>
                  <th>Execution Time</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((rev: any) => (
                  <tr key={rev.id}>
                    <td>
                      <Link
                        href={`/reviews/${rev.id}`}
                        style={{
                          fontWeight: 700,
                          color: 'var(--accent-cyan)',
                          textDecoration: 'none',
                        }}
                      >
                        PR #{rev.prNumber}
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
