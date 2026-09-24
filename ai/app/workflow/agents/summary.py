import json
import logging
import time
from typing import Any, Dict, List, Optional
from app.services.model_router import model_router
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.agents.summary")

SUMMARY_SYSTEM_PROMPT = """
You are the Lead PR Architect on PRism.
Your task is to analyze the Pull Request metadata and file diffs to produce a clear, high-level summary of what this PR does, what features or fixes it adds, and a concise breakdown of changes by file.

Output your analysis strictly as a JSON object adhering to this schema:
{
  "overview": "Clear 2-3 sentence executive overview of what this PR accomplishes and why.",
  "key_changes": [
    "Primary change point 1",
    "Primary change point 2"
  ],
  "file_changes": [
    {
      "file_path": "path/to/file.ext",
      "action": "added" | "modified" | "deleted",
      "summary": "Specific purpose of changes in this file"
    }
  ],
  "architectural_impact": "Brief note on architecture, dependencies, state management, or API contracts affected.",
  "risk_assessment": "Low | Medium | High — Brief rationale"
}
Respond strictly with valid JSON inside a ```json ... ``` block or raw JSON.
"""


class SummaryAgent:
    """
    Dedicated PR Summary Agent (Mid Tier Model):
    Synthesizes the overall intent, feature scope, and file-by-file changes of the PR.
    Operates alongside specialist auditors so developers understand what the PR is about
    as well as any quality/security findings.
    """

    async def _call_summary_api(
        self,
        client: Any,
        model_id: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        response = await client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT.strip()},
                {"role": "user", "content": user_prompt.strip()},
            ],
            temperature=0.2,
        )
        choice = response.choices[0] if response.choices else None
        raw = choice.message.content if choice and choice.message else ""
        tokens_in = response.usage.prompt_tokens if response.usage else 0
        tokens_out = response.usage.completion_tokens if response.usage else 0
        parsed = self._parse_summary(raw or "")
        parsed["_tokens_in"] = tokens_in
        parsed["_tokens_out"] = tokens_out
        return parsed

    async def generate_pr_summary(self, state: ReviewState) -> Dict[str, Any]:
        """
        Generates structured PR Summary using Mid-tier model with fallback resilience.
        """
        start_time = time.perf_counter()
        logger.info(f"[{state['review_run_id']}] Generating dedicated PR summary...")

        pr_meta = state.get("pr_metadata") or {}
        pr_title = pr_meta.get("title", f"PR #{state.get('pr_number')}")
        pr_body = pr_meta.get("body", "No description provided.")
        repo_name = state.get("repo_name", "")
        pr_num = state.get("pr_number", 0)

        diff_summary = state.get("diff_summary") or {}
        files_content: Dict[str, Any] = diff_summary.get("files_content", {})

        # Build concise diff snippets for summary prompt
        diff_text_blocks = []
        for p, c in list(files_content.items())[:15]:
            snippet = str(c)[:1500] if isinstance(c, str) else ""
            diff_text_blocks.append(f"File: {p}\n{snippet}\n")
        diff_text = "\n".join(diff_text_blocks) if diff_text_blocks else "No diff content available."

        user_prompt = f"""
## TARGET PULL REQUEST:
Repository: {repo_name}
PR #{pr_num}: {pr_title}
Description:
{pr_body}

## MODIFIED FILES & DIFFS:
{diff_text}

Provide the structured JSON summary of the PR and modified files.
"""

        summary_data: Dict[str, Any] = {}
        tokens_in = 0
        tokens_out = 0

        try:
            client, model_id = model_router.get_async_client("summary")
            summary_data = await self._call_summary_api(client, model_id, user_prompt)
            tokens_in = summary_data.pop("_tokens_in", 0)
            tokens_out = summary_data.pop("_tokens_out", 0)

        except Exception as e:
            if model_router.is_credit_exhaustion_error(e):
                logger.warning(
                    f"[{state['review_run_id']}] Summary agent encountered credit exhaustion: {e}. "
                    f"Retrying with OpenRouter free fallback..."
                )
                model_router.mark_aicredits_exhausted(str(e))
                try:
                    fallback_client, fallback_model = model_router.get_async_client("summary", force_fallback=True)
                    summary_data = await self._call_summary_api(fallback_client, fallback_model, user_prompt)
                    tokens_in = summary_data.pop("_tokens_in", 0)
                    tokens_out = summary_data.pop("_tokens_out", 0)
                except Exception as fb_err:
                    logger.warning(f"[{state['review_run_id']}] Summary agent fallback failed: {fb_err}")
            else:
                logger.warning(f"[{state['review_run_id']}] Summary generation error: {e}")

        # Deterministic fallback if model call failed or returned empty
        if not summary_data or not summary_data.get("overview"):
            file_changes = []
            for fpath in list(files_content.keys())[:20]:
                file_changes.append({
                    "file_path": fpath,
                    "action": "modified",
                    "summary": f"Changes applied to {fpath}",
                })

            summary_data = {
                "overview": f"Pull Request '{pr_title}' applies modifications across {len(files_content)} file(s) in repository `{repo_name}`.",
                "key_changes": [f"Updated {f}" for f in list(files_content.keys())[:5]],
                "file_changes": file_changes,
                "architectural_impact": "Direct changeset modifications.",
                "risk_assessment": "Standard review scope.",
            }

        duration_ms = (time.perf_counter() - start_time) * 1000
        summary_data["_tokens_in"] = tokens_in
        summary_data["_tokens_out"] = tokens_out
        summary_data["_duration_ms"] = duration_ms

        logger.info(f"[{state['review_run_id']}] PR summary generated in {duration_ms:.2f}ms")
        return summary_data

    @staticmethod
    def _parse_summary(raw_content: str) -> Dict[str, Any]:
        cleaned = raw_content.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[len("```json"):].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        try:
            data = json.loads(cleaned)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}


# Global summary agent instance
summary_agent = SummaryAgent()
