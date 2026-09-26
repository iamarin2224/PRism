'use client';

import React, { useState } from 'react';
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
  const [copiedCode, setCopiedCode] = useState(false);

  const lineLabel =
    finding.startLine === finding.endLine
      ? `L${finding.startLine}`
      : `L${finding.startLine}–L${finding.endLine}`;

  const severityUpper = finding.severity?.toUpperCase() || 'INFO';
  const borderHighlight =
    severityUpper === 'CRITICAL'
      ? '1px solid rgba(244, 63, 94, 0.35)'
      : severityUpper === 'HIGH'
      ? '1px solid rgba(249, 115, 22, 0.3)'
      : '1px solid var(--border)';

  const handleCopySuggestion = () => {
    if (!finding.suggestion) return;
    navigator.clipboard.writeText(finding.suggestion);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--surface)',
        border: borderHighlight,
        borderRadius: '8px',
        padding: '16px 18px',
        marginBottom: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'border-color 0.15s ease',
      }}
    >
      {/* Finding Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <StatusBadge type="severity" value={finding.severity} size="sm" />
            <StatusBadge type="specialist" value={finding.specialist} size="sm" />
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                backgroundColor: 'var(--surface-hover)',
                padding: '2px 7px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                fontWeight: 500,
              }}
            >
              {finding.category}
            </span>
            {finding.isVerified && (
              <span
                style={{
                  fontSize: '10.5px',
                  color: '#34d399',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                ✓ Verified
              </span>
            )}
          </div>

          <h4
            style={{
              margin: '4px 0 0',
              fontSize: '14.5px',
              fontWeight: 600,
              color: 'var(--text-h)',
              lineHeight: 1.4,
            }}
          >
            {finding.title}
          </h4>
        </div>

        {/* Confidence & Agreement */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
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
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              {finding.agreementCount} specialists aligned
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
            gap: '6px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: 'var(--code-bg)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--mono)',
            fontSize: '11.5px',
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
        <div style={{ marginTop: '2px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Actionable Fix Suggestion
            </span>
            <button
              onClick={handleCopySuggestion}
              className="prism-btn prism-btn-ghost prism-btn-sm"
              style={{ fontSize: '11px', padding: '1px 6px', color: copiedCode ? '#34d399' : 'var(--text-muted)' }}
            >
              {copiedCode ? '✓ Copied' : '📋 Copy code'}
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              padding: '10px 14px',
              borderRadius: '6px',
              backgroundColor: 'var(--code-bg)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              color: '#f1f5f9',
              fontSize: '12px',
              lineHeight: 1.55,
              overflowX: 'auto',
              fontFamily: 'var(--mono)',
            }}
          >
            <code>{finding.suggestion}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
