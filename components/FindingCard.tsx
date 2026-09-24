'use client';

import React from 'react';
import { StatusBadge } from './StatusBadge';

export interface FindingData {
  id: string;
  specialist: string;
  category: string;
  severity: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  description: string;
  suggestion?: string | null;
  confidence: number;
  agreementCount: number;
  isVerified: boolean;
}

export function FindingCard({ finding }: { finding: FindingData }) {
  const lineLabel =
    finding.startLine === finding.endLine
      ? `L${finding.startLine}`
      : `L${finding.startLine}–L${finding.endLine}`;

  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Finding Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <StatusBadge type="severity" value={finding.severity} />
            <StatusBadge type="specialist" value={finding.specialist} />
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                backgroundColor: 'var(--surface-hover)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
              }}
            >
              {finding.category}
            </span>
            {finding.isVerified && (
              <span
                style={{
                  fontSize: '10px',
                  color: '#34d399',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 600,
                }}
              >
                ✓ Critic Verified
              </span>
            )}
          </div>

          <h4
            style={{
              margin: '6px 0 0',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-h)',
            }}
          >
            {finding.title}
          </h4>
        </div>

        {/* Confidence & Agreement */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Confidence:</span>
            <span
              style={{
                fontWeight: 700,
                color:
                  finding.confidence >= 0.85
                    ? '#34d399'
                    : finding.confidence >= 0.7
                    ? '#fbbf24'
                    : '#f87171',
              }}
            >
              {(finding.confidence * 100).toFixed(0)}%
            </span>
          </div>
          {finding.agreementCount > 1 && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {finding.agreementCount} specialists agreed
            </span>
          )}
        </div>
      </div>

      {/* File & Line target */}
      {finding.filePath && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: 'var(--code-bg)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
            color: 'var(--accent-cyan)',
            width: 'fit-content',
          }}
        >
          <span>📄</span>
          <span>{finding.filePath}</span>
          <span style={{ color: 'var(--text-muted)' }}>{lineLabel}</span>
        </div>
      )}

      {/* Description */}
      <div
        style={{
          fontSize: '13px',
          lineHeight: 1.6,
          color: 'var(--text)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {finding.description}
      </div>

      {/* Actionable Code Suggestion */}
      {finding.suggestion && (
        <div style={{ marginTop: '4px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Actionable Suggestion
          </div>
          <pre
            style={{
              margin: 0,
              padding: '12px 14px',
              borderRadius: '6px',
              backgroundColor: 'var(--code-bg)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              color: '#f3f4f6',
              fontSize: '12px',
              lineHeight: 1.5,
              overflowX: 'auto',
            }}
          >
            <code>{finding.suggestion}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
