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
