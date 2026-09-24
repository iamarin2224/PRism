'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ExploreRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/qa');
  }, [router]);

  return (
    <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>
      Redirecting to unified Code Q&A & Explore...
    </div>
  );
}
