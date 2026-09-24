import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthContext';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'PRism — Agentic Code Intelligence',
  description: 'Autonomous multi-agent pull request review system and codebase knowledge engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
