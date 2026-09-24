import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FindingData } from '@/components/FindingCard';
import { TimelineEvent } from '@/components/Timeline';

export interface ReviewSummaryItem {
  id: string;
  repoName: string;
  prNumber: number;
  commitSha: string;
  status: string;
  routingDecision: string | null;
  findingsCount: number;
  eventsCount?: number;
  durationMs: number | null;
  totalCostUsd?: number;
  createdAt: string;
}

export interface ReviewsListResponse {
  reviews: ReviewSummaryItem[];
  total?: number;
}

export interface ReviewDetailData {
  id: string;
  repositoryId?: string | null;
  repoName: string;
  repository?: {
    id: string;
    fullName: string;
    owner: string;
    name: string;
  } | null;
  prNumber: number;
  commitSha: string;
  baseSha: string;
  status: string;
  routingDecision: string | null;
  totalTokensIn?: number;
  totalTokensOut?: number;
  totalCostUsd?: number;
  durationMs?: number | null;
  errorMessage?: string | null;
  findings: FindingData[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewDetailResponse {
  review: ReviewDetailData;
}

export interface ReviewEventsResponse {
  events: TimelineEvent[];
}

// 1. Hook for Reviews List with smart polling
export function useReviewsList(params?: { status?: string; limit?: number }) {
  const status = params?.status || 'ALL';
  const limit = params?.limit || 50;

  return useQuery<ReviewsListResponse>({
    queryKey: ['reviews', 'list', { status, limit }],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (status !== 'ALL') queryParams.set('status', status);
      if (limit) queryParams.set('limit', String(limit));

      const res = await fetch(`/api/reviews?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch reviews');
      }
      return res.json();
    },
    staleTime: 1000 * 15, // 15s
    refetchInterval: (query) => {
      const data = query.state.data;
      const isAnyActive = data?.reviews?.some((r) => r.status === 'IN_PROGRESS' || r.status === 'QUEUED');
      return isAnyActive ? 3500 : false;
    },
  });
}

// 2. Hook for Single Review Details & Events
export function useReviewDetail(id: string) {
  const query = useQuery<{ review: ReviewDetailData; events: TimelineEvent[] }>({
    queryKey: ['review', id],
    queryFn: async () => {
      const [revRes, evRes] = await Promise.all([
        fetch(`/api/reviews/${id}`),
        fetch(`/api/reviews/${id}/events`),
      ]);

      if (!revRes.ok) {
        const err = await revRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch review');
      }

      const revData = await revRes.json();
      let events: TimelineEvent[] = [];
      if (evRes.ok) {
        const evData = await evRes.json();
        events = evData.events || [];
      }

      return {
        review: revData.review,
        events,
      };
    },
    enabled: !!id,
    staleTime: 1000 * 10,
    refetchInterval: (q) => {
      const status = q.state.data?.review?.status;
      return status === 'IN_PROGRESS' || status === 'QUEUED' ? 3000 : false;
    },
  });

  return query;
}

// 3. Mutation to Approve a Review (HITL)
export function useApproveReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reviewId }: { reviewId: string }) => {
      const res = await fetch(`/api/reviews/${reviewId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_decision: 'POST_GITHUB' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to approve review');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review', variables.reviewId] });
    },
  });
}
