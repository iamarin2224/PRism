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
        padding: '18px 22px',
        borderRadius: '8px',
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.07) 0%, rgba(56, 189, 248, 0.05) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.28)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '15px' }}>⚡</span>
          <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: 'var(--text-h)' }}>
            Connect GitHub App
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.45, color: 'var(--text)' }}>
          Install the PRism GitHub App to enable automated PR reviews, vector indexing, and webhook event streaming across your repositories.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="prism-btn prism-btn-ghost prism-btn-sm"
          >
            Dismiss
          </button>
        )}
        <button
          onClick={handleConnect}
          disabled={loading}
          className="prism-btn prism-btn-primary"
          style={{ padding: '8px 16px' }}
        >
          <span>{loading ? 'Opening GitHub...' : 'Connect GitHub App'}</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
