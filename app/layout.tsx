import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PRism — Agentic Pull Request Review System',
  description: 'Intelligent multi-stage agentic pull request review system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="main-container">{children}</div>
      </body>
    </html>
  );
}
