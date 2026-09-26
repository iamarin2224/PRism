'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';

export function Sidebar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
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
      window.location.href = '/api/github/connect-url';
    } catch (err) {
      console.error('Failed to get connect URL:', err);
    } finally {
      setConnecting(false);
    }
  };

  const handlePrefetch = (href: string) => {
    if (href === '/') {
      queryClient.prefetchQuery({
        queryKey: ['repositories', 'tracked'],
        queryFn: () => fetch('/api/repositories/tracked').then((r) => r.json()),
        staleTime: 1000 * 20,
      });
      queryClient.prefetchQuery({
        queryKey: ['reviews', 'list', { status: 'ALL', limit: 10 }],
        queryFn: () => fetch('/api/reviews?limit=10').then((r) => r.json()),
        staleTime: 1000 * 15,
      });
    } else if (href === '/repositories') {
      queryClient.prefetchQuery({
        queryKey: ['repositories', 'tracked'],
        queryFn: () => fetch('/api/repositories/tracked').then((r) => r.json()),
        staleTime: 1000 * 20,
      });
      queryClient.prefetchQuery({
        queryKey: ['repositories', 'available'],
        queryFn: () => fetch('/api/repositories/available').then((r) => r.json()),
        staleTime: 1000 * 30,
      });
    } else if (href === '/reviews') {
      queryClient.prefetchQuery({
        queryKey: ['reviews', 'list', { status: 'ALL', limit: 50 }],
        queryFn: () => fetch('/api/reviews?limit=50').then((r) => r.json()),
        staleTime: 1000 * 15,
      });
    } else if (href === '/qa') {
      queryClient.prefetchQuery({
        queryKey: ['repositories', 'unified'],
        queryFn: () => fetch('/api/repositories/unified').then((r) => r.json()),
        staleTime: 1000 * 20,
      });
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
        width: '250px',
        minWidth: '250px',
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
            height: '64px',
            minHeight: '64px',
            maxHeight: '64px',
            boxSizing: 'border-box',
            padding: '0 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '11px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.18) 0%, rgba(99, 65, 202, 0.28) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 0 14px rgba(168, 85, 247, 0.25)',
            }}
          >
            <Image
              src="/PRism.svg"
              alt="PRism Logo"
              width={32}
              height={32}
              style={{
                objectFit: 'contain',
                filter: 'brightness(1.3) contrast(1.1) drop-shadow(0 0 6px rgba(192, 132, 252, 0.4))',
              }}
              priority
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '16px',
                  color: 'var(--text-h)',
                  letterSpacing: '-0.02em',
                }}
              >
                PRism
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Agentic Code Intelligence
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav style={{ padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-dim)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '4px 8px 6px',
            }}
          >
            Platform
          </div>
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => handlePrefetch(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#ffffff' : 'var(--text)',
                  backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                  border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
                  textDecoration: 'none',
                  transition: 'all 0.12s ease',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    color: isActive ? 'var(--accent-hover)' : 'var(--text-muted)',
                    width: '18px',
                    textAlign: 'center',
                    lineHeight: 1,
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
      <div style={{ padding: '14px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Connection status badge / action */}
        {authenticated && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              backgroundColor: hasInstallation ? 'rgba(16, 185, 129, 0.06)' : 'rgba(245, 158, 11, 0.08)',
              border: `1px solid ${hasInstallation ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.25)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasInstallation ? '0' : '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: hasInstallation ? '#10b981' : '#f59e0b',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '11px', fontWeight: 600, color: hasInstallation ? '#34d399' : '#fbbf24' }}>
                  {hasInstallation ? 'GitHub App Active' : 'GitHub App Missing'}
                </span>
              </div>
            </div>

            {!hasInstallation && (
              <button
                onClick={handleConnectGitHub}
                disabled={connecting}
                className="prism-btn prism-btn-primary prism-btn-sm"
                style={{ width: '100%', marginTop: '4px' }}
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
              padding: '4px 2px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.githubUsername}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '12px',
                    color: 'var(--text-h)',
                    flexShrink: 0,
                  }}
                >
                  {user.githubUsername.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div style={{ overflow: 'hidden' }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '12.5px',
                    color: 'var(--text-h)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={user.githubUsername}
                >
                  {user.githubUsername}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  Developer
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="prism-btn prism-btn-ghost prism-btn-sm"
              style={{ fontSize: '11px', padding: '3px 6px', color: 'var(--text-muted)' }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/github"
            className="prism-btn prism-btn-secondary prism-btn-sm"
            style={{ width: '100%', textAlign: 'center' }}
          >
            Login with GitHub
          </a>
        )}
      </div>
    </aside>
  );
}
