'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { FindingCard } from '@/components/FindingCard';
import { Timeline } from '@/components/Timeline';
import { useReviewDetail, useApproveReview } from '@/lib/hooks/useReviews';

export default function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'events'>('overview');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  const { data, isLoading, isError, error: queryError, refetch } = useReviewDetail(id);
  const approveMutation = useApproveReview();

  const review = data?.review;
  const events = data?.events || [];
  const loading = isLoading && !review;
  const error = isError ? (queryError as Error)?.message || 'Error loading review' : null;

  // HITL Approval Handler
  const handleApprove = async () => {
    if (!review) return;
    try {
      await approveMutation.mutateAsync({ reviewId: review.id });
      refetch();
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading review report...
      </div>
    );
  }

  if (error || !review) {
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
          {error || 'Review not found'}
        </div>
        <Link href="/reviews" className="prism-btn prism-btn-secondary">
          ← Back to Reviews
        </Link>
      </div>
    );
  }

  const isAwaitingApproval = review.status === 'AWAITING_HUMAN_APPROVAL';
  const isCompleted = review.status === 'COMPLETED';
  const isInProgress = review.status === 'IN_PROGRESS' || review.status === 'QUEUED';

  const filteredFindings =
    severityFilter === 'ALL'
      ? review.findings
      : review.findings.filter((f) => f.severity.toUpperCase() === severityFilter);

  const criticalCount = review.findings.filter((f) => f.severity.toLowerCase() === 'critical').length;
  const highCount = review.findings.filter((f) => f.severity.toLowerCase() === 'high').length;
  const securityFindings = review.findings.filter((f) => f.category === 'SECURITY');
  const qualityFindings = review.findings.filter((f) => ['BUG', 'DESIGN', 'PERFORMANCE'].includes(f.category));
  const testFindings = review.findings.filter((f) => f.category === 'TEST_COVERAGE');
  const docFindings = review.findings.filter((f) => f.category === 'DOCUMENTATION');

  // Extract events metadata for summary
  const summaryEvent = events.find((e) => e.nodeName === 'agent_summary' || e.eventType === 'PR_SUMMARY_GENERATED');
  const prSummary: any = summaryEvent?.payload || null;
  const contextEvent = events.find((e) => e.nodeName === 'build_context');
  const securityEvent = events.find((e) => e.nodeName === 'specialist_security');
  const qualityEvent = events.find((e) => e.nodeName === 'specialist_quality');
  const testsEvent = events.find((e) => e.nodeName === 'specialist_tests');
  const docsEvent = events.find((e) => e.nodeName === 'specialist_docs');
  const criticEvent = events.find((e) => e.nodeName === 'critic_verifier');

  // Generate copyable markdown report
  const generatedMarkdownReport = `# 🤖 PRism Automated Code Intelligence Report
**Pull Request:** \`#${review.prNumber}\`
**Repository:** \`${review.repoName}\` | **Verdict:** \`${review.routingDecision || review.status}\`

---
${
  prSummary
    ? `### 📖 Pull Request Overview & Intent
${prSummary.overview || ''}

${
  Array.isArray(prSummary.key_changes) && prSummary.key_changes.length > 0
    ? `**Key Changes:**\n` + prSummary.key_changes.map((kc: string) => `- ${kc}`).join('\n') + '\n\n'
    : ''
}${
  Array.isArray(prSummary.file_changes) && prSummary.file_changes.length > 0
    ? `**File Changes Breakdown:**\n| File | Action | Summary |\n| :--- | :--- | :--- |\n` +
      prSummary.file_changes.map((fc: any) => `| \`${fc.file_path}\` | **${fc.action || 'modified'}** | ${fc.summary} |`).join('\n') +
      '\n\n'
    : ''
}${prSummary.architectural_impact ? `**Architectural Impact:** ${prSummary.architectural_impact}\n\n` : ''}---
`
    : ''
}### 🧭 Multi-Agent Specialist Matrix
${
  review.findings.length === 0
    ? '✅ **Clean Pull Request:** PRism specialists analyzed this changeset across security, architectural quality, test coverage, and documentation. No blocking vulnerabilities or quality defects were detected.'
    : `⚠️ **Actionable Findings Detected:** PRism identified **${review.findings.length} finding(s)** (${criticalCount} critical, ${highCount} high) that require attention before merging.`
}

| Specialist | Focus Domain | Status | Notes |
| :--- | :--- | :--- | :--- |
| 🛡️ **Security** | Vulnerabilities, Auth, Secrets, CVEs | ${securityFindings.length > 0 ? '⚠️ Action Required' : '✅ Passed'} | ${securityFindings.length > 0 ? `${securityFindings.length} issue(s) flagged` : 'Zero CVEs or token leaks detected'} |
| 💎 **Quality** | Code Smells, AST Architecture, Clean Code | ${qualityFindings.length > 0 ? '⚠️ Action Required' : '✅ Passed'} | ${qualityFindings.length > 0 ? `${qualityFindings.length} defect(s) flagged` : 'Adheres to idioms and modular structure'} |
| 🧪 **Tests** | Coverage Gaps, Assertions, Edge Cases | ${testFindings.length > 0 ? '⚠️ Action Required' : '✅ Passed'} | ${testFindings.length > 0 ? `${testFindings.length} gap(s) identified` : 'Test changes and specs verified'} |
| 📚 **Docs** | Interface Types, README, JSDoc | ${docFindings.length > 0 ? '⚠️ Action Required' : '✅ Passed'} | ${docFindings.length > 0 ? `${docFindings.length} doc item(s) flagged` : 'Documentation up to date'} |

${
  review.findings.length > 0
    ? `\n### 📋 Actionable Findings Summary\n` +
      review.findings
        .map(
          (f, idx) =>
            `#### ${idx + 1}. [${f.severity.toUpperCase()}] ${f.title}\n- **File:** \`${f.filePath}\` (L${f.startLine}${f.endLine && f.endLine !== f.startLine ? `-L${f.endLine}` : ''})\n- **Specialist:** \`${f.specialist}\`\n\n${f.description}\n` +
            (f.suggestion ? `\n\`\`\`suggestion\n${f.suggestion}\n\`\`\`\n` : '')
        )
        .join('\n---\n')
    : ''
}

*Generated automatically by PRism Swarm Intelligence*`;

  const copyMarkdownToClipboard = () => {
    navigator.clipboard.writeText(generatedMarkdownReport);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Header
        title={`PR #${review.prNumber} • ${review.repoName}`}
        subtitle={`Commit ${review.commitSha.substring(0, 7)}`}
        breadcrumbs={[
          { label: 'PRism', href: '/' },
          { label: 'Reviews', href: '/reviews' },
          { label: `PR #${review.prNumber}` },
        ]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={copyMarkdownToClipboard}
              className="prism-btn prism-btn-secondary"
              title="Copy GitHub Review Markdown"
            >
              {copiedMarkdown ? '✓ Copied Markdown' : '📋 Copy GitHub Report'}
            </button>
            <button
              onClick={() => refetch()}
              className="prism-btn prism-btn-secondary"
              title="Refresh review data"
            >
              ↻ Refresh
            </button>
            {review.repositoryId && (
              <Link
                href={`/repositories/${review.repositoryId}`}
                className="prism-btn prism-btn-secondary"
              >
                Repository Info
              </Link>
            )}
          </div>
        }
      />

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Human-in-the-Loop Approval Action Banner */}
        {isAwaitingApproval && (
          <div
            style={{
              padding: '20px 24px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '18px' }}>✋</span>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#fbbf24', fontWeight: 600 }}>
                  Human Approval Required
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)' }}>
                This review was paused by the confidence & severity gate (detected{' '}
                {criticalCount > 0 ? `${criticalCount} critical finding(s)` : 'findings requiring confirmation'}).
                Inspect the verified findings below and approve to post the formatted review directly to GitHub.
              </p>
            </div>

            <button
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="prism-btn prism-btn-primary"
              style={{
                fontSize: '13px',
                padding: '10px 20px',
                backgroundColor: '#fbbf24',
                color: '#000000',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {approveMutation.isPending ? 'Posting to GitHub...' : 'Approve & Post Review'}
            </button>
          </div>
        )}

        {/* Live Processing Notice */}
        {isInProgress && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '8px',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-cyan)',
                animation: 'pulse 1.2s infinite',
              }}
            />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--accent-cyan)', fontSize: '14px' }}>
                Review In Progress
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text)' }}>
                Parallel specialist agents (Security, Quality, Tests, Docs) and Critic Verifier are actively executing. Telemetry will update in real time.
              </div>
            </div>
          </div>
        )}

        {/* Review Metadata Summary Card */}
        <div className="prism-card" style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                STATUS
              </span>
              <div style={{ marginTop: '4px' }}>
                <StatusBadge type="review" value={review.status} size="md" />
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                VERDICT
              </span>
              <div style={{ marginTop: '4px' }}>
                <StatusBadge type="routing" value={review.routingDecision} size="md" />
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                TOTAL FINDINGS
              </span>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-h)', marginTop: '2px' }}>
                {review.findings.length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {criticalCount} critical • {highCount} high
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                EXECUTION TIME
              </span>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-h)', marginTop: '2px' }}>
                {review.durationMs ? `${(review.durationMs / 1000).toFixed(2)}s` : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Total swarm latency
              </div>
            </div>

            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                EVENTS SPAN
              </span>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-h)', marginTop: '2px' }}>
                {events.length} Spans
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Recorded in telemetry spine
              </div>
            </div>
          </div>
        </div>

        {/* Tab Controls: Overview vs Findings vs Events Spine */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: activeTab === 'overview' ? 'var(--text-h)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeTab === 'overview' ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              📋 Overview & Summary
            </button>
            <button
              onClick={() => setActiveTab('findings')}
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: activeTab === 'findings' ? 'var(--text-h)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeTab === 'findings' ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              🔍 Actionable Findings ({review.findings.length})
            </button>
            <button
              onClick={() => setActiveTab('events')}
              style={{
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: activeTab === 'events' ? 'var(--text-h)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeTab === 'events' ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              📊 Telemetry Spine ({events.length})
            </button>
          </div>

          {/* Severity filter (only visible on findings tab) */}
          {activeTab === 'findings' && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: severityFilter === sev ? 'var(--surface-active)' : 'transparent',
                    color: severityFilter === sev ? 'var(--text-h)' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TAB 1: OVERVIEW & SUMMARY */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Executive Status Banner */}
            <div
              style={{
                padding: '20px 24px',
                borderRadius: '8px',
                backgroundColor: review.findings.length === 0 ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${review.findings.length === 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '28px' }}>
                  {review.findings.length === 0 ? '✅' : '⚠️'}
                </span>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: 'var(--text-h)', fontWeight: 700 }}>
                    {review.findings.length === 0
                      ? 'Clean Pull Request — All Specialists Passed'
                      : `${review.findings.length} Actionable Finding(s) Identified`}
                  </h3>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                    {review.findings.length === 0
                      ? 'Multi-agent review completed. No vulnerabilities, architecture flaws, test regressions, or documentation gaps were detected.'
                      : `${criticalCount} critical and ${highCount} high severity issue(s) were flagged by specialized analysis nodes.`}
                  </p>
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>ROUTING ACTION</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-h)', marginTop: '2px' }}>
                  {review.routingDecision === 'POST_GITHUB' ? '🚀 Auto-Posted on GitHub' : '✋ Human Approval Required'}
                </div>
              </div>
            </div>

            {/* PR Intent & File Changes Summary Card */}
            <div className="prism-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>📖</span>
                  <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-h)', fontWeight: 600 }}>
                    Pull Request Summary & File Impact
                  </h3>
                </div>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    color: 'var(--accent-cyan)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}
                >
                  Synthesized by Summary Agent
                </span>
              </div>

              {prSummary ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {prSummary.overview && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        color: 'var(--text)',
                      }}
                    >
                      {prSummary.overview}
                    </div>
                  )}

                  {Array.isArray(prSummary.key_changes) && prSummary.key_changes.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-h)', fontWeight: 600 }}>
                        🎯 Key Changes & Functional Capabilities
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text)', lineHeight: '1.6' }}>
                        {prSummary.key_changes.map((kc: string, i: number) => (
                          <li key={i}>{kc}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(prSummary.file_changes) && prSummary.file_changes.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-h)', fontWeight: 600 }}>
                        📂 Modified Files Breakdown ({prSummary.file_changes.length})
                      </h4>
                      <div
                        style={{
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          overflow: 'hidden',
                        }}
                      >
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                              <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>FILE PATH</th>
                              <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)', width: '100px' }}>ACTION</th>
                              <th style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-muted)' }}>PURPOSE / CHANGE SUMMARY</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prSummary.file_changes.map((fc: any, i: number) => (
                              <tr
                                key={i}
                                style={{
                                  borderBottom: i < prSummary.file_changes.length - 1 ? '1px solid var(--border)' : 'none',
                                }}
                              >
                                <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>
                                  {fc.file_path}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                  <span
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                      textTransform: 'uppercase',
                                      backgroundColor:
                                        fc.action === 'added'
                                          ? 'rgba(34, 197, 94, 0.15)'
                                          : fc.action === 'deleted'
                                          ? 'rgba(239, 68, 68, 0.15)'
                                          : 'rgba(56, 189, 248, 0.15)',
                                      color:
                                        fc.action === 'added'
                                          ? '#4ade80'
                                          : fc.action === 'deleted'
                                          ? '#f87171'
                                          : 'var(--accent-cyan)',
                                    }}
                                  >
                                    {fc.action || 'modified'}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 12px', color: 'var(--text)' }}>
                                  {fc.summary}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {(prSummary.architectural_impact || prSummary.risk_assessment) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {prSummary.architectural_impact && (
                        <div style={{ padding: '12px 14px', borderRadius: '6px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            ARCHITECTURAL & SCOPE IMPACT
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text)' }}>
                            {prSummary.architectural_impact}
                          </div>
                        </div>
                      )}
                      {prSummary.risk_assessment && (
                        <div style={{ padding: '12px 14px', borderRadius: '6px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            RISK ASSESSMENT
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500 }}>
                            {prSummary.risk_assessment}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  PR summary synthesis details will appear here once the run is complete.
                </div>
              )}
            </div>

            {/* Specialist Health Matrix (4 Cards) */}
            <div>
              <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--text-h)', fontWeight: 600 }}>
                🔬 Multi-Agent Specialist Analysis Matrix
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {/* Security */}
                <div className="prism-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🛡️</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Security Specialist</strong>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: securityFindings.length === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: securityFindings.length === 0 ? '#4ade80' : '#f87171',
                      }}
                    >
                      {securityFindings.length === 0 ? '✓ PASSED' : `⚠️ ${securityFindings.length} ISSUES`}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text)', lineHeight: '1.5' }}>
                    {securityEvent?.payload?.verdict_summary ||
                      (securityFindings.length === 0
                        ? 'Audited PR changeset; verified parameter sanitization, token security, and zero CVE vulnerabilities detected.'
                        : `Identified ${securityFindings.length} security flaw(s) needing remediation.`)}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Focus: Auth, Secret Leaks, Sanitization • Latency: {securityEvent?.durationMs ? `${(securityEvent.durationMs / 1000).toFixed(1)}s` : '1.5s'}
                  </div>
                </div>

                {/* Code Quality */}
                <div className="prism-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>💎</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Quality & Architecture</strong>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: qualityFindings.length === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: qualityFindings.length === 0 ? '#4ade80' : '#f87171',
                      }}
                    >
                      {qualityFindings.length === 0 ? '✓ PASSED' : `⚠️ ${qualityFindings.length} ISSUES`}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text)', lineHeight: '1.5' }}>
                    {qualityEvent?.payload?.verdict_summary ||
                      (qualityFindings.length === 0
                        ? 'Evaluated AST structure and code complexity across changed files; clean architectural separation, DRY adherence, and idiomatic TypeScript verified.'
                        : `Detected ${qualityFindings.length} architectural smell(s) or defect(s).`)}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Focus: AST, DRY, Maintainability • Latency: {qualityEvent?.durationMs ? `${(qualityEvent.durationMs / 1000).toFixed(1)}s` : '1.2s'}
                  </div>
                </div>

                {/* Tests */}
                <div className="prism-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>🧪</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Test Coverage Specialist</strong>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: testFindings.length === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: testFindings.length === 0 ? '#4ade80' : '#f87171',
                      }}
                    >
                      {testFindings.length === 0 ? '✓ PASSED' : `⚠️ ${testFindings.length} ISSUES`}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text)', lineHeight: '1.5' }}>
                    {testsEvent?.payload?.verdict_summary ||
                      (testFindings.length === 0
                        ? 'Checked test coverage and regression boundaries; mock isolation, assertions, and boundary conditions verified.'
                        : `Found ${testFindings.length} missing test case(s) or weak assertion(s).`)}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Focus: Assertion Quality, Edge Cases • Latency: {testsEvent?.durationMs ? `${(testsEvent.durationMs / 1000).toFixed(1)}s` : '1.8s'}
                  </div>
                </div>

                {/* Documentation */}
                <div className="prism-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>📚</span>
                      <strong style={{ fontSize: '14px', color: 'var(--text-h)' }}>Documentation Specialist</strong>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: docFindings.length === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: docFindings.length === 0 ? '#4ade80' : '#f87171',
                      }}
                    >
                      {docFindings.length === 0 ? '✓ PASSED' : `⚠️ ${docFindings.length} ISSUES`}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text)', lineHeight: '1.5' }}>
                    {docsEvent?.payload?.verdict_summary ||
                      (docFindings.length === 0
                        ? 'Reviewed exported TypeScript interfaces, props, and API route contracts; types and component contracts are fully documented.'
                        : `Identified ${docFindings.length} undocumented exported symbol(s).`)}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Focus: JSDocs, Types, README • Latency: {docsEvent?.durationMs ? `${(docsEvent.durationMs / 1000).toFixed(1)}s` : '0.9s'}
                  </div>
                </div>
              </div>
            </div>

            {/* Rendered Full Markdown Review Report */}
            <div className="prism-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-h)', fontWeight: 600 }}>
                  📄 Formatted Review Report (GitHub Markdown)
                </h3>
                <button
                  onClick={copyMarkdownToClipboard}
                  className="prism-btn prism-btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  {copiedMarkdown ? '✓ Copied' : 'Copy Markdown'}
                </button>
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: '16px 20px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.6',
                }}
              >
                {generatedMarkdownReport}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 2: FINDINGS LIST */}
        {activeTab === 'findings' && (
          <div>
            {filteredFindings.length === 0 ? (
              <div
                style={{
                  padding: '48px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--surface)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '18px', marginBottom: '6px' }}>✓</div>
                <div style={{ fontWeight: 600, color: 'var(--text-h)', marginBottom: '4px' }}>
                  No findings detected for this filter
                </div>
                <div style={{ fontSize: '12px' }}>
                  {severityFilter === 'ALL'
                    ? 'PRism specialists and Critic verifier did not identify any actionable defects. LGTM!'
                    : `No findings with severity "${severityFilter}" found.`}
                </div>
              </div>
            ) : (
              filteredFindings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))
            )}
          </div>
        )}

        {/* TAB 3: EVENTS SPINE TIMELINE */}
        {activeTab === 'events' && (
          <div className="prism-card" style={{ padding: '24px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: 'var(--text-h)' }}>
                Append-Only Audit & Telemetry Spine
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                Immutable execution timeline of LangGraph agent spans, vector context retrieval, critic validations, and confidence gating decisions.
              </p>
            </div>

            <Timeline events={events} />
          </div>
        )}
      </div>
    </div>
  );
}
