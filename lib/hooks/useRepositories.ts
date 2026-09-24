import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface RepoSummary {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch?: string;
  isPrivate: boolean;
  isTracked: boolean;
  indexStatus: 'NOT_INDEXED' | 'INDEXING' | 'INDEXED' | 'STALE' | 'FAILED';
  indexedCommit?: string | null;
  currentCommit?: string | null;
  lastIndexedAt?: string | null;
  errorMessage?: string | null;
  totalReviewRuns?: number;
  installationId?: string | null;
}

export interface TrackedReposResponse {
  repositories: RepoSummary[];
}

export interface AvailableReposResponse {
  repositories: RepoSummary[];
  hasInstallations?: boolean;
  message?: string;
}

export interface RepoDetailResponse {
  repository: RepoSummary;
  reviews: any[];
}

// 1. Hook for Tracked Repositories with smart polling when indexing
export function useTrackedRepositories() {
  return useQuery<TrackedReposResponse>({
    queryKey: ['repositories', 'tracked'],
    queryFn: async () => {
      const res = await fetch('/api/repositories/tracked');
      if (!res.ok) {
        throw new Error('Failed to fetch tracked repositories');
      }
      return res.json();
    },
    staleTime: 1000 * 20, // 20s
    refetchInterval: (query) => {
      const data = query.state.data;
      const isAnyIndexing = data?.repositories?.some((r) => r.indexStatus === 'INDEXING');
      return isAnyIndexing ? 4000 : false;
    },
  });
}

// 2. Hook for Available Repositories
export function useAvailableRepositories() {
  return useQuery<AvailableReposResponse>({
    queryKey: ['repositories', 'available'],
    queryFn: async () => {
      const res = await fetch('/api/repositories/available');
      if (!res.ok) {
        throw new Error('Failed to fetch available repositories');
      }
      return res.json();
    },
    staleTime: 1000 * 30,
  });
}

// 3. Hook for Single Repository Details with auto-polling
export function useRepositoryDetail(id: string) {
  return useQuery<RepoDetailResponse>({
    queryKey: ['repository', id],
    queryFn: async () => {
      const res = await fetch(`/api/repositories/${encodeURIComponent(id)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch repository details');
      }
      return res.json();
    },
    enabled: !!id,
    staleTime: 1000 * 15,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.repository?.indexStatus === 'INDEXING' ? 4000 : false;
    },
  });
}

// 4. Mutation to Track a Repository
export function useTrackRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ repoId, repoName }: { repoId: string; repoName: string }) => {
      const res = await fetch('/api/repositories/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, repo_name: repoName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to track repository');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories', 'tracked'] });
      queryClient.invalidateQueries({ queryKey: ['repositories', 'available'] });
      queryClient.invalidateQueries({ queryKey: ['repositories', 'unified'] });
    },
  });
}

// 5. Mutation to Untrack a Repository
export function useUntrackRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repoId: string) => {
      const res = await fetch(`/api/repositories/track?repo_id=${encodeURIComponent(repoId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to untrack repository');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories', 'tracked'] });
      queryClient.invalidateQueries({ queryKey: ['repositories', 'available'] });
      queryClient.invalidateQueries({ queryKey: ['repositories', 'unified'] });
    },
  });
}

// 6. Mutation to Reindex a Repository
export function useReindexRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repoId: string) => {
      const res = await fetch('/api/repositories/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to trigger reindexing');
      }
      return res.json();
    },
    onSuccess: (_, repoId) => {
      queryClient.invalidateQueries({ queryKey: ['repository', repoId] });
      queryClient.invalidateQueries({ queryKey: ['repositories', 'tracked'] });
      queryClient.invalidateQueries({ queryKey: ['repositories', 'unified'] });
    },
  });
}
