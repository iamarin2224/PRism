'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { ConnectGitHubBanner } from '@/components/ConnectGitHubBanner';
import {
  useTrackedRepositories,
  useAvailableRepositories,
  useTrackRepository,
  useUntrackRepository,
  useReindexRepository,
  RepoSummary,
} from '@/lib/hooks/useRepositories';

export default function RepositoriesPage() {
  const { hasInstallation } = useAuth();
  const [activeTab, setActiveTab] = useState<'tracked' | 'available'>('tracked');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // TanStack Query hooks
  const {
    data: trackedData,
    isLoading: loadingTracked,
    isError: isTrackedError,
    error: trackedError,
    refetch: refetchTracked,
  } = useTrackedRepositories();

  const {
    data: availableData,
    isLoading: loadingAvailable,
    isError: isAvailableError,
    error: availableError,
    refetch: refetchAvailable,
  } = useAvailableRepositories();

  const trackMutation = useTrackRepository();
  const untrackMutation = useUntrackRepository();
  const reindexMutation = useReindexRepository();

  const trackedRepos = trackedData?.repositories || [];
  const availableRepos = availableData?.repositories || [];
  const loading = activeTab === 'tracked' ? (loadingTracked && trackedRepos.length === 0) : (loadingAvailable && availableRepos.length === 0);
  const error = (isTrackedError && (trackedError as Error)?.message) || (isAvailableError && (availableError as Error)?.message) || null;

  const handleRefreshAll = () => {
    refetchTracked();
    refetchAvailable();
  };

  // Track Action
  const handleTrack = async (repo: RepoSummary) => {
    try {
      setActionLoadingId(repo.id);
      await trackMutation.mutateAsync({ repoId: repo.id, repoName: repo.fullName });
    } catch (err: any) {
      alert(`Error tracking repository: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Untrack Action
  const handleUntrack = async (repo: RepoSummary) => {
    if (!confirm(`Are you sure you want to stop tracking ${repo.fullName}?`)) return;

    try {
      setActionLoadingId(repo.id);
      await untrackMutation.mutateAsync(repo.id);
    } catch (err: any) {
      alert(`Error untracking repository: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reindex Action
  const handleReindex = async (repo: RepoSummary) => {
    try {
      setActionLoadingId(repo.id);
      await reindexMutation.mutateAsync(repo.id);
    } catch (err: any) {
      alert(`Error reindexing repository: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtering
  const filteredTracked = trackedRepos.filter((r) =>
    r.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAvailable = availableRepos.filter((r) =>
    r.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header
        title="Repositories"
        subtitle="Repository Monitoring & Indexing Control"
        breadcrumbs={[{ label: 'PRism', href: '/' }, { label: 'Repositories' }]}
        actions={
          <button
            onClick={handleRefreshAll}
            className="prism-btn prism-btn-secondary prism-btn-sm"
            title="Refresh repository status"
          >
            ↻ Refresh
          </button>
        }
      />

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
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

        {/* Tab Controls & Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '3px',
              borderRadius: '7px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <button
              onClick={() => setActiveTab('tracked')}
              style={{
                padding: '6px 14px',
                borderRadius: '5px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: activeTab === 'tracked' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'tracked' ? '#ffffff' : 'var(--text-muted)',
                border: 'none',
                transition: 'all 0.12s ease',
              }}
            >
              Tracked Repositories ({trackedRepos.length})
            </button>
            <button
              onClick={() => setActiveTab('available')}
              style={{
                padding: '6px 14px',
                borderRadius: '5px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: activeTab === 'available' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'available' ? '#ffffff' : 'var(--text-muted)',
                border: 'none',
                transition: 'all 0.12s ease',
              }}
            >
              Available Repositories ({availableRepos.length})
            </button>
          </div>

          <div style={{ width: '260px' }}>
            <input
              type="text"
              className="prism-input"
              placeholder="Filter repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* TAB 1: TRACKED REPOSITORIES */}
        {activeTab === 'tracked' && (
          <div className="prism-card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading tracked repositories...
              </div>
            ) : filteredTracked.length === 0 ? (
              <div style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '14.5px', color: 'var(--text-h)', marginBottom: '4px', fontWeight: 600 }}>
                  No repositories tracked yet
                </div>
                <div style={{ fontSize: '12.5px', marginBottom: '14px', maxWidth: '420px', margin: '0 auto 14px' }}>
                  Select repositories from your connected GitHub App to start monitoring PRs and indexing code.
                </div>
                <button
                  onClick={() => setActiveTab('available')}
                  className="prism-btn prism-btn-primary prism-btn-sm"
                >
                  Browse Available Repositories →
                </button>
              </div>
            ) : (
              <table className="prism-table">
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th>Visibility</th>
                    <th>Indexing Status</th>
                    <th>Last Indexed</th>
                    <th>Reviews</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTracked.map((repo) => (
                    <tr key={repo.id}>
                      <td>
                        <Link
                          href={`/repositories/${repo.id}`}
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-h)',
                            textDecoration: 'none',
                          }}
                        >
                          {repo.fullName}
                        </Link>
                        {repo.defaultBranch && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontFamily: 'var(--mono)',
                              color: 'var(--text-muted)',
                              backgroundColor: 'var(--surface-hover)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              marginLeft: '8px',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {repo.defaultBranch}
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge type="visibility" value={repo.isPrivate ? 'private' : 'public'} />
                      </td>
                      <td>
                        <StatusBadge type="index" value={repo.indexStatus} />
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {repo.lastIndexedAt
                          ? new Date(repo.lastIndexedAt).toLocaleDateString() +
                            ' ' +
                            new Date(repo.lastIndexedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Never'}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{repo.totalReviewRuns ?? 0}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Link
                            href={`/repositories/${repo.id}`}
                            className="prism-btn prism-btn-secondary prism-btn-sm"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => handleReindex(repo)}
                            disabled={actionLoadingId === repo.id || repo.indexStatus === 'INDEXING' || reindexMutation.isPending}
                            className="prism-btn prism-btn-secondary prism-btn-sm"
                            title="Trigger full re-indexing of this repository"
                          >
                            {actionLoadingId === repo.id && repo.indexStatus !== 'INDEXING'
                              ? 'Scheduling...'
                              : 'Reindex'}
                          </button>
                          <button
                            onClick={() => handleUntrack(repo)}
                            disabled={actionLoadingId === repo.id || untrackMutation.isPending}
                            className="prism-btn prism-btn-danger prism-btn-sm"
                          >
                            Untrack
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: AVAILABLE REPOSITORIES */}
        {activeTab === 'available' && (
          <div className="prism-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
              These repositories are accessible via your connected GitHub App installation. Click <strong>Track</strong> to begin automated reviews and asynchronous indexing.
            </div>

            {loading ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading available repositories...
              </div>
            ) : filteredAvailable.length === 0 ? (
              <div style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '14.5px', color: 'var(--text-h)', marginBottom: '4px', fontWeight: 600 }}>
                  No repositories found
                </div>
                <div style={{ fontSize: '12.5px', marginBottom: '14px' }}>
                  Make sure you have granted the PRism GitHub App access to your repositories.
                </div>
                <ConnectGitHubBanner />
              </div>
            ) : (
              <table className="prism-table">
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th>Visibility</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Tracking</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAvailable.map((repo) => (
                    <tr key={repo.id}>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--text-h)' }}>
                          {repo.fullName}
                        </span>
                        {repo.defaultBranch && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontFamily: 'var(--mono)',
                              color: 'var(--text-muted)',
                              backgroundColor: 'var(--surface-hover)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              marginLeft: '8px',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {repo.defaultBranch}
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge type="visibility" value={repo.isPrivate ? 'private' : 'public'} />
                      </td>
                      <td>
                        <StatusBadge type="index" value={repo.indexStatus} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {repo.isTracked ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11.5px',
                              color: '#34d399',
                              fontWeight: 600,
                            }}
                          >
                            ✓ Tracked
                          </span>
                        ) : (
                          <button
                            onClick={() => handleTrack(repo)}
                            disabled={actionLoadingId === repo.id || trackMutation.isPending}
                            className="prism-btn prism-btn-primary prism-btn-sm"
                          >
                            {actionLoadingId === repo.id ? 'Tracking...' : '+ Track'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
