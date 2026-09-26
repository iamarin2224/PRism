'use client';

import React from 'react';
import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, breadcrumbs, actions }: HeaderProps) {
  const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;

  return (
    <header
      style={{
        height: '64px',
        minHeight: '64px',
        maxHeight: '64px',
        boxSizing: 'border-box',
        padding: '0 28px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
        {hasBreadcrumbs && (
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              lineHeight: 1.2,
              marginBottom: '2px',
            }}
          >
            {breadcrumbs.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>/</span>}
                {item.href ? (
                  <Link
                    href={item.href}
                    style={{
                      color: 'var(--text-muted)',
                      textDecoration: 'none',
                      transition: 'color 0.12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-h)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--text-h)', fontWeight: 500 }}>{item.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
          <h1
            style={{
              margin: 0,
              fontSize: hasBreadcrumbs ? '16px' : '17px',
              fontWeight: 700,
              color: 'var(--text-h)',
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.2,
              }}
            >
              • {subtitle}
            </span>
          )}
        </div>
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </header>
  );
}
