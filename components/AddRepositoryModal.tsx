'use client';

import React, { useState, useEffect } from 'react';
import { useAddExploredRepo } from '@/lib/hooks/useQaChat';

interface AddRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRepo: (repoFullName: string) => void;
}

interface AvailableRepo {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  isPrivate: boolean;
  isTracked: boolean;
  indexStatus: string;
}

export function AddRepositoryModal({ isOpen, onClose, onSelectRepo }: AddRepositoryModalProps) {
  const [activeTab, setActiveTab] = useState<'available' | 'public'>('public');
  const [publicUrl, setPublicUrl] = useState('');
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [indexingRepoId, setIndexingRepoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const addExploredMutation = useAddExploredRepo();

  // Load available GitHub repos when tab is opened
  useEffect(() => {
    if (isOpen && activeTab === 'available' && availableRepos.length === 0) {
      fetchAvailableRepos();
    }
  }, [isOpen, activeTab, availableRepos.length]);

  const fetchAvailableRepos = async () => {
    try {
      setLoadingAvailable(true);
      setError(null);
      const res = await fetch('/api/repositories/available');
      if (res.ok) {
        const data = await res.json();
        setAvailableRepos(data.repositories || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to load GitHub App repositories');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching repositories');
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleIndexRepo = async (repo: AvailableRepo) => {
    try {
      setIndexingRepoId(repo.id);
      setError(null);
      setSuccessMsg(null);

      // Trigger index directly without modifying tracking list
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'index', repo_name: repo.fullName, force_full: false }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.detail || 'Failed to initiate indexing');
      }

      setSuccessMsg(`Indexing initiated for ${repo.fullName}!`);
      onSelectRepo(repo.fullName);
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to index repository');
    } finally {
      setIndexingRepoId(null);
    }
  };

  const handleAddPublicRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicUrl.trim()) return;

    try {
      setError(null);
      setSuccessMsg(null);
      const result = await addExploredMutation.mutateAsync(publicUrl.trim());

      setSuccessMsg(
        result.reusedExistingIndex
          ? `✓ Reused existing global index for ${result.repository.fullName}!`
          : `✓ Added ${result.repository.fullName} and initiated indexing!`
      );

      onSelectRepo(result.repository.fullName);
      setPublicUrl('');
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to add public repository');
    }
  };

  // Only show repositories that are NOT yet indexed
  const unindexedRepos = availableRepos.filter((repo) => repo.indexStatus !== 'INDEXED');

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="prism-card"
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#0f172a',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-h)' }}>
              Add Repository for Q&A
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Index codebases from your GitHub account or explore any public GitHub repository.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}>
          <button
            onClick={() => {
              setActiveTab('public');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'public' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'public' ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            🌐 Public GitHub Repository
          </button>
          <button
            onClick={() => {
              setActiveTab('available');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'available' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'available' ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            ⑂ My GitHub Account
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--status-red-bg)',
                border: '1px solid var(--status-red-border)',
                color: 'var(--status-red)',
                fontSize: '12px',
              }}
            >
              {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {successMsg}
            </div>
          )}

          {activeTab === 'public' ? (
            <form onSubmit={handleAddPublicRepo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-h)', marginBottom: '8px' }}>
                  Public Repository URL or Slug:
                </label>
                <input
                  type="text"
                  className="prism-input"
                  placeholder="e.g. facebook/react or https://github.com/vercel/next.js"
                  value={publicUrl}
                  onChange={(e) => setPublicUrl(e.target.value)}
                  disabled={addExploredMutation.isPending}
                  style={{ width: '100%' }}
                />
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  fontSize: '12px',
                  color: 'var(--text)',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: 'var(--accent-cyan)' }}>Shared Global Vector Index:</strong> If this repository has already been indexed at the current commit by another PRism user, the existing index is reused instantly.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="prism-btn prism-btn-secondary"
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addExploredMutation.isPending || !publicUrl.trim()}
                  className="prism-btn prism-btn-primary"
                  style={{ fontSize: '13px', padding: '8px 18px' }}
                >
                  {addExploredMutation.isPending ? 'Validating & Adding...' : 'Add Repository →'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Select an unindexed repository from your connected GitHub account to index:
              </div>

              {loadingAvailable ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Loading available repositories...
                </div>
              ) : unindexedRepos.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {availableRepos.length > 0
                    ? 'All repositories from your GitHub account are already indexed.'
                    : 'No GitHub repositories found. Connect your GitHub App or check your permissions.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                  {unindexedRepos.map((repo) => (
                    <div
                      key={repo.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-h)' }}>
                          {repo.fullName}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                          <span>{repo.isPrivate ? '🔒 Private' : '🌐 Public'}</span>
                          <span>•</span>
                          <span>Status: {repo.indexStatus}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleIndexRepo(repo)}
                        disabled={indexingRepoId === repo.id}
                        className="prism-btn prism-btn-primary"
                        style={{ fontSize: '11px', padding: '6px 14px', flexShrink: 0 }}
                      >
                        {indexingRepoId === repo.id ? 'Indexing...' : 'Index'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
