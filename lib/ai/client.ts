import { PREventPayload, ReviewResponse } from '@/lib/types';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Checks connectivity to the FastAPI AI service root endpoint.
 */
export async function checkAiHealth(): Promise<{ message: string }> {
  const response = await fetch(`${AI_SERVICE_URL}/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`AI service health check returned status ${response.status}`);
  }

  return response.json();
}

/**
 * Sends a raw text prompt test to the FastAPI AI service.
 */
export async function testLLM(prompt: string): Promise<{ response: string }> {
  const response = await fetch(`${AI_SERVICE_URL}/api/ai/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Tests structured code review output generation via FastAPI and OpenRouter.
 */
export async function testStructured(code?: string): Promise<ReviewResponse> {
  const response = await fetch(`${AI_SERVICE_URL}/api/ai/test-structured`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code || null }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Forwards normalized GitHub Pull Request event data to the FastAPI AI service.
 */
export async function forwardPREvent(eventData: PREventPayload): Promise<any> {
  const response = await fetch(`${AI_SERVICE_URL}/api/github/pr-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventData),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Forwards GitHub push event data to the FastAPI AI service to mark RAG index STALE.
 */
export async function forwardPushEvent(repoName: string, headCommit?: string, ref?: string): Promise<any> {
  const response = await fetch(`${AI_SERVICE_URL}/api/rag/push-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_name: repoName,
      head_commit: headCommit || null,
      ref: ref || null,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Initiates RAG repository indexing in background.
 */
export async function indexRepository(repoName: string, githubToken?: string, forceFull: boolean = false): Promise<any> {
  const response = await fetch(`${AI_SERVICE_URL}/api/rag/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_name: repoName,
      github_token: githubToken || null,
      force_full: forceFull,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Gets repository RAG index status.
 */
export async function getRepositoryRagStatus(repoName: string): Promise<any> {
  const response = await fetch(`${AI_SERVICE_URL}/api/rag/status?repo_name=${encodeURIComponent(repoName)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Lists all tracked repositories and their index status.
 */
export async function listRepositories(): Promise<any[]> {
  const response = await fetch(`${AI_SERVICE_URL}/api/rag/repositories`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Deletes a repository and its vector chunks from the database.
 */
export async function deleteRepository(repoName: string): Promise<any> {
  const response = await fetch(`${AI_SERVICE_URL}/api/rag/repository?repo_name=${encodeURIComponent(repoName)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

/**
 * Performs repository Q&A using RAG.
 */
export async function queryRepository(repoName: string, query: string, topK: number = 5): Promise<any> {
  const response = await fetch(`${AI_SERVICE_URL}/api/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_name: repoName,
      query,
      top_k: topK,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.error || `AI service returned status ${response.status}`
    );
  }

  return response.json();
}

