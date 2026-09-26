'use client';

import React, { useState } from 'react';

export interface TimelineEvent {
  id: string;
  spanId: string;
  nodeName: string;
  eventType: string;
  payload: any;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number | null;
  createdAt: string;
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!events || events.length === 0) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '13px',
        }}
      >
        No telemetry spans recorded for this review run yet.
      </div>
    );
  }

  const getNodeBadgeColor = (nodeName: string) => {
    const lower = nodeName.toLowerCase();
    if (lower.includes('security')) return { bg: 'rgba(244, 63, 94, 0.12)', text: '#fb7185', border: 'rgba(244, 63, 94, 0.25)' };
    if (lower.includes('critic') || lower.includes('verifier')) return { bg: 'rgba(236, 72, 153, 0.12)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.25)' };
    if (lower.includes('gate') || lower.includes('router')) return { bg: 'rgba(245, 158, 11, 0.12)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.25)' };
    if (lower.includes('post') || lower.includes('github')) return { bg: 'rgba(16, 185, 129, 0.12)', text: '#34d399', border: 'rgba(16, 185, 129, 0.25)' };
    if (lower.includes('specialist')) return { bg: 'rgba(168, 85, 247, 0.12)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.25)' };
    if (lower.includes('context') || lower.includes('rag') || lower.includes('retriev'))
      return { bg: 'rgba(56, 189, 248, 0.12)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.25)' };
    return { bg: 'var(--surface-hover)', text: 'var(--text)', border: 'var(--border)' };
  };

  return (
    <div style={{ position: 'relative', paddingLeft: '22px' }}>
      {/* Vertical Spine Line */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          bottom: '16px',
          left: '8px',
          width: '2px',
          backgroundColor: 'var(--border)',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {events.map((event, idx) => {
          const badgeStyle = getNodeBadgeColor(event.nodeName);
          const isExpanded = expandedId === event.id;
          const payloadStr =
            typeof event.payload === 'object'
              ? JSON.stringify(event.payload, null, 2)
              : String(event.payload || '{}');

          const hasPayload =
            event.payload &&
            (typeof event.payload === 'object'
              ? Object.keys(event.payload).length > 0
              : Boolean(event.payload));

          return (
            <div key={event.id || idx} style={{ position: 'relative' }}>
              {/* Event Dot */}
              <div
                style={{
                  position: 'absolute',
                  left: '-19px',
                  top: '8px',
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: badgeStyle.text,
                  border: '2px solid var(--surface)',
                  boxShadow: `0 0 6px ${badgeStyle.text}55`,
                }}
              />

              {/* Event Card */}
              <div
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  fontSize: '12.5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: '4px',
                        backgroundColor: badgeStyle.bg,
                        color: badgeStyle.text,
                        border: `1px solid ${badgeStyle.border}`,
                        fontWeight: 600,
                        fontSize: '11px',
                        fontFamily: 'var(--mono)',
                      }}
                    >
                      {event.nodeName}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-h)' }}>
                      {event.eventType}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {event.durationMs !== undefined && event.durationMs !== null && (
                      <span
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontFamily: 'var(--mono)',
                        }}
                        title="Execution Latency"
                      >
                        ⏱ {event.durationMs.toFixed(0)}ms
                      </span>
                    )}
                    {((event.tokensIn || 0) + (event.tokensOut || 0) > 0) && (
                      <span
                        style={{
                          backgroundColor: 'var(--surface-hover)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontFamily: 'var(--mono)',
                        }}
                        title="Tokens consumed"
                      >
                        ⚡ {(event.tokensIn || 0) + (event.tokensOut || 0)} tok
                      </span>
                    )}
                    <span>{new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                </div>

                {/* Payload Accordion */}
                {hasPayload && (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-cyan)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 500,
                      }}
                    >
                      <span>{isExpanded ? '▾ Hide Raw Telemetry' : '▸ View Raw Telemetry'}</span>
                    </button>

                    {isExpanded && (
                      <pre
                        style={{
                          margin: '8px 0 0',
                          padding: '10px 12px',
                          borderRadius: '5px',
                          backgroundColor: 'var(--code-bg)',
                          border: '1px solid var(--border)',
                          fontSize: '11px',
                          lineHeight: 1.45,
                          color: '#e2e8f0',
                          overflowX: 'auto',
                          maxHeight: '260px',
                          fontFamily: 'var(--mono)',
                        }}
                      >
                        <code>{payloadStr}</code>
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
