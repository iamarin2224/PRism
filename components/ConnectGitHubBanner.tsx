'use client';

import React, { useState } from 'react';

interface ConnectGitHubBannerProps {
  onDismiss?: () => void;
}

export function ConnectGitHubBanner({ onDismiss }: ConnectGitHubBannerProps) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/github/connect-url');
      if (res.ok) {
        const data = await res.json();
        if (data.connectUrl) {
          window.location.href = data.connectUrl;
          return;
        }
      }
      window.location.href = '/api/github/connect-url';
    } catch (err) {
      console.error('Failed to get GitHub App install URL:', err);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: '24px',
        borderRadius: '10px',
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(56, 189, 248, 0.08) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.35)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '24px',
        marginBottom: '24px',
      }}
    >
      <div style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '18px' }}>⚡</span>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--text-h)' }}>
            Connect GitHub
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--text)', opacity: 0.9 }}>
          Connect your GitHub account or organization to allow PRism to discover repositories you can track, index, and autonomously review upon pull request events.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        )}
        <button
          onClick={handleConnect}
          disabled={loading}
          style={{
            padding: '9px 18px',
            borderRadius: '6px',
            backgroundColor: 'var(--accent)',
            color: '#ffffff',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 10px rgba(168, 85, 247, 0.35)',
            transition: 'all 0.15s ease',
          }}
        >
          <span>{loading ? 'Opening GitHub...' : 'Connect GitHub App'}</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
