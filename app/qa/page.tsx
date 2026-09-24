'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { AddRepositoryModal } from '@/components/AddRepositoryModal';
import {
  useUnifiedRepositories,
  useConversations,
  useConversation,
  useCreateConversation,
  useSendMessage,
  useDeleteConversation,
  useDeleteExploredRepo,
  RepositoryItem,
} from '@/lib/hooks/useQaChat';

function CodeQAChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialRepoParam = searchParams.get('repo');
  const initialConvParam = searchParams.get('conversation');

  const [selectedRepo, setSelectedRepo] = useState<string>(initialRepoParam || '');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConvParam || null);
  const [inputMessage, setInputMessage] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: repoData, isLoading: loadingRepos, refetch: refetchRepos } = useUnifiedRepositories();
  const { data: conversations, isLoading: loadingConvs, refetch: refetchConvs } = useConversations(selectedRepo);
  const { data: currentConversation, isLoading: loadingMessages } = useConversation(activeConversationId);

  // Mutations
  const createConvMutation = useCreateConversation();
  const sendMessageMutation = useSendMessage();
  const deleteConvMutation = useDeleteConversation();
  const deleteExploredMutation = useDeleteExploredRepo();

  // Combine repos
  const allRepos: RepositoryItem[] = [
    ...(repoData?.myRepos || []),
    ...(repoData?.exploredRepos || []),
  ];

  const activeRepo = allRepos.find((r) => r.fullName === selectedRepo);

  // Auto-select first repo if none selected
  useEffect(() => {
    if (!selectedRepo && allRepos.length > 0) {
      const firstIndexed = allRepos.find((r) => r.indexStatus === 'INDEXED') || allRepos[0];
      setSelectedRepo(firstIndexed.fullName);
    }
  }, [allRepos, selectedRepo]);

  // Auto-select first conversation or handle active conversation
  useEffect(() => {
    if (selectedRepo && conversations && conversations.length > 0 && !activeConversationId) {
      setActiveConversationId(conversations[0].id);
    }
  }, [selectedRepo, conversations, activeConversationId]);

  // Scroll to bottom of chat when new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages, sendMessageMutation.isPending]);

  const handleSelectRepo = (repoFullName: string) => {
    setSelectedRepo(repoFullName);
    setActiveConversationId(null);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('repo', repoFullName);
    newUrl.searchParams.delete('conversation');
    router.replace(newUrl.pathname + newUrl.search);
  };

  const handleSelectConversation = (convId: string) => {
    setActiveConversationId(convId);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('repo', selectedRepo);
    newUrl.searchParams.set('conversation', convId);
    router.replace(newUrl.pathname + newUrl.search);
  };

  const handleNewConversation = async () => {
    if (!selectedRepo) return;
    try {
      const newConv = await createConvMutation.mutateAsync({
        repoName: selectedRepo,
        title: 'New Conversation',
      });
      setActiveConversationId(newConv.id);
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('repo', selectedRepo);
      newUrl.searchParams.set('conversation', newConv.id);
      router.replace(newUrl.pathname + newUrl.search);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = inputMessage.trim();
    if (!content || !selectedRepo) return;

    try {
      let targetConvId = activeConversationId;

      // If no conversation exists yet, auto-create one
      if (!targetConvId) {
        const newConv = await createConvMutation.mutateAsync({
          repoName: selectedRepo,
          title: content.length > 35 ? `${content.slice(0, 32)}...` : content,
        });
        targetConvId = newConv.id;
        setActiveConversationId(newConv.id);
      }

      if (!targetConvId) return;

      setInputMessage('');
      await sendMessageMutation.mutateAsync({
        conversationId: targetConvId,
        content,
        repoName: selectedRepo,
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleReindex = async () => {
    if (!selectedRepo) return;
    try {
      setReindexing(true);
      await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'index',
          repo_name: selectedRepo,
          force_full: true,
        }),
      });
      await refetchRepos();
    } catch (err) {
      console.error('Reindex error:', err);
    } finally {
      setReindexing(false);
    }
  };

  const samplePrompts = [
    'What is the core architecture and workflow of this project?',
    'How is authentication and session management implemented?',
    'Explain the database models and vector indexing strategy.',
    'Where are API routes and external webhook listeners defined?',
  ];

  const isIndexing = activeRepo?.indexStatus === 'INDEXING';
  const isStale = activeRepo?.indexStatus === 'STALE';
  const isNotIndexed = activeRepo?.indexStatus === 'NOT_INDEXED' || activeRepo?.indexStatus === 'FAILED';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header
        title="Code Q&A"
        subtitle="Conversational Codebase Intelligence"
        breadcrumbs={[{ label: 'PRism', href: '/' }, { label: 'Code Q&A' }]}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT SIDEBAR: Repositories Tree & Conversations List */}
        <aside
          style={{
            width: '320px',
            minWidth: '320px',
            backgroundColor: '#0b1329',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Section 1: Repositories List */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                REPOSITORIES
              </span>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="prism-btn prism-btn-secondary"
                style={{ fontSize: '11px', padding: '3px 8px' }}
                title="Add tracked or public repository"
              >
                + Add Repo
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '200px', overflowY: 'auto' }}>
              {loadingRepos ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px' }}>Loading repositories...</div>
              ) : allRepos.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px' }}>
                  No repositories found.{' '}
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  >
                    Add one now
                  </button>
                </div>
              ) : (
                <>
                  {/* My Indexed Repositories */}
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', opacity: 0.8, marginBottom: '4px', textTransform: 'uppercase' }}>
                      ├── My Tracked Repositories ({repoData?.myRepos?.length || 0})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                      {repoData?.myRepos?.map((r) => {
                        const isSelected = selectedRepo === r.fullName;
                        return (
                          <div
                            key={r.id}
                            onClick={() => handleSelectRepo(r.fullName)}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: isSelected ? 'var(--accent-bg)' : 'transparent',
                              border: isSelected ? '1px solid var(--accent-border)' : '1px solid transparent',
                              transition: 'all 0.1s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                              <span style={{ fontSize: '13px' }}>⑂</span>
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: isSelected ? 600 : 400,
                                  color: isSelected ? '#ffffff' : 'var(--text)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={r.fullName}
                              >
                                {r.name}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 600,
                                padding: '1px 5px',
                                borderRadius: '3px',
                                backgroundColor: r.indexStatus === 'INDEXED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: r.indexStatus === 'INDEXED' ? '#34d399' : '#fbbf24',
                              }}
                            >
                              {r.indexStatus}
                            </span>
                          </div>
                        );
                      })}
                      {(!repoData?.myRepos || repoData.myRepos.length === 0) && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '2px 8px' }}>None tracked yet</div>
                      )}
                    </div>
                  </div>

                  {/* Explored Repositories */}
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', opacity: 0.8, marginBottom: '4px', textTransform: 'uppercase' }}>
                      └── Explored Repositories ({repoData?.exploredRepos?.length || 0})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                      {repoData?.exploredRepos?.map((r) => {
                        const isSelected = selectedRepo === r.fullName;
                        return (
                          <div
                            key={r.id}
                            onClick={() => handleSelectRepo(r.fullName)}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: isSelected ? 'var(--accent-bg)' : 'transparent',
                              border: isSelected ? '1px solid var(--accent-border)' : '1px solid transparent',
                              transition: 'all 0.1s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
                              <span style={{ fontSize: '13px' }}>🌐</span>
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: isSelected ? 600 : 400,
                                  color: isSelected ? '#ffffff' : 'var(--text)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={r.fullName}
                              >
                                {r.fullName}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 600,
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  backgroundColor: r.indexStatus === 'INDEXED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: r.indexStatus === 'INDEXED' ? '#34d399' : '#fbbf24',
                                }}
                              >
                                {r.indexStatus}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteExploredMutation.mutate(r.id);
                                }}
                                title="Remove explored repo"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  padding: '2px',
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {(!repoData?.exploredRepos || repoData.exploredRepos.length === 0) && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '2px 8px' }}>None explored yet</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 2: Conversations History */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 16px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                  CHATS ({conversations?.length || 0})
                </span>
                {selectedRepo && (
                  <div style={{ fontSize: '11px', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                    {selectedRepo}
                  </div>
                )}
              </div>
              <button
                onClick={handleNewConversation}
                disabled={!selectedRepo || createConvMutation.isPending}
                className="prism-btn prism-btn-primary"
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                + New Chat
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {loadingConvs ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px', textAlign: 'center' }}>
                  Loading chat history...
                </div>
              ) : !selectedRepo ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '16px', textAlign: 'center' }}>
                  Select a repository to view conversations.
                </div>
              ) : conversations?.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '16px', textAlign: 'center' }}>
                  No chats yet for this repository.{' '}
                  <button
                    onClick={handleNewConversation}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  >
                    Start one!
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {conversations?.map((conv) => {
                    const isActive = activeConversationId === conv.id;
                    return (
                      <div
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor: isActive ? 'var(--surface-hover)' : 'transparent',
                          border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '8px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ overflow: 'hidden', flex: 1 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? '#ffffff' : 'var(--text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            💬 {conv.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {new Date(conv.updatedAt).toLocaleDateString()} • {conv.messageCount} msgs
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConvMutation.mutate({ conversationId: conv.id, repoName: selectedRepo });
                            if (activeConversationId === conv.id) {
                              setActiveConversationId(null);
                            }
                          }}
                          title="Delete conversation"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '2px 4px',
                            opacity: 0.6,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN CHAT AREA */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
          {/* Target Repo Top Bar */}
          <div
            style={{
              padding: '12px 24px',
              borderBottom: '1px solid var(--border)',
              backgroundColor: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>TARGET CODEBASE:</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-h)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{selectedRepo || 'No repository selected'}</span>
                  {activeRepo && <StatusBadge type="index" value={activeRepo.indexStatus} size="sm" />}
                </div>
              </div>
            </div>

            {activeRepo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {activeRepo.lastIndexedAt && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Last indexed: {new Date(activeRepo.lastIndexedAt).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={handleReindex}
                  disabled={reindexing || isIndexing}
                  className="prism-btn prism-btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  {reindexing || isIndexing ? '⏳ Indexing...' : '↻ Re-index'}
                </button>
              </div>
            )}
          </div>

          {/* Status Warning Banners */}
          {isIndexing && (
            <div
              style={{
                padding: '10px 24px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fbbf24',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              ⏳ Indexing is running in the background. Embeddings will be queried as soon as chunk generation completes.
            </div>
          )}

          {isStale && (
            <div
              style={{
                padding: '10px 24px',
                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
                color: '#facc15',
                fontSize: '12px',
              }}
            >
              ⚠ Repository has new commits since last indexing. Query results reflect commit {activeRepo?.indexedCommit?.slice(0, 7) || 'previous'}.
            </div>
          )}

          {isNotIndexed && (
            <div
              style={{
                padding: '10px 24px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>✕ Repository is not yet indexed in vector store.</span>
              <button
                onClick={handleReindex}
                disabled={reindexing}
                className="prism-btn prism-btn-primary"
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                Trigger Indexing Now →
              </button>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {!selectedRepo ? (
              <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '480px' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>💬</div>
                <h3 style={{ fontSize: '18px', color: 'var(--text-h)', margin: '0 0 8px' }}>Select a Repository</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  Choose a tracked codebase or explore any public GitHub repository to start asking questions grounded in source code embeddings.
                </p>
              </div>
            ) : loadingMessages ? (
              <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading conversation messages...
              </div>
            ) : (!currentConversation?.messages || currentConversation.messages.length === 0) ? (
              <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '540px' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚡</div>
                <h3 style={{ fontSize: '18px', color: 'var(--text-h)', margin: '0 0 8px' }}>
                  Ask anything about {selectedRepo}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
                  PRism retrieves code chunks via pgvector cosine similarity search and provides grounded, multi-file code explanations with direct source references.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {samplePrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInputMessage(prompt)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent)';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--text)';
                      }}
                    >
                      💡 {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              currentConversation.messages.map((msg) => {
                const isUser = msg.role === 'USER';
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: isUser ? 'var(--accent)' : 'var(--accent-cyan)',
                      }}
                    >
                      <span>{isUser ? '👤 You' : '✨ PRism Intelligence'}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={isUser ? 'prism-card' : 'prism-card'}
                      style={{
                        maxWidth: '85%',
                        padding: '16px 20px',
                        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        backgroundColor: isUser ? 'rgba(168, 85, 247, 0.12)' : '#0f172a',
                        border: isUser ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid var(--border)',
                        color: isUser ? '#ffffff' : '#f1f5f9',
                        fontSize: '14px',
                        lineHeight: 1.65,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.content}

                      {/* Referenced Code Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
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
                            Referenced Code Sources ({msg.sources.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {msg.sources.map((src, sIdx) => (
                              <div
                                key={sIdx}
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--code-bg)',
                                  border: '1px solid var(--border)',
                                  fontSize: '12px',
                                  fontFamily: 'var(--mono)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>📄 {src.file_path}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                    Lines {src.start_line}–{src.end_line}
                                    {src.similarity_score !== undefined && (
                                      <span style={{ marginLeft: '6px' }}>
                                        ({(src.similarity_score * 100).toFixed(0)}% match)
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {src.content && (
                                  <pre
                                    style={{
                                      margin: '6px 0 0',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--surface)',
                                      border: '1px solid var(--border)',
                                      color: '#94a3b8',
                                      fontSize: '11px',
                                      overflowX: 'auto',
                                      maxHeight: '100px',
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
                  </div>
                );
              })
            )}

            {/* Pending Assistant Message */}
            {sendMessageMutation.isPending && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '6px' }}>
                  ✨ PRism Intelligence
                </div>
                <div
                  className="prism-card"
                  style={{
                    padding: '14px 18px',
                    borderRadius: '12px 12px 12px 2px',
                    backgroundColor: '#0f172a',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '13px',
                    color: '#94a3b8',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-cyan)',
                      animation: 'pulse 1.2s infinite',
                    }}
                  />
                  <span>Searching vector embeddings and synthesizing answer...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Sticky Bottom Input Bar */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--surface)',
            }}
          >
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                rows={2}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedRepo
                    ? `Ask anything about ${selectedRepo}... (Enter to send, Shift+Enter for newline)`
                    : 'Select a repository above first...'
                }
                disabled={!selectedRepo || sendMessageMutation.isPending}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--code-bg)',
                  color: 'var(--text-h)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                }}
              />

              <button
                type="submit"
                disabled={!selectedRepo || !inputMessage.trim() || sendMessageMutation.isPending}
                className="prism-btn prism-btn-primary"
                style={{ padding: '10px 20px', fontSize: '13px', height: '44px', flexShrink: 0 }}
              >
                {sendMessageMutation.isPending ? 'Searching...' : 'Send →'}
              </button>
            </form>
          </div>
        </main>
      </div>

      {/* Add Repository Modal */}
      <AddRepositoryModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSelectRepo={(repoFullName) => {
          handleSelectRepo(repoFullName);
          refetchRepos();
        }}
      />
    </div>
  );
}

export default function CodeQAPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading Code Q&A...</div>}>
      <CodeQAChatContent />
    </Suspense>
  );
}
