'use client';

import { useState, useEffect, useCallback } from 'react';

interface RepoState {
  repo_name: string;
  status: 'NOT_INDEXED' | 'INDEXING' | 'INDEXED' | 'STALE' | 'FAILED';
  indexed_commit?: string | null;
  current_commit?: string | null;
  last_indexed_at?: string | null;
  error_message?: string | null;
  total_chunks: number;
}

interface QASource {
  file_path: string;
  start_line: number;
  end_line: number;
  similarity_score?: number;
  content?: string;
}

interface QAResult {
  answer: string;
  sources: QASource[];
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RAG / Repo State
  const [targetRepo, setTargetRepo] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [repoList, setRepoList] = useState<RepoState[]>([]);
  const [selectedRepoState, setSelectedRepoState] = useState<RepoState | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  // Code Q&A State
  const [ragQuery, setRagQuery] = useState('');
  const [qaResult, setQaResult] = useState<QAResult | null>(null);
  const [isQueryingRAG, setIsQueryingRAG] = useState(false);

  // =========================================================================
  // Handlers for Repository List & Status
  // =========================================================================
  const fetchRepositories = useCallback(async () => {
    setIsLoadingRepos(true);
    try {
      const res = await fetch('/api/rag');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setRepoList(data);
          // Sync selectedRepoState if targetRepo is set
          setTargetRepo((prev) => {
            if (prev) {
              const current = data.find((r: RepoState) => r.repo_name === prev);
              if (current) setSelectedRepoState(current);
            }
            return prev;
          });
        }
      }
    } catch {
      // Background poll silently captures network errors
    } finally {
      setIsLoadingRepos(false);
    }
  }, []);

  const fetchCurrentRepoStatus = useCallback(async (repoName: string) => {
    if (!repoName.trim()) return;
    try {
      const res = await fetch(`/api/rag?repo_name=${encodeURIComponent(repoName.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedRepoState(data);
        if (data.status !== 'NOT_INDEXED') {
          setRepoList((prev) => {
            const index = prev.findIndex((r) => r.repo_name === data.repo_name);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = data;
              return updated;
            }
            return [data, ...prev];
          });
        }
      }
    } catch {
      // Silent error for polling
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  // Auto-polling when indexing is active
  useEffect(() => {
    const isAnyIndexing =
      selectedRepoState?.status === 'INDEXING' ||
      repoList.some((r) => r.status === 'INDEXING');

    if (!isAnyIndexing) return;

    const interval = setInterval(() => {
      fetchRepositories();
      if (targetRepo) {
        fetchCurrentRepoStatus(targetRepo);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedRepoState?.status, repoList, targetRepo, fetchRepositories, fetchCurrentRepoStatus]);

  // =========================================================================
  // Handlers: RAG Trigger, Deletion & Q&A
  // =========================================================================
  const handleTriggerIndex = async () => {
    if (!targetRepo.trim()) {
      setError('Please enter a target repository in "owner/repo" format');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'index',
          repo_name: targetRepo.trim(),
          github_token: githubToken.trim() || undefined,
        }),
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const errorMsg = typeof data === 'object' ? (data.error || data.detail || JSON.stringify(data)) : data;
        throw new Error(errorMsg || 'Indexing trigger failed');
      }

      // Optimistically update status to INDEXING
      setSelectedRepoState((prev) =>
        prev
          ? { ...prev, status: 'INDEXING' }
          : {
              repo_name: targetRepo.trim(),
              status: 'INDEXING',
              total_chunks: 0,
            }
      );

      // Re-fetch status immediately and periodically
      setTimeout(() => {
        fetchCurrentRepoStatus(targetRepo.trim());
        fetchRepositories();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to trigger indexing');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRepo = (repo: RepoState) => {
    setTargetRepo(repo.repo_name);
    setSelectedRepoState(repo);
    setError(null);
  };

  const handleDeleteRepo = async (repoName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/rag?repo_name=${encodeURIComponent(repoName)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRepoList((prev) => prev.filter((r) => r.repo_name !== repoName));
        if (targetRepo === repoName) {
          setTargetRepo('');
          setSelectedRepoState(null);
          setQaResult(null);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete repository');
    }
  };

  const handleQueryCodebase = async () => {
    if (!targetRepo.trim()) {
      setError('Please specify or select a target repository first');
      return;
    }
    if (!ragQuery.trim()) {
      setError('Please enter a question in the Code Q&A input box');
      return;
    }

    setIsQueryingRAG(true);
    setError(null);
    setQaResult(null);

    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'query',
          repo_name: targetRepo.trim(),
          query: ragQuery.trim(),
          top_k: 5,
        }),
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const errorMsg = typeof data === 'object' ? (data.error || data.detail || JSON.stringify(data)) : data;
        throw new Error(errorMsg || 'Codebase Q&A query failed');
      }

      setQaResult(data);
    } catch (err: any) {
      setError(err.message || 'Codebase Q&A query failed');
    } finally {
      setIsQueryingRAG(false);
    }
  };

  // Helpers
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'INDEXED':
        return { label: 'INDEXED', bg: '#10b981', color: '#ffffff', desc: 'Ready for RAG Q&A' };
      case 'INDEXING':
        return { label: 'INDEXING...', bg: '#f59e0b', color: '#000000', desc: 'Embeddings running' };
      case 'STALE':
        return { label: 'STALE', bg: '#eab308', color: '#000000', desc: 'New commits pushed' };
      case 'FAILED':
        return { label: 'FAILED', bg: '#ef4444', color: '#ffffff', desc: 'Indexing error' };
      default:
        return { label: 'NOT INDEXED', bg: '#6b7280', color: '#ffffff', desc: 'Not indexed yet' };
    }
  };

  const activeBadge = getStatusBadge(selectedRepoState?.status);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px', width: '100%' }}>
      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '38px', letterSpacing: '-0.03em' }}>PRism</h1>
        <p style={{ margin: 0, opacity: 0.8, fontSize: '15px' }}>
          Agentic Pull Request Review & Code-Aware RAG Knowledge Base
        </p>
      </header>

      {/* Global Error Notice */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#ef4444',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
          }}
        >
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Sidebar + Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* =========================================================================
            SIDEBAR: Tracked Repositories & Status
            ========================================================================= */}
        <aside
          style={{
            backgroundColor: 'var(--social-bg)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Tracked Repositories</h3>
            <button
              onClick={() => {
                fetchRepositories();
                if (targetRepo) fetchCurrentRepoStatus(targetRepo);
              }}
              disabled={isLoadingRepos}
              title="Refresh repository status"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-h)',
                fontSize: '11px',
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              {isLoadingRepos ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>

          {/* List of indexed/tracked repos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {repoList.length === 0 ? (
              <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: '13px', opacity: 0.6 }}>
                No repositories indexed yet. Trigger indexing to add one.
              </div>
            ) : (
              repoList.map((r) => {
                const isSelected = r.repo_name === targetRepo;
                const badge = getStatusBadge(r.status);
                return (
                  <div
                    key={r.repo_name}
                    onClick={() => handleSelectRepo(r)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                      backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--code-bg)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'left',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '13px',
                          color: 'var(--text-h)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '170px',
                        }}
                        title={r.repo_name}
                      >
                        {r.repo_name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                        <button
                          onClick={(e) => handleDeleteRepo(r.repo_name, e)}
                          title="Remove repository"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text)',
                            opacity: 0.5,
                            cursor: 'pointer',
                            padding: '0 2px',
                            fontSize: '12px',
                            lineHeight: 1,
                          }}
                          onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = '1')}
                          onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = '0.5')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', opacity: 0.7, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Chunks: {r.total_chunks}</span>
                      {r.indexed_commit && <span>SHA: {r.indexed_commit.substring(0, 7)}</span>}
                    </div>

                    {r.status === 'FAILED' && r.error_message && (
                      <div
                        style={{
                          marginTop: '4px',
                          fontSize: '10px',
                          color: '#ef4444',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={r.error_message}
                      >
                        Err: {r.error_message}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Active Repo Detail Card */}
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'var(--code-bg)',
              border: '1px solid var(--border)',
              fontSize: '12px',
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-h)' }}>
              Selected Status:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: activeBadge.bg,
                  color: activeBadge.color,
                }}
              >
                {activeBadge.label}
              </span>
              <span style={{ opacity: 0.7 }}>{activeBadge.desc}</span>
            </div>
            {selectedRepoState && (
              <div style={{ opacity: 0.8, lineHeight: '1.5' }}>
                <div>Total Chunks: <strong>{selectedRepoState.total_chunks}</strong></div>
                {selectedRepoState.indexed_commit && (
                  <div>Commit: <code style={{ fontSize: '11px' }}>{selectedRepoState.indexed_commit.substring(0, 7)}</code></div>
                )}
                {selectedRepoState.last_indexed_at && (
                  <div>Updated: {new Date(selectedRepoState.last_indexed_at).toLocaleTimeString()}</div>
                )}
                {selectedRepoState.error_message && (
                  <div style={{ color: '#ef4444', marginTop: '4px' }}>
                    Error: {selectedRepoState.error_message}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* =========================================================================
            MAIN CONTENT AREA
            ========================================================================= */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* SECTION 1: Code-Aware RAG Indexing & Configuration */}
          <section
            style={{
              backgroundColor: 'var(--social-bg)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '20px',
              textAlign: 'left',
            }}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: '18px' }}>Repository RAG Indexer</h2>
            <p style={{ margin: '0 0 16px', fontSize: '13px', opacity: 0.75 }}>
              Embed codebase into PostgreSQL with pgvector for semantic retrieval during PR reviews and Q&A.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
                  Target GitHub Repository (owner/repo):
                </label>
                <input
                  type="text"
                  value={targetRepo}
                  onChange={(e) => setTargetRepo(e.target.value)}
                  placeholder="e.g. iamarin2224/t3chat-clone"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--code-bg)',
                    color: 'var(--text-h)',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
                  GitHub Token (optional if set in env):
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_... (higher rate limits)"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--code-bg)',
                    color: 'var(--text-h)',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                className="counter-btn"
                onClick={handleTriggerIndex}
                disabled={loading || selectedRepoState?.status === 'INDEXING'}
                style={{ fontSize: '13px', padding: '8px 18px', fontWeight: 600 }}
              >
                {selectedRepoState?.status === 'INDEXING' ? '⏳ Indexing in Background...' : '⚡ Trigger Indexing'}
              </button>

              <button
                type="button"
                className="counter-btn"
                onClick={() => fetchCurrentRepoStatus(targetRepo)}
                disabled={loading || !targetRepo.trim()}
                style={{ fontSize: '13px', padding: '8px 14px', opacity: 0.8 }}
              >
                🔍 Refresh Status
              </button>
            </div>
          </section>

          {/* SECTION 2: Codebase Q&A (RAG) */}
          <section
            style={{
              backgroundColor: 'var(--social-bg)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              padding: '20px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>💬 Codebase Q&A</h2>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>
                Querying: <strong>{targetRepo || 'None selected'}</strong>
              </span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '13px', opacity: 0.75 }}>
              Ask specific architecture, implementation, or logic questions grounded in the indexed code.
            </p>

            <div style={{ marginBottom: '12px' }}>
              <textarea
                rows={3}
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                placeholder="Ask any question about the codebase..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--code-bg)',
                  color: 'var(--text-h)',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  resize: 'vertical',
                }}
              />
            </div>

            <button
              type="button"
              className="counter-btn"
              onClick={handleQueryCodebase}
              disabled={isQueryingRAG || !targetRepo.trim()}
              style={{ fontSize: '13px', padding: '8px 20px', fontWeight: 600 }}
            >
              {isQueryingRAG ? 'Searching & Reasoning...' : 'Ask Codebase'}
            </button>

            {/* Q&A Result Display */}
            {qaResult && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--code-bg)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: 'var(--text-h)' }}>
                  Answer:
                </div>
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.6',
                    fontSize: '14px',
                    marginBottom: '16px',
                  }}
                >
                  {qaResult.answer}
                </div>

                {qaResult.sources && qaResult.sources.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '6px', opacity: 0.8 }}>
                      Sources Referenced ({qaResult.sources.length}):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {qaResult.sources.map((s, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--social-bg)',
                            border: '1px solid var(--border)',
                            fontSize: '12px',
                            fontFamily: 'var(--mono)',
                          }}
                        >
                          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.file_path}</span>
                          <span style={{ opacity: 0.75 }}>
                            Lines {s.start_line}–{s.end_line}
                            {s.similarity_score !== undefined && (
                              <span style={{ marginLeft: '8px', opacity: 0.6 }}>
                                (score: {s.similarity_score.toFixed(2)})
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
