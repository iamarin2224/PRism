'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';

interface ExploredRepoState {
  repo_name: string;
  status: 'NOT_INDEXED' | 'INDEXING' | 'INDEXED' | 'STALE' | 'FAILED';
  indexed_commit?: string | null;
  current_commit?: string | null;
  last_indexed_at?: string | null;
  error_message?: string | null;
  total_chunks?: number;
}

interface QASource {
  file_path: string;
  start_line: number;
  end_line: number;
  similarity_score?: number;
  content?: string;
}

interface QAResponseData {
  answer: string;
  sources: QASource[];
}

export default function ExploreRepositoryPage() {
  const [repoInput, setRepoInput] = useState('');
  const [activeRepoName, setActiveRepoName] = useState<string | null>(null);
  const [repoState, setRepoState] = useState<ExploredRepoState | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [query, setQuery] = useState('');
  const [querying, setQuerying] = useState(false);
  const [qaResult, setQaResult] = useState<QAResponseData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Normalize user input (e.g. https://github.com/facebook/react -> facebook/react)
  const normalizeRepoInput = (input: string): string => {
    let clean = input.trim();
    clean = clean.replace(/^https?:\/\/github\.com\//i, '');
    clean = clean.replace(/\.git$/i, '');
    clean = clean.replace(/^\/+|\/+$/g, '');
    return clean;
  };

  const fetchRepoStatus = useCallback(async (repoName: string) => {
    if (!repoName) return;
    try {
      const res = await fetch(`/api/rag?repo_name=${encodeURIComponent(repoName)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setRepoState(data);
      }
    } catch {
      // Background poll silently captures network errors
    }
  }, []);

  // Auto-polling when exploring repo is indexing
  useEffect(() => {
    if (!activeRepoName || repoState?.status !== 'INDEXING') return;

    const interval = setInterval(() => {
      fetchRepoStatus(activeRepoName);
    }, 4000);

    return () => clearInterval(interval);
  }, [activeRepoName, repoState?.status, fetchRepoStatus]);

  const handleIndexRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRepoInput(repoInput);
    if (!normalized || !normalized.includes('/')) {
      setError('Please provide a valid GitHub repository in "owner/repository" format or full URL.');
      return;
    }

    try {
      setIndexing(true);
      setError(null);
      setActiveRepoName(normalized);
      setQaResult(null);

      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'index',
          repo_name: normalized,
          force_full: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.detail || 'Failed to trigger indexing');
      }

      setRepoState({
        repo_name: normalized,
        status: 'INDEXING',
        total_chunks: 0,
      });

      // Immediate status check
      setTimeout(() => fetchRepoStatus(normalized), 1000);
    } catch (err: any) {
      setError(err.message || 'Indexing request failed');
    } finally {
      setIndexing(false);
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRepoName || !query.trim()) return;

    try {
      setQuerying(true);
      setError(null);
      setQaResult(null);

      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'query',
          repo_name: activeRepoName,
          query: query.trim(),
          top_k: 5,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.detail || 'Q&A query failed');
      }

      const data = await res.json();
      setQaResult(data);
    } catch (err: any) {
      setError(err.message || 'Query execution failed');
    } finally {
      setQuerying(false);
    }
  };

  const isIndexed = repoState?.status === 'INDEXED';
  const isCurrentlyIndexing = repoState?.status === 'INDEXING';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header
        title="Explore Public Repository"
        subtitle="Ad-Hoc Indexing & Code Intelligence"
        breadcrumbs={[{ label: 'PRism', href: '/' }, { label: 'Explore' }]}
      />

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px' }}>
        {/* Conceptual Distinction Banner */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '8px',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '18px' }}>ℹ</span>
          <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-h)' }}>Exploratory Mode:</strong> Indexing a public repository here is for on-demand knowledge retrieval and Q&A. It does <em>not</em> add the repository to your tracked accounts and will not monitor webhooks or pull requests.
          </div>
        </div>

        {/* Input Card */}
        <div className="prism-card" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--text-h)' }}>
            Analyze Any Public GitHub Repository
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
            Enter a public repository URL or slug to fetch files, generate vector embeddings, and explore with natural language.
          </p>

          <form onSubmit={handleIndexRepo} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              className="prism-input"
              placeholder="https://github.com/owner/repository or owner/repository"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              disabled={indexing || isCurrentlyIndexing}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              disabled={indexing || isCurrentlyIndexing || !repoInput.trim()}
              className="prism-btn prism-btn-primary"
              style={{ padding: '9px 18px', flexShrink: 0 }}
            >
              {isCurrentlyIndexing ? '⏳ Indexing...' : 'Index Repository →'}
            </button>
          </form>
        </div>

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

        {/* Status Monitor (if active repo selected) */}
        {activeRepoName && (
          <div className="prism-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  CURRENT EXPLORE TARGET
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-h)', marginTop: '2px' }}>
                  {activeRepoName}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {repoState && <StatusBadge type="index" value={repoState.status} size="md" />}
                <button
                  type="button"
                  onClick={() => fetchRepoStatus(activeRepoName)}
                  className="prism-btn prism-btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  ↻ Check Status
                </button>
              </div>
            </div>

            {/* Indexing Progress Indicator */}
            {isCurrentlyIndexing && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#fbbf24',
                    animation: 'pulse 1.2s infinite',
                  }}
                />
                <div style={{ fontSize: '13px', color: '#fbbf24' }}>
                  Asynchronous indexing job is processing repository files and generating vector embeddings. You can safely wait here or ask questions once complete.
                </div>
              </div>
            )}

            {isIndexed && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: '#34d399',
                }}
              >
                <span>✓</span>
                <span>
                  Repository is fully indexed into vector store. Ask questions about this codebase below.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Q&A Section for Explored Repository (Available when Indexed) */}
        {activeRepoName && isIndexed && (
          <div className="prism-card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--text-h)' }}>
              Ask Questions About {activeRepoName}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Queries are resolved via pgvector cosine similarity search and synthesized by the LLM.
            </p>

            <form onSubmit={handleQuery} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea
                rows={3}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Ask anything about ${activeRepoName}...`}
                disabled={querying}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--code-bg)',
                  color: 'var(--text-h)',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={querying || !query.trim()}
                  className="prism-btn prism-btn-primary"
                  style={{ padding: '8px 20px', fontSize: '13px' }}
                >
                  {querying ? 'Searching...' : 'Ask Explored Codebase →'}
                </button>
              </div>
            </form>

            {/* Answer & Sources */}
            {qaResult && (
              <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--accent-cyan)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}
                >
                  Synthesized Answer
                </div>
                <div
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.7,
                    color: '#f8fafc',
                    whiteSpace: 'pre-wrap',
                    marginBottom: '20px',
                  }}
                >
                  {qaResult.answer}
                </div>

                {qaResult.sources && qaResult.sources.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        marginBottom: '8px',
                      }}
                    >
                      Sources Referenced ({qaResult.sources.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {qaResult.sources.map((s, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--code-bg)',
                            border: '1px solid var(--border)',
                            fontSize: '12px',
                            fontFamily: 'var(--mono)',
                            display: 'flex',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ color: 'var(--accent)' }}>{s.file_path}</span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Lines {s.start_line}–{s.end_line}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
