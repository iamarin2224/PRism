import json
import logging
import time
from typing import Any, Dict, List, Optional
from app.models.review import Finding
from app.services.model_router import model_router
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.critic")

CRITIC_SYSTEM_PROMPT = """
You are the Chief Verification and Critic Auditor on PRism.
Your sole mission is to evaluate candidate PR findings and eliminate hallucinations, incorrect line numbers, and false positives.

For each candidate finding, verify:
1. Is the issue genuinely present in the provided PR diff / codebase snippet?
2. Are the reported line numbers accurate according to the diff?
3. Does the suggestion represent a valid, correct, non-breaking fix?

Output your decision strictly as a JSON array corresponding to each finding:
[
  {
    "index": 0,
    "is_valid": true,
    "adjusted_confidence": 0.95,
    "verification_notes": "Verified SQL injection risk in query construction on line 25."
  },
  {
    "index": 1,
    "is_valid": false,
    "adjusted_confidence": 0.20,
    "verification_notes": "False positive: Parameter is already sanitized in outer middleware."
  }
]
"""


class CriticVerifierService:
    """
    Critic / Verifier Node:
    Invokes the High Tier LLM to double-check candidate findings against the raw code context.
    Eliminates hallucinations and falls back gracefully to OpenRouter if credits are exhausted.
    """

    async def _call_critic_api(
        self,
        client: Any,
        model_id: str,
        user_prompt: str,
    ) -> List[Dict[str, Any]]:
        response = await client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": CRITIC_SYSTEM_PROMPT.strip()},
                {"role": "user", "content": user_prompt.strip()},
            ],
            temperature=0.0,
        )
        choice = response.choices[0] if response.choices else None
        raw = choice.message.content if choice and choice.message else ""
        return self._parse_verdicts(raw or "")

    async def verify_findings(
        self,
        findings: List[Finding],
        state: ReviewState,
    ) -> List[Finding]:
        if not findings:
            return []

        logger.info(f"[{state['review_run_id']}] Critic verifying {len(findings)} candidate findings...")

        diff_summary = state.get("diff_summary", {})
        files_content = diff_summary.get("files_content", {})

        diff_text_blocks = [f"File: {p}\n{c}\n" for p, c in files_content.items()]
        diff_text = "\n".join(diff_text_blocks) if diff_text_blocks else "No diff content."

        candidates_payload = [
            {
                "index": i,
                "file_path": f.file_path,
                "start_line": f.start_line,
                "end_line": f.end_line,
                "category": f.category,
                "severity": f.severity,
                "title": f.title,
                "description": f.description,
                "suggestion": f.suggestion,
                "confidence": f.confidence,
            }
            for i, f in enumerate(findings)
        ]

        user_prompt = f"""
## CODE DIFF / CONTEXT:
{diff_text}

## CANDIDATE FINDINGS TO AUDIT:
{json.dumps(candidates_payload, indent=2)}

Audit each finding with adversarial precision. Return the JSON array of verdicts.
"""

        verdicts: List[Dict[str, Any]] = []

        try:
            client, model_id = model_router.get_async_client("critic")
            verdicts = await self._call_critic_api(client, model_id, user_prompt)

        except Exception as e:
            if model_router.is_credit_exhaustion_error(e):
                logger.warning(
                    f"[{state['review_run_id']}] Critic encountered credit exhaustion: {e}. "
                    f"Retrying with OpenRouter free tier fallback..."
                )
                model_router.mark_aicredits_exhausted(str(e))
                try:
                    fallback_client, fallback_model = model_router.get_async_client("critic", force_fallback=True)
                    verdicts = await self._call_critic_api(fallback_client, fallback_model, user_prompt)
                except Exception as fb_err:
                    logger.warning(f"[{state['review_run_id']}] Critic fallback failed: {fb_err}")
            else:
                logger.warning(f"[{state['review_run_id']}] Critic verification error: {e}")

        # If verdicts were returned, filter candidates
        if verdicts:
            verified: List[Finding] = []
            verdict_map = {v.get("index"): v for v in verdicts if isinstance(v, dict)}

            for idx, candidate in enumerate(findings):
                verdict = verdict_map.get(idx)
                if verdict:
                    if verdict.get("is_valid", True):
                        candidate.is_verified = True
                        if "adjusted_confidence" in verdict:
                            candidate.confidence = float(verdict["adjusted_confidence"])
                        verified.append(candidate)
                    else:
                        logger.info(f"[{state['review_run_id']}] Critic rejected finding: '{candidate.title}' on {candidate.file_path}")
                else:
                    candidate.is_verified = True
                    verified.append(candidate)
            return verified

        # Graceful fallback: If critic call fails or produces no verdicts, preserve candidates with unverified flag
        for f in findings:
            f.is_verified = False
        return findings

    @staticmethod
    def _parse_verdicts(raw_content: str) -> List[Dict[str, Any]]:
        cleaned = raw_content.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[len("```json"):].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        try:
            data = json.loads(cleaned)
            return data if isinstance(data, list) else []
        except Exception:
            return []


# Global critic verifier instance
critic_verifier_service = CriticVerifierService()
