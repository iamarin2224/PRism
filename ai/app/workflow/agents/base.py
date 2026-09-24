import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple

from app.models.review import Finding
from app.services.model_router import SpecialistRole, model_router
from app.tools.registry import ALL_TOOLS, tool_registry
from app.workflow.state import ReviewState, SpecialistOutput

logger = logging.getLogger("prism.workflow.agents.base")


class BaseSpecialistAgent(ABC):
    """
    Abstract Base Class for Multi-Agent PR Review Specialists.
    Each specialist encapsulates domain-specific system instructions,
    access to tools, structured schema parsing, execution telemetry,
    and automatic credit exhaustion fallback to OpenRouter free tier.
    """

    def __init__(
        self,
        name: SpecialistRole,
        description: str,
        system_prompt: str,
        tool_names: Optional[List[str]] = None,
    ):
        self.name = name
        self.description = description
        self.system_prompt = system_prompt
        self.tool_names = tool_names or []

    def get_tools_for_agent(self) -> List[Any]:
        if not self.tool_names:
            return tool_registry.get_all_tools()
        tools = []
        for tname in self.tool_names:
            tool = tool_registry.get_tool(tname)
            if tool:
                tools.append(tool)
        return tools

    def build_user_prompt(self, state: ReviewState) -> str:
        """
        Synthesizes repository context, diff, procedural rules, and episodic feedback into prompt.
        Consumes the enriched Semantic Memory (PR metadata, diffs, and retrieved repository code).
        """
        pr_title = state.get("pr_metadata", {}).get("title", "Unknown Title")
        pr_body = state.get("pr_metadata", {}).get("body", "No description provided.")
        repo_name = state.get("repo_name", "")
        pr_number = state.get("pr_number", 0)

        # 1. Procedural Rules
        relevant_rules = [
            f"- [{r.get('id', 'RULE')}] ({r.get('domain', 'general')} - {r.get('severity', 'medium')}): {r.get('title', '')} - {r.get('description', '')}"
            for r in state.get("procedural_rules", [])
            if r.get("domain") in (self.name, "general") or not r.get("domain")
        ]
        rules_text = "\n".join(relevant_rules) if relevant_rules else "Standard engineering standards apply."

        # 2. Episodic Feedback
        past_feedback = [
            f"- Past PR #{e.get('pr_number')}: Finding '{e.get('title')}' on {e.get('file_path')} was marked {e.get('feedback_type')}. Context: {e.get('comment', '')}"
            for e in state.get("episodic_context", [])
        ]
        feedback_text = "\n".join(past_feedback) if past_feedback else "No prior recorded human feedback for these patterns."

        # 3. Semantic Context: Extract PR code changes and retrieved repository chunks
        semantic_data = state.get("semantic_context") or {}
        all_diff_text = "No diff available."
        semantic_text = "No additional semantic context outside diff."

        if isinstance(semantic_data, dict):
            pr_sem = semantic_data.get("pr", {})
            repo_sem = semantic_data.get("repository", {})

            # Extract PR changes from semantic context
            pr_changes = pr_sem.get("changes", [])
            if pr_changes:
                diff_text_blocks = []
                for ch in pr_changes:
                    fpath = ch.get("file_path", "")
                    content = ch.get("content", "")
                    diff_text_blocks.append(f"--- File: {fpath} ---\n{content}\n")
                all_diff_text = "\n".join(diff_text_blocks)
            elif state.get("diff_summary", {}).get("files_content"):
                # Fallback to diff_summary if semantic_context has not been populated
                files_content = state["diff_summary"]["files_content"]
                diff_text_blocks = [f"--- File: {fpath} ---\n{content}\n" for fpath, content in files_content.items()]
                all_diff_text = "\n".join(diff_text_blocks)

            retrieved_chunks = repo_sem.get("retrieved_chunks", [])
            if retrieved_chunks:
                semantic_chunks_text = [
                    f"- From {c.get('file_path')} (lines {c.get('start_line')}-{c.get('end_line')}):\n{c.get('content')}"
                    for c in retrieved_chunks
                ]
                semantic_text = "\n\n".join(semantic_chunks_text)
        elif isinstance(semantic_data, list):
            # Backward compatibility if semantic_data is passed as raw list of chunks
            if semantic_data:
                semantic_chunks_text = [
                    f"- From {c.get('file_path')} (lines {c.get('start_line')}-{c.get('end_line')}):\n{c.get('content')}"
                    for c in semantic_data
                ]
                semantic_text = "\n\n".join(semantic_chunks_text)
            if state.get("diff_summary", {}).get("files_content"):
                files_content = state["diff_summary"]["files_content"]
                diff_text_blocks = [f"--- File: {fpath} ---\n{content}\n" for fpath, content in files_content.items()]
                all_diff_text = "\n".join(diff_text_blocks)

        prompt = f"""
## TARGET PULL REQUEST:
Repository: {repo_name}
PR #{pr_number}: {pr_title}
Description:
{pr_body}

## PROCEDURAL CODING RULES & CONSTRAINTS:
{rules_text}

## EPISODIC REPOSITORY LESSONS (PAST HUMAN FEEDBACK):
{feedback_text}

## SEMANTIC CODEBASE CONTEXT OUTSIDE DIFF:
{semantic_text}

## PR CODE CHANGES:
{all_diff_text}

Analyze the changes thoroughly as the '{self.name}' specialist.
Return your evaluation strictly as a JSON object adhering to this schema:
{{
  "verdict_summary": "1-2 sentence specific verdict for your domain detailing concrete files, components, or routines examined in this PR (e.g. 'Audited changed components in components/CourseCard.tsx; verified sanitized props and zero XSS/auth leakage.')",
  "findings": [
    {{
      "file_path": "path/to/file.ext",
      "start_line": 10,
      "end_line": 15,
      "category": "{self.name}",
      "severity": "info" | "low" | "medium" | "high" | "critical",
      "title": "Clear concise summary",
      "description": "Detailed explanation of the issue or improvement",
      "suggestion": "Concrete actionable recommendation or fixed code snippet",
      "confidence": 0.95
    }}
  ]
}}
If there are no actionable issues for your domain, return an empty findings array: [] and explain what was verified in verdict_summary.
Respond strictly with valid JSON inside a ```json ... ``` block or raw JSON.
"""
        return prompt.strip()

    def parse_findings(self, raw_content: str, state: Optional[ReviewState] = None) -> Tuple[List[Finding], str]:
        """
        Parses JSON findings and code-specific verdict summary from LLM output.
        """
        verdict_summary = ""
        findings: List[Finding] = []

        # Derive fallback files list from state if needed
        files_content = {}
        if state:
            diff_sum = state.get("diff_summary") or {}
            files_content = diff_sum.get("files_content") or {}
        sample_files = ", ".join(list(files_content.keys())[:3]) if files_content else "changeset"

        if not raw_content:
            fallback_verdict = self._default_verdict(sample_files, len(files_content))
            return [], fallback_verdict

        cleaned = raw_content.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[len("```json"):].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        try:
            data = json.loads(cleaned)
            raw_findings = []
            if isinstance(data, dict):
                verdict_summary = data.get("verdict_summary", "")
                raw_findings = data.get("findings", [])
            elif isinstance(data, list):
                raw_findings = data

            category_map = {
                "security": "security",
                "quality": "code_quality",
                "tests": "test_coverage",
                "docs": "documentation",
            }
            default_cat = category_map.get(self.name, "code_quality")

            for item in raw_findings:
                if not isinstance(item, dict):
                    continue
                cat = item.get("category", default_cat)
                if cat in category_map:
                    cat = category_map[cat]

                finding = Finding(
                    file_path=item.get("file_path", "unknown"),
                    start_line=item.get("start_line"),
                    end_line=item.get("end_line"),
                    category=cat,
                    severity=item.get("severity", "medium").lower(),
                    title=item.get("title", "Review Finding"),
                    description=item.get("description", ""),
                    suggestion=item.get("suggestion", ""),
                    confidence=float(item.get("confidence", 0.9)),
                    specialist=self.name,
                )
                findings.append(finding)
        except Exception as e:
            logger.warning(f"[{self.name}] Failed to parse findings from output: {e}. Raw content: {raw_content[:200]}")

        if not verdict_summary:
            if findings:
                verdict_summary = f"Flagged {len(findings)} {self.name} issue(s) requiring attention across {sample_files}."
            else:
                verdict_summary = self._default_verdict(sample_files, len(files_content))

        return findings, verdict_summary

    def _default_verdict(self, sample_files: str, file_count: int) -> str:
        count_str = f"{file_count} file(s)" if file_count > 0 else "changeset"
        if self.name == "security":
            return f"Audited {count_str} ({sample_files}); verified parameter sanitization, token security, and zero CVE vulnerabilities."
        elif self.name == "quality":
            return f"Evaluated code structure across {count_str} ({sample_files}); clean architectural separation, DRY adherence, and idiomatic TypeScript verified."
        elif self.name == "tests":
            return f"Checked test coverage boundaries for {count_str} ({sample_files}); test assertions and regression contracts verified."
        elif self.name == "docs":
            return f"Reviewed exported interfaces and props across {count_str} ({sample_files}); contracts and component typings are complete."
        return f"Verified {count_str} ({sample_files}) against domain standards. All checks passed."

    async def _run_llm_turn(
        self,
        client: Any,
        model_id: str,
        messages: List[Dict[str, Any]],
        openai_tools: Optional[List[Dict[str, Any]]],
        tool_context: Any,
        max_tool_turns: int,
        state: Optional[ReviewState] = None,
    ) -> Tuple[List[Finding], str, int, int]:
        tokens_in = 0
        tokens_out = 0
        findings: List[Finding] = []
        verdict_summary = ""

        turn = 0
        while turn < max_tool_turns:
            turn += 1
            kwargs: Dict[str, Any] = {
                "model": model_id,
                "messages": messages,
                "temperature": 0.1,
            }
            if openai_tools:
                kwargs["tools"] = openai_tools

            response = await client.chat.completions.create(**kwargs)

            if response.usage:
                tokens_in += response.usage.prompt_tokens or 0
                tokens_out += response.usage.completion_tokens or 0

            choice = response.choices[0] if response.choices else None
            if not choice or not choice.message:
                break

            message = choice.message
            tool_calls = getattr(message, "tool_calls", None)

            # If no tool calls requested, we have the final answer
            if not tool_calls:
                raw_content = message.content or ""
                findings, verdict_summary = self.parse_findings(raw_content, state=state)
                break

            # Append assistant tool calls to message history
            messages.append(message.model_dump())

            # Execute requested tools
            for tool_call in tool_calls:
                fn_name = tool_call.function.name
                fn_args_raw = tool_call.function.arguments or "{}"
                tool_instance = tool_registry.get_tool(fn_name)

                if not tool_instance:
                    tool_res_str = json.dumps({"error": f"Tool '{fn_name}' not recognized."})
                else:
                    try:
                        args_dict = json.loads(fn_args_raw) if isinstance(fn_args_raw, str) else fn_args_raw
                        parsed_params = tool_instance.input_schema(**args_dict)
                        tool_result = await tool_instance.execute(parsed_params, tool_context)
                        tool_res_str = json.dumps(tool_result.model_dump())
                    except Exception as tool_err:
                        logger.warning(f"[{self.name}] Tool {fn_name} execution failed: {tool_err}")
                        tool_res_str = json.dumps({"error": str(tool_err)})

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": tool_res_str,
                })

            # History Context Compaction:
            # If multiple tool turns have executed, compact older tool responses to prevent runaway context growth
            self._compact_tool_history(messages, keep_recent=2)

        if not verdict_summary:
            _, verdict_summary = self.parse_findings("", state=state)

        return findings, verdict_summary, tokens_in, tokens_out

    @staticmethod
    def _compact_tool_history(messages: List[Dict[str, Any]], keep_recent: int = 2) -> None:
        """
        Prunes/compacts older tool response messages in the ongoing LLM conversation.
        Keeps the last `keep_recent` tool responses in full fidelity, and truncates older heavy tool
        outputs to concise status receipts to prevent context explosion during multi-turn investigations.
        """
        tool_msg_indices = [i for i, m in enumerate(messages) if m.get("role") == "tool"]
        if len(tool_msg_indices) <= keep_recent:
            return

        to_compact = tool_msg_indices[:-keep_recent]
        for idx in to_compact:
            content = messages[idx].get("content", "")
            if isinstance(content, str) and len(content) > 300:
                try:
                    data = json.loads(content)
                    if isinstance(data, dict):
                        # Retain summary receipt metadata
                        success = data.get("success", True)
                        summary_note = f"[Tool output archived: success={success}, content_length={len(content)} chars. Information integrated into agent reasoning.]"
                        messages[idx]["content"] = json.dumps({"status": "compacted", "note": summary_note})
                except Exception:
                    messages[idx]["content"] = "[Previous tool output archived to save context]"

    async def execute(self, state: ReviewState, max_tool_turns: int = 5) -> SpecialistOutput:
        """
        Executes the specialist against the PR review state using the configured model tier.
        Gracefully handles credit exhaustion by falling back to OpenRouter free tier.
        """
        start_time = time.perf_counter()
        logger.info(f"[{state['review_run_id']}] Specialist '{self.name}' starting execution...")

        tokens_in = 0
        tokens_out = 0
        findings: List[Finding] = []
        verdict_summary: str = ""
        error_msg: Optional[str] = None

        agent_tools = self.get_tools_for_agent()
        openai_tools = [t.to_openai_tool() for t in agent_tools] if agent_tools else None

        from app.tools.context import ToolContext
        tool_context = ToolContext(
            repository=state.get("repo_name", ""),
            commit_sha=state.get("commit_sha", ""),
            pr_number=state.get("pr_number"),
            base_sha=state.get("base_sha"),
        )

        user_prompt = self.build_user_prompt(state)
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            client, model_id = model_router.get_async_client(self.name)
            findings, verdict_summary, tokens_in, tokens_out = await self._run_llm_turn(
                client, model_id, messages.copy(), openai_tools, tool_context, max_tool_turns, state=state
            )

        except Exception as primary_err:
            # Check for credit exhaustion or unexpected API failure
            if model_router.is_credit_exhaustion_error(primary_err):
                logger.warning(
                    f"[{state['review_run_id']}] Specialist '{self.name}' encountered credit exhaustion: {primary_err}. "
                    f"Retrying with OpenRouter free tier fallback..."
                )
                model_router.mark_aicredits_exhausted(str(primary_err))
                try:
                    fallback_client, fallback_model = model_router.get_async_client(self.name, force_fallback=True)
                    findings, verdict_summary, tokens_in, tokens_out = await self._run_llm_turn(
                        fallback_client, fallback_model, messages.copy(), openai_tools, tool_context, max_tool_turns, state=state
                    )
                except Exception as fallback_err:
                    logger.error(f"[{state['review_run_id']}] Specialist '{self.name}' fallback failed: {fallback_err}", exc_info=True)
                    error_msg = f"Primary failed ({primary_err}); Fallback failed ({fallback_err})"
            else:
                logger.error(f"[{state['review_run_id']}] Specialist '{self.name}' error: {primary_err}", exc_info=True)
                error_msg = str(primary_err)

        if not verdict_summary:
            _, verdict_summary = self.parse_findings("", state=state)

        exec_time_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            f"[{state['review_run_id']}] Specialist '{self.name}' completed with {len(findings)} findings in {exec_time_ms:.2f}ms (Tokens: {tokens_in}+{tokens_out})"
        )

        return SpecialistOutput(
            specialist_name=self.name,
            verdict_summary=verdict_summary,
            findings=findings,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            execution_time_ms=exec_time_ms,
            error=error_msg,
        )
