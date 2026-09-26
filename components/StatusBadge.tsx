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
  let bg = 'rgba(100, 116, 139, 0.12)';
  let color = '#94a3b8';
  let border = 'rgba(100, 116, 139, 0.25)';
  let dotColor: string | null = null;
  let icon: string | null = null;

  if (type === 'index') {
    switch (valUpper) {
      case 'INDEXED':
        label = 'Up to date';
        bg = 'rgba(16, 185, 129, 0.1)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.28)';
        dotColor = '#10b981';
        break;
      case 'INDEXING':
        label = 'Indexing...';
        bg = 'rgba(245, 158, 11, 0.12)';
        color = '#fbbf24';
        border = 'rgba(245, 158, 11, 0.3)';
        dotColor = '#f59e0b';
        break;
      case 'STALE':
        label = 'Needs sync';
        bg = 'rgba(234, 179, 8, 0.12)';
        color = '#fde047';
        border = 'rgba(234, 179, 8, 0.3)';
        dotColor = '#eab308';
        break;
      case 'FAILED':
        label = 'Failed';
        bg = 'rgba(244, 63, 94, 0.12)';
        color = '#fb7185';
        border = 'rgba(244, 63, 94, 0.3)';
        dotColor = '#f43f5e';
        break;
      default:
        label = 'Not indexed';
        bg = 'rgba(100, 116, 139, 0.1)';
        color = '#94a3b8';
        border = 'rgba(100, 116, 139, 0.2)';
        dotColor = '#64748b';
        break;
    }
  } else if (type === 'review') {
    switch (valUpper) {
      case 'COMPLETED':
        label = 'Completed';
        bg = 'rgba(16, 185, 129, 0.1)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.28)';
        dotColor = '#10b981';
        break;
      case 'IN_PROGRESS':
        label = 'In Progress';
        bg = 'rgba(56, 189, 248, 0.12)';
        color = '#38bdf8';
        border = 'rgba(56, 189, 248, 0.3)';
        dotColor = '#38bdf8';
        icon = '⚡';
        break;
      case 'AWAITING_HUMAN_APPROVAL':
        label = 'Awaiting Approval';
        bg = 'rgba(245, 158, 11, 0.12)';
        color = '#fbbf24';
        border = 'rgba(245, 158, 11, 0.35)';
        dotColor = '#f59e0b';
        icon = '✋';
        break;
      case 'FAILED':
        label = 'Failed';
        bg = 'rgba(244, 63, 94, 0.12)';
        color = '#fb7185';
        border = 'rgba(244, 63, 94, 0.3)';
        dotColor = '#f43f5e';
        break;
      case 'QUEUED':
        label = 'Queued';
        bg = 'rgba(148, 163, 184, 0.1)';
        color = '#94a3b8';
        border = 'rgba(148, 163, 184, 0.25)';
        dotColor = '#94a3b8';
        break;
      default:
        label = valUpper;
        break;
    }
  } else if (type === 'routing') {
    switch (valUpper) {
      case 'POST_GITHUB':
      case 'POST_REVIEW_GITHUB':
        label = 'Auto-Posted to GitHub';
        bg = 'rgba(16, 185, 129, 0.12)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.3)';
        icon = '✓';
        break;
      case 'REQUIRE_HUMAN_APPROVAL':
      case 'HUMAN_APPROVAL_QUEUE':
        label = 'Action Required (HITL)';
        bg = 'rgba(245, 158, 11, 0.15)';
        color = '#fbbf24';
        border = 'rgba(245, 158, 11, 0.4)';
        icon = '✋';
        break;
      case 'DISMISSED':
        label = 'Dismissed';
        bg = 'rgba(100, 116, 139, 0.12)';
        color = '#94a3b8';
        border = 'rgba(100, 116, 139, 0.25)';
        break;
      default:
        label = valUpper;
        break;
    }
  } else if (type === 'severity') {
    switch (valUpper) {
      case 'CRITICAL':
        label = 'Critical';
        bg = 'rgba(244, 63, 94, 0.15)';
        color = '#fb7185';
        border = 'rgba(244, 63, 94, 0.4)';
        dotColor = '#f43f5e';
        break;
      case 'HIGH':
        label = 'High';
        bg = 'rgba(249, 115, 22, 0.14)';
        color = '#fb923c';
        border = 'rgba(249, 115, 22, 0.35)';
        dotColor = '#f97316';
        break;
      case 'MEDIUM':
        label = 'Medium';
        bg = 'rgba(234, 179, 8, 0.12)';
        color = '#fde047';
        border = 'rgba(234, 179, 8, 0.3)';
        dotColor = '#eab308';
        break;
      case 'LOW':
        label = 'Low';
        bg = 'rgba(59, 130, 246, 0.12)';
        color = '#60a5fa';
        border = 'rgba(59, 130, 246, 0.25)';
        dotColor = '#3b82f6';
        break;
      case 'INFO':
        label = 'Info';
        bg = 'rgba(100, 116, 139, 0.12)';
        color = '#94a3b8';
        border = 'rgba(100, 116, 139, 0.25)';
        dotColor = '#64748b';
        break;
      default:
        label = valUpper;
        break;
    }
  } else if (type === 'specialist') {
    switch (valUpper) {
      case 'SECURITY':
        label = 'Security';
        bg = 'rgba(244, 63, 94, 0.12)';
        color = '#fb7185';
        border = 'rgba(244, 63, 94, 0.3)';
        icon = '🛡️';
        break;
      case 'QUALITY':
        label = 'Code Quality';
        bg = 'rgba(168, 85, 247, 0.12)';
        color = '#c084fc';
        border = 'rgba(168, 85, 247, 0.3)';
        icon = '💎';
        break;
      case 'TESTS':
        label = 'Test Coverage';
        bg = 'rgba(14, 165, 233, 0.12)';
        color = '#38bdf8';
        border = 'rgba(14, 165, 233, 0.3)';
        icon = '🧪';
        break;
      case 'DOCS':
        label = 'Documentation';
        bg = 'rgba(16, 185, 129, 0.12)';
        color = '#34d399';
        border = 'rgba(16, 185, 129, 0.3)';
        icon = '📚';
        break;
      case 'CRITIC':
        label = 'Critic Verifier';
        bg = 'rgba(236, 72, 153, 0.12)';
        color = '#f472b6';
        border = 'rgba(236, 72, 153, 0.3)';
        icon = '🔍';
        break;
      default:
        label = valUpper;
        break;
    }
  } else if (type === 'visibility') {
    label = valUpper === 'TRUE' || valUpper === 'PRIVATE' ? 'Private' : 'Public';
    bg = 'rgba(100, 116, 139, 0.08)';
    color = '#94a3b8';
    border = 'rgba(100, 116, 139, 0.2)';
    icon = valUpper === 'TRUE' || valUpper === 'PRIVATE' ? '🔒' : '🌐';
  }

  const fontSize = size === 'sm' ? '11px' : size === 'md' ? '12px' : '13px';
  const padding = size === 'sm' ? '2px 7px' : size === 'md' ? '3px 10px' : '5px 12px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize,
        padding,
        borderRadius: '5px',
        backgroundColor: bg,
        color,
        border: `1px solid ${border}`,
        fontWeight: 600,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
      }}
    >
      {dotColor && (
        <span
          style={{
            width: size === 'sm' ? '5px' : '6px',
            height: size === 'sm' ? '5px' : '6px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            display: 'inline-block',
          }}
        />
      )}
      {icon && <span style={{ fontSize: size === 'sm' ? '10px' : '11px', lineHeight: 1 }}>{icon}</span>}
      {label}
    </span>
  );
}
