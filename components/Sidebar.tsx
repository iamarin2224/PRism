'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';

export function Sidebar() {
  const pathname = usePathname();
  const { user, authenticated, hasInstallation, logout } = useAuth();
  const [connecting, setConnecting] = useState(false);

  const handleConnectGitHub = async () => {
    try {
      setConnecting(true);
      const res = await fetch('/api/github/connect-url');
      if (res.ok) {
        const data = await res.json();
        if (data.connectUrl) {
          window.location.href = data.connectUrl;
          return;
        }
      }
      // Fallback
      window.location.href = '/api/github/connect-url';
    } catch (err) {
      console.error('Failed to get connect URL:', err);
    } finally {
      setConnecting(false);
    }
  };

  const navItems = [
    { label: 'Overview', href: '/', icon: '◫' },
    { label: 'Repositories', href: '/repositories', icon: '⑂' },
    { label: 'Reviews', href: '/reviews', icon: '✓' },
    { label: 'Code Q&A', href: '/qa', icon: '💬' },
  ];

  return (
    <aside
      style={{
        width: '260px',
        minWidth: '260px',
        height: '100vh',
        position: 'sticky',
        top: 0,
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        zIndex: 40,
        userSelect: 'none',
      }}
    >
      {/* Top Branding & Nav */}
      <div>
        {/* Brand Header */}
        <div
          style={{
            padding: '20px 20px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #a855f7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '16px',
              boxShadow: '0 0 16px rgba(168, 85, 247, 0.4)',
            }}
          >
            P
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '17px',
                  color: 'var(--text-h)',
                  letterSpacing: '-0.02em',
                }}
              >
                PRism
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '2px 5px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(168, 85, 247, 0.15)',
                  color: '#c084fc',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  letterSpacing: '0.04em',
                }}
              >
                AGENTIC
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text)', opacity: 0.7 }}>
              Code Intelligence
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#ffffff' : 'var(--text)',
                  backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
                  border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <span
                  style={{
                    fontSize: '15px',
                    color: isActive ? 'var(--accent)' : 'var(--text)',
                    width: '18px',
                    textAlign: 'center',
                  }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Area: GitHub App Connection & User Profile */}
      <div style={{ padding: '16px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Connection status badge / action */}
        {authenticated && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: hasInstallation ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              border: `1px solid ${hasInstallation ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasInstallation ? '0' : '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: hasInstallation ? '#34d399' : '#fbbf24',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600, color: hasInstallation ? '#34d399' : '#fbbf24' }}>
                  {hasInstallation ? 'GitHub App Connected' : 'GitHub App Missing'}
                </span>
              </div>
            </div>

            {!hasInstallation && (
              <button
                onClick={handleConnectGitHub}
                disabled={connecting}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
              >
                {connecting ? 'Connecting...' : 'Connect GitHub App'}
              </button>
            )}
          </div>
        )}

        {/* User Card */}
        {authenticated && user ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.githubUsername}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: 'var(--text-h)',
                  }}
                >
                  {user.githubUsername.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div style={{ overflow: 'hidden' }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '13px',
                    color: 'var(--text-h)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={user.githubUsername}
                >
                  {user.githubUsername}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text)', opacity: 0.6 }}>
                  PRism Operator
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text)',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/github"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-h)',
              textDecoration: 'none',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span>Login with GitHub</span>
          </a>
        )}
      </div>
    </aside>
  );
}
