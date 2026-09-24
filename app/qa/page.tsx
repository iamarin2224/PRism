'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';

interface TrackedRepo {
  id: string;
  fullName: string;
  indexStatus: string;
  lastIndexedAt?: string | null;
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

function CodeQAContent() {
  const searchParams = useSearchParams();
  const initialRepo = searchParams.get('repo') || '';

  const [repositories, setRepositories] = useState<TrackedRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>(initialRepo);
  const [query, setQuery] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [qaResult, setQaResult] = useState<QAResponseData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTrackedRepositories = useCallback(async () => {
    try {
      const res = await fetch('/api/repositories/tracked', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const repos = data.repositories || [];
        setRepositories(repos);

        // Auto-select initial repo or first indexed repo
        if (!selectedRepo && repos.length > 0) {
          const firstIndexed = repos.find((r: TrackedRepo) => r.indexStatus === 'INDEXED') || repos[0];
          setSelectedRepo(firstIndexed.fullName);
        } else if (selectedRepo && !repos.find((r: TrackedRepo) => r.fullName === selectedRepo)) {
          if (repos.length > 0) setSelectedRepo(repos[0].fullName);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tracked repositories');
    } finally {
      setLoadingRepos(false);
    }
  }, [selectedRepo]);

  useEffect(() => {
    fetchTrackedRepositories();
  }, [fetchTrackedRepositories]);

  const activeRepo = repositories.find((r) => r.fullName === selectedRepo);
  const isIndexing = activeRepo?.indexStatus === 'INDEXING';
  const isStale = activeRepo?.indexStatus === 'STALE';
  const isNotIndexed = activeRepo?.indexStatus === 'NOT_INDEXED' || activeRepo?.indexStatus === 'FAILED';

  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRepo || !query.trim()) return;

    if (isIndexing) {
      setError('Indexing is currently in progress for this repository. Q&A will be available when indexing completes.');
      return;
    }

    try {
      setQuerying(true);
      setError(null);
      setQaResult(null);

      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'query',
          repo_name: selectedRepo,
          query: query.trim(),
          top_k: 5,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.detail || 'Q&A query execution failed');
      }

      const data = await res.json();
      setQaResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to query codebase');
    } finally {
      setQuerying(false);
    }
  };

  const sampleQueries = [
    'What handles GitHub webhook verification?',
    'How does authentication and session management work?',
    'Explain the LangGraph review engine topology and nodes.',
    'Where is the Redis ARQ queue worker implemented?',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header
        title="Code Q&A"
        subtitle="RAG Knowledge Engine"
        breadcrumbs={[{ label: 'PRism', href: '/' }, { label: 'Code Q&A' }]}
      />

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px' }}>
        {/* Repo Selector Header Card */}
        <div className="prism-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                SELECT TARGET REPOSITORY:
              </label>
              {loadingRepos ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading tracked repositories...</div>
              ) : repositories.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  No tracked repositories found.{' '}
                  <a href="/repositories" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                    Track a repository first
                  </a>.
                </div>
              ) : (
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--code-bg)',
                    color: 'var(--text-h)',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.fullName}>
                      {repo.fullName} ({repo.indexStatus})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {activeRepo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusBadge type="index" value={activeRepo.indexStatus} size="md" />
                {activeRepo.lastIndexedAt && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Synced {new Date(activeRepo.lastIndexedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Indexing warnings */}
          {isIndexing && (
            <div
              style={{
                marginTop: '14px',
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: '#fbbf24',
                fontSize: '12px',
              }}
            >
              ⏳ Indexing is currently running in the background. Semantic Q&A will be available as soon as chunk embeddings complete.
            </div>
          )}

          {isStale && (
            <div
              style={{
                marginTop: '14px',
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                color: '#facc15',
                fontSize: '12px',
              }}
            >
              ⚠ Repository has new push events since last full sync. Answers will reflect the last indexed commit.
            </div>
          )}

          {isNotIndexed && (
            <div
              style={{
                marginTop: '14px',
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '12px',
              }}
            >
              ✕ Repository is not yet indexed in vector store.{' '}
              <a href="/repositories" style={{ color: '#ffffff', textDecoration: 'underline' }}>
                Trigger indexing from Repositories page
              </a>.
            </div>
          )}
        </div>

        {/* Question Input Card */}
        <form onSubmit={handleAsk} className="prism-card" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-h)', marginBottom: '8px' }}>
              Ask anything about this codebase:
            </label>
            <textarea
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. What handles GitHub webhook verification and HMAC security?"
              disabled={querying || !selectedRepo || isIndexing}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--code-bg)',
                color: 'var(--text-h)',
                fontSize: '14px',
                lineHeight: 1.5,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            {/* Quick Sample Queries */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {sampleQueries.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setQuery(sample)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-h)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  {sample}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={querying || !query.trim() || !selectedRepo || isIndexing}
              className="prism-btn prism-btn-primary"
              style={{ fontSize: '13px', padding: '9px 20px' }}
            >
              {querying ? 'Searching & Reasoning...' : 'Ask Codebase →'}
            </button>
          </div>
        </form>

        {/* Error message */}
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

        {/* Q&A Result Display */}
        {qaResult && (
          <div className="prism-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--accent-cyan)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: '10px',
                }}
              >
                Grounded AI Answer
              </div>
              <div
                style={{
                  fontSize: '14px',
                  lineHeight: 1.7,
                  color: '#f1f5f9',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {qaResult.answer}
              </div>
            </div>

            {/* Sources Referenced */}
            {qaResult.sources && qaResult.sources.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    marginBottom: '10px',
                  }}
                >
                  Referenced Code Sources ({qaResult.sources.length})
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {qaResult.sources.map((src, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--code-bg)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 }}>
                          📄 {src.file_path}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                          Lines {src.start_line}–{src.end_line}
                          {src.similarity_score !== undefined && (
                            <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                              ({(src.similarity_score * 100).toFixed(0)}% match)
                            </span>
                          )}
                        </span>
                      </div>

                      {src.content && (
                        <pre
                          style={{
                            margin: 0,
                            padding: '8px 10px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: '#94a3b8',
                            fontSize: '11px',
                            overflowX: 'auto',
                            maxHeight: '120px',
                          }}
                        >
                          <code>{src.content}</code>
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CodeQAPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading Q&A...</div>}>
      <CodeQAContent />
    </Suspense>
  );
}
