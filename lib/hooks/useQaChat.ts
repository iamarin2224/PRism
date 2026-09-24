import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface RepositoryItem {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  isPrivate: boolean;
  isTracked: boolean;
  indexStatus: 'NOT_INDEXED' | 'INDEXING' | 'INDEXED' | 'STALE' | 'FAILED';
  indexedCommit?: string | null;
  currentCommit?: string | null;
  lastIndexedAt?: string | null;
  errorMessage?: string | null;
  totalReviewRuns?: number;
  conversationCount?: number;
  type: 'my_repo' | 'explored';
}

export interface UnifiedRepositoriesData {
  myRepos: RepositoryItem[];
  exploredRepos: RepositoryItem[];
}

export interface ConversationSummary {
  id: string;
  repoName: string;
  repositoryId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: {
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    content: string;
    createdAt: string;
  } | null;
}

export interface QASource {
  file_path: string;
  start_line: number;
  end_line: number;
  similarity_score?: number;
  content?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  sources?: QASource[] | null;
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  userId: string;
  repoName: string;
  repositoryId?: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  repository?: {
    id: string;
    fullName: string;
    indexStatus: 'NOT_INDEXED' | 'INDEXING' | 'INDEXED' | 'STALE' | 'FAILED';
    lastIndexedAt?: string | null;
  } | null;
}

// 1. Unified Repositories Query
export function useUnifiedRepositories() {
  return useQuery<UnifiedRepositoriesData>({
    queryKey: ['repositories', 'unified'],
    queryFn: async () => {
      const res = await fetch('/api/repositories/unified');
      if (!res.ok) {
        throw new Error('Failed to fetch repositories');
      }
      return res.json();
    },
    staleTime: 1000 * 20, // 20s
  });
}

// 2. Conversations for a Repository Query
export function useConversations(repoName?: string | null) {
  return useQuery<ConversationSummary[]>({
    queryKey: ['conversations', repoName || 'all'],
    queryFn: async () => {
      if (!repoName) return [];
      const res = await fetch(`/api/conversations?repo_name=${encodeURIComponent(repoName)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch conversations');
      }
      const data = await res.json();
      return data.conversations || [];
    },
    enabled: !!repoName,
    staleTime: 1000 * 15,
  });
}

// 3. Single Conversation Messages Query
export function useConversation(conversationId?: string | null) {
  return useQuery<ConversationDetail>({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) throw new Error('No conversation ID');
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch conversation messages');
      }
      const data = await res.json();
      return data.conversation;
    },
    enabled: !!conversationId,
    staleTime: 1000 * 10,
  });
}

// 4. Create Conversation Mutation
export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ repoName, title }: { repoName: string; title?: string }) => {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_name: repoName, title }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create conversation');
      }
      const data = await res.json();
      return data.conversation;
    },
    onSuccess: (newConv, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations', variables.repoName] });
      queryClient.invalidateQueries({ queryKey: ['repositories', 'unified'] });
    },
  });
}

// 5. Send Message Mutation with Optimistic Updates
export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: {
      conversationId: string;
      content: string;
      repoName?: string;
    }) => {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to send message');
      }
      return res.json() as Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>;
    },
    onMutate: async ({ conversationId, content }) => {
      await queryClient.cancelQueries({ queryKey: ['conversation', conversationId] });
      const previousConversation = queryClient.getQueryData<ConversationDetail>(['conversation', conversationId]);

      if (previousConversation) {
        const optimisticUserMessage: ChatMessage = {
          id: `temp-${Date.now()}`,
          conversationId,
          role: 'USER',
          content,
          createdAt: new Date().toISOString(),
        };

        queryClient.setQueryData<ConversationDetail>(['conversation', conversationId], {
          ...previousConversation,
          messages: [...previousConversation.messages, optimisticUserMessage],
        });
      }

      return { previousConversation };
    },
    onError: (err, variables, context) => {
      if (context?.previousConversation) {
        queryClient.setQueryData(['conversation', variables.conversationId], context.previousConversation);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<ConversationDetail>(['conversation', variables.conversationId], (old) => {
        if (!old) return old;
        // Replace temp optimistic message with actual userMessage and assistantMessage
        const filtered = old.messages.filter((m) => !m.id.startsWith('temp-'));
        return {
          ...old,
          messages: [...filtered, data.userMessage, data.assistantMessage],
        };
      });

      if (variables.repoName) {
        queryClient.invalidateQueries({ queryKey: ['conversations', variables.repoName] });
      }
    },
  });
}

// 6. Add/Explore Public Repo Mutation
export function useAddExploredRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repoInput: string) => {
      const res = await fetch('/api/repositories/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_name: repoInput }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to add explored repository');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories', 'unified'] });
    },
  });
}

// 7. Delete Conversation Mutation
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string; repoName?: string }) => {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete conversation');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.removeQueries({ queryKey: ['conversation', variables.conversationId] });
      if (variables.repoName) {
        queryClient.invalidateQueries({ queryKey: ['conversations', variables.repoName] });
      }
    },
  });
}

// 8. Delete Explored Repo Link Mutation
export function useDeleteExploredRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (repoId: string) => {
      const res = await fetch(`/api/repositories/explore?repository_id=${encodeURIComponent(repoId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete explored repository');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories', 'unified'] });
    },
  });
}
