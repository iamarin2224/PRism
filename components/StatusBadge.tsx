import React from 'react';

type BadgeType =
  | 'index'
  | 'review'
  | 'routing'
  | 'severity'
  | 'specialist'
  | 'visibility';

interface StatusBadgeProps {
  type: BadgeType;
  value: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ type, value, size = 'sm' }: StatusBadgeProps) {
  if (!value) return null;

  const valUpper = value.toUpperCase();

  let label = valUpper;
  let bg = 'rgba(107, 114, 128, 0.15)';
  let color = '#9ca3af';
  let border = 'rgba(107, 114, 128, 0.3)';
  let icon: string | null = null;

  if (type === 'index') {
    switch (valUpper) {
      case 'INDEXED':
        label = 'Up to date';
        bg = 'rgba(16, 185, 129, 0.12)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.3)';
        icon = '●';
        break;
      case 'INDEXING':
        label = 'Indexing...';
        bg = 'rgba(245, 158, 11, 0.15)';
        color = '#fbbf24';
        border = 'rgba(245, 158, 11, 0.35)';
        icon = '◐';
        break;
      case 'STALE':
        label = 'Needs reindexing';
        bg = 'rgba(234, 179, 8, 0.15)';
        color = '#fde047';
        border = 'rgba(234, 179, 8, 0.35)';
        icon = '⚠';
        break;
      case 'FAILED':
        label = 'Failed';
        bg = 'rgba(239, 68, 68, 0.15)';
        color = '#f87171';
        border = 'rgba(239, 68, 68, 0.35)';
        icon = '✕';
        break;
      default:
        label = 'Not indexed';
        bg = 'rgba(156, 163, 175, 0.1)';
        color = '#9ca3af';
        border = 'rgba(156, 163, 175, 0.25)';
        icon = '○';
        break;
    }
  } else if (type === 'review') {
    switch (valUpper) {
      case 'COMPLETED':
        label = 'Completed';
        bg = 'rgba(16, 185, 129, 0.12)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.3)';
        break;
      case 'IN_PROGRESS':
        label = 'In Progress';
        bg = 'rgba(56, 189, 248, 0.15)';
        color = '#38bdf8';
        border = 'rgba(56, 189, 248, 0.35)';
        icon = '⚡';
        break;
      case 'AWAITING_HUMAN_APPROVAL':
        label = 'Awaiting Approval';
        bg = 'rgba(245, 158, 11, 0.15)';
        color = '#fbbf24';
        border = 'rgba(245, 158, 11, 0.4)';
        icon = '✋';
        break;
      case 'FAILED':
        label = 'Failed';
        bg = 'rgba(239, 68, 68, 0.15)';
        color = '#f87171';
        border = 'rgba(239, 68, 68, 0.35)';
        break;
      case 'QUEUED':
        label = 'Queued';
        bg = 'rgba(148, 163, 184, 0.12)';
        color = '#94a3b8';
        border = 'rgba(148, 163, 184, 0.3)';
        break;
      default:
        label = valUpper;
        break;
    }
  } else if (type === 'routing') {
    switch (valUpper) {
      case 'POST_GITHUB':
      case 'POST_REVIEW_GITHUB':
        label = 'Auto-Posted';
        bg = 'rgba(16, 185, 129, 0.12)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.3)';
        icon = '✓';
        break;
      case 'REQUIRE_HUMAN_APPROVAL':
      case 'HUMAN_APPROVAL_QUEUE':
        label = 'Human Approval Required';
        bg = 'rgba(245, 158, 11, 0.15)';
        color = '#fbbf24';
        border = 'rgba(245, 158, 11, 0.35)';
        icon = '✋';
        break;
      case 'DISMISSED':
        label = 'Dismissed';
        bg = 'rgba(107, 114, 128, 0.15)';
        color = '#9ca3af';
        border = 'rgba(107, 114, 128, 0.3)';
        break;
      default:
        label = valUpper;
        break;
    }
  } else if (type === 'severity') {
    switch (valUpper) {
      case 'CRITICAL':
        label = 'Critical';
        bg = 'rgba(239, 68, 68, 0.2)';
        color = '#ef4444';
        border = 'rgba(239, 68, 68, 0.5)';
        break;
      case 'HIGH':
        label = 'High';
        bg = 'rgba(249, 115, 22, 0.18)';
        color = '#fb923c';
        border = 'rgba(249, 115, 22, 0.4)';
        break;
      case 'MEDIUM':
        label = 'Medium';
        bg = 'rgba(234, 179, 8, 0.15)';
        color = '#facc15';
        border = 'rgba(234, 179, 8, 0.35)';
        break;
      case 'LOW':
        label = 'Low';
        bg = 'rgba(59, 130, 246, 0.15)';
        color = '#60a5fa';
        border = 'rgba(59, 130, 246, 0.3)';
        break;
      case 'INFO':
        label = 'Info';
        bg = 'rgba(107, 114, 128, 0.15)';
        color = '#9ca3af';
        border = 'rgba(107, 114, 128, 0.3)';
        break;
      default:
        label = valUpper;
        break;
    }
  } else if (type === 'specialist') {
    switch (valUpper) {
      case 'SECURITY':
        label = 'Security';
        bg = 'rgba(239, 68, 68, 0.15)';
        color = '#f87171';
        border = 'rgba(239, 68, 68, 0.35)';
        break;
      case 'QUALITY':
        label = 'Code Quality';
        bg = 'rgba(168, 85, 247, 0.15)';
        color = '#c084fc';
        border = 'rgba(168, 85, 247, 0.35)';
        break;
      case 'TESTS':
        label = 'Test Coverage';
        bg = 'rgba(14, 165, 233, 0.15)';
        color = '#38bdf8';
        border = 'rgba(14, 165, 233, 0.35)';
        break;
      case 'DOCS':
        label = 'Documentation';
        bg = 'rgba(16, 185, 129, 0.15)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.35)';
        break;
      case 'CRITIC':
        label = 'Critic / Verifier';
        bg = 'rgba(236, 72, 153, 0.15)';
        color = '#f472b6';
        border = 'rgba(236, 72, 153, 0.35)';
        break;
      default:
        label = valUpper;
        break;
    }
  } else if (type === 'visibility') {
    label = valUpper === 'TRUE' || valUpper === 'PRIVATE' ? 'Private' : 'Public';
    bg = 'rgba(107, 114, 128, 0.1)';
    color = '#9ca3af';
    border = 'rgba(107, 114, 128, 0.25)';
  }

  const fontSize = size === 'sm' ? '11px' : size === 'md' ? '12px' : '13px';
  const padding = size === 'sm' ? '2px 7px' : size === 'md' ? '3px 9px' : '4px 12px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize,
        padding,
        borderRadius: '4px',
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      {icon && <span style={{ fontSize: '9px', opacity: 0.9 }}>{icon}</span>}
      {label}
    </span>
  );
}
