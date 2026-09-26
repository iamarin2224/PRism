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
        backgroundColor: 'rgba(3, 7, 18, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        className="prism-card"
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#0d1527',
          border: '1px solid var(--border-light)',
          borderRadius: '12px',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
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
            padding: '20px 24px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>⚡</span>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-h)', letterSpacing: '-0.01em' }}>
                Add Repository for Q&A
              </h2>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Index codebases from your connected GitHub account or explore any public GitHub repository.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-muted)',
              fontSize: '13px',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = 'var(--border-light)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'flex',
            padding: '6px 20px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            borderBottom: '1px solid var(--border)',
            gap: '6px',
          }}
        >
          <button
            onClick={() => {
              setActiveTab('public');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '6px',
              background: activeTab === 'public' ? 'rgba(168, 85, 247, 0.12)' : 'transparent',
              border: activeTab === 'public' ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid transparent',
              color: activeTab === 'public' ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>🌐</span>
            <span>Public Repository</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('available');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '6px',
              background: activeTab === 'available' ? 'rgba(168, 85, 247, 0.12)' : 'transparent',
              border: activeTab === 'available' ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid transparent',
              color: activeTab === 'available' ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>⑂</span>
            <span>GitHub Account Repos</span>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>✕</span>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#34d399',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>✓</span>
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'public' ? (
            <form onSubmit={handleAddPublicRepo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                  Repository URL or Slug
                </label>
                <input
                  type="text"
                  className="prism-input"
                  placeholder="e.g. facebook/react or https://github.com/vercel/next.js"
                  value={publicUrl}
                  onChange={(e) => setPublicUrl(e.target.value)}
                  disabled={addExploredMutation.isPending}
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(56, 189, 248, 0.05)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  fontSize: '12px',
                  color: 'var(--text)',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span style={{ color: 'var(--accent-cyan)', fontSize: '14px', lineHeight: 1 }}>💡</span>
                <div>
                  <strong style={{ color: 'var(--accent-cyan)' }}>Shared Global Vector Index:</strong> If this repository has already been indexed at the current commit by another PRism user, the existing index is reused instantly.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="prism-btn prism-btn-secondary"
                  style={{ fontSize: '12px', padding: '7px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addExploredMutation.isPending || !publicUrl.trim()}
                  className="prism-btn prism-btn-primary"
                  style={{ fontSize: '12px', padding: '7px 18px' }}
                >
                  {addExploredMutation.isPending ? 'Validating & Adding...' : 'Add Repository →'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Select an unindexed repository from your connected GitHub account:
              </div>

              {loadingAvailable ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Loading available repositories...
                </div>
              ) : unindexedRepos.length === 0 ? (
                <div
                  style={{
                    padding: '28px 20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                  }}
                >
                  {availableRepos.length > 0
                    ? 'All repositories from your GitHub account are already indexed.'
                    : 'No GitHub repositories found. Connect your GitHub App or check repository permissions.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                  {unindexedRepos.map((repo) => (
                    <div
                      key={repo.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'all 0.15s ease',
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
                        style={{ fontSize: '11px', padding: '5px 12px', flexShrink: 0 }}
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
