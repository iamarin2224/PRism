'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  content: string;
}

function CodeBlock({ children, className, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const isInline = !match && !props.node?.properties?.className;

  if (isInline && !String(children).includes('\n')) {
    return (
      <code
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          color: '#e2e8f0',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'var(--mono)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
        {...props}
      >
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        margin: '12px 0',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--code-bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid var(--border)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--mono)',
        }}
      >
        <span>{language ? language.toUpperCase() : 'CODE'}</span>
        <button
          onClick={handleCopy}
          style={{
            background: 'none',
            border: 'none',
            color: copied ? '#34d399' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'all 0.15s ease',
          }}
          title="Copy code to clipboard"
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '12px 14px',
          overflowX: 'auto',
          fontSize: '12.5px',
          lineHeight: 1.6,
          fontFamily: 'var(--mono)',
          color: '#e2e8f0',
        }}
      >
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="prism-markdown-content" style={{ fontSize: '13.5px', lineHeight: 1.65, color: '#f1f5f9' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          p: ({ children }) => <p style={{ margin: '0 0 10px' }}>{children}</p>,
          h1: ({ children }) => (
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: '16px 0 8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: '14px 0 6px' }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff', margin: '12px 0 4px' }}>
              {children}
            </h3>
          ),
          ul: ({ children }) => <ul style={{ margin: '6px 0 10px 20px', padding: 0 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '6px 0 10px 20px', padding: 0 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: '4px' }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: '10px 0',
                padding: '8px 14px',
                borderLeft: '3px solid var(--accent)',
                backgroundColor: 'rgba(168, 85, 247, 0.08)',
                borderRadius: '0 6px 6px 0',
                color: '#d1d5db',
                fontStyle: 'italic',
              }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '12px 0' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '1px solid var(--border)',
                  fontSize: '12.5px',
                }}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>{children}</thead>,
          th: ({ children }) => (
            <th
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border)',
                fontWeight: 600,
                textAlign: 'left',
                color: '#ffffff',
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border)',
                color: '#cbd5e1',
              }}
            >
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--accent-cyan)',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              {children}
            </a>
          ),
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
