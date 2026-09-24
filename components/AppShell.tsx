'use client';

import React from 'react';
import { useAuth } from './AuthContext';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, authenticated, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--bg)',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #a855f7 0%, #38bdf8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '20px',
            animation: 'pulse 1.5s infinite',
          }}
        >
          P
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text)', opacity: 0.7 }}>
          Initializing PRism...
        </div>
      </div>
    );
  }

  // If not authenticated, render landing page or unauthenticated state
  if (!authenticated || !user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '640px', width: '100%' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #a855f7 0%, #38bdf8 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '28px',
              marginBottom: '24px',
              boxShadow: '0 0 32px rgba(168, 85, 247, 0.4)',
            }}
          >
            P
          </div>

          <h1
            style={{
              margin: '0 0 12px',
              fontSize: '36px',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--text-h)',
            }}
          >
            PRism
          </h1>

          <div
            style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: '20px',
              backgroundColor: 'rgba(168, 85, 247, 0.12)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              color: '#c084fc',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              marginBottom: '16px',
            }}
          >
            AGENTIC CODE INTELLIGENCE
          </div>

          <p
            style={{
              fontSize: '16px',
              lineHeight: 1.6,
              color: 'var(--text)',
              margin: '0 0 32px',
            }}
          >
            Autonomous multi-agent code reviews, precision critic verification, and semantic codebase knowledge retrieval for modern engineering teams.
          </p>

          <a
            href="/api/auth/github"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '12px 28px',
              borderRadius: '8px',
              backgroundColor: '#24292f',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1f2428';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#24292f';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>Login with GitHub</span>
          </a>

          {/* Feature Highlights Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              marginTop: '56px',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '18px', marginBottom: '8px' }}>🤖</div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-h)', marginBottom: '4px' }}>
                Specialist Swarm
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text)', opacity: 0.8, lineHeight: 1.4 }}>
                Parallel security, quality, test coverage, and docs analysis agents.
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '18px', marginBottom: '8px' }}>🔍</div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-h)', marginBottom: '4px' }}>
                Critic Verification
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text)', opacity: 0.8, lineHeight: 1.4 }}>
                Evidence-grounded verification eliminating hallucinations before publishing.
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '18px', marginBottom: '8px' }}>🛡️</div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-h)', marginBottom: '4px' }}>
                Confidence & Gate
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text)', opacity: 0.8, lineHeight: 1.4 }}>
                Auto-posts high-confidence reviews; routes critical findings to human review.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Dashboard Layout
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
