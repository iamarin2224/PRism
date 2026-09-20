import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

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
        """
        pr_title = state.get("pr_metadata", {}).get("title", "Unknown Title")
        pr_body = state.get("pr_metadata", {}).get("body", "No description provided.")
        repo_name = state.get("repo_name", "")
        pr_number = state.get("pr_number", 0)

        # Diff and files
        diff_summary = state.get("diff_summary", {})
        files_content = diff_summary.get("files_content", {})

        diff_text_blocks = []
        for file_path, content in files_content.items():
            diff_text_blocks.append(f"--- File: {file_path} ---\n{content}\n")
        all_diff_text = "\n".join(diff_text_blocks) if diff_text_blocks else "No diff available."

        # Procedural Rules
        relevant_rules = [
            f"- [{r.get('id', 'RULE')}] ({r.get('domain', 'general')} - {r.get('severity', 'medium')}): {r.get('title', '')} - {r.get('description', '')}"
            for r in state.get("procedural_rules", [])
            if r.get("domain") in (self.name, "general") or not r.get("domain")
        ]
        rules_text = "\n".join(relevant_rules) if relevant_rules else "Standard engineering standards apply."

        # Episodic Feedback
        past_feedback = [
            f"- Past PR #{e.get('pr_number')}: Finding '{e.get('title')}' on {e.get('file_path')} was marked {e.get('feedback_type')}. Context: {e.get('comment', '')}"
            for e in state.get("episodic_context", [])
        ]
        feedback_text = "\n".join(past_feedback) if past_feedback else "No prior recorded human feedback for these patterns."

        # Semantic context
        semantic_chunks = [
            f"- From {c.get('file_path')} (lines {c.get('start_line')}-{c.get('end_line')}):\n{c.get('content')}"
            for c in state.get("semantic_context", [])
        ]
        semantic_text = "\n\n".join(semantic_chunks) if semantic_chunks else "No additional semantic context outside diff."

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
Return your findings as a JSON array of objects conforming to this schema:
[
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
If there are no actionable issues for your domain, return an empty array: []
Respond strictly with valid JSON inside a ```json ... ``` block or raw JSON.
"""
        return prompt.strip()

    def parse_findings(self, raw_content: str) -> List[Finding]:
        """
        Parses JSON findings from LLM output.
        """
        if not raw_content:
            return []

        cleaned = raw_content.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[len("```json"):].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:].strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        try:
            data = json.loads(cleaned)
            if isinstance(data, dict) and "findings" in data:
                data = data["findings"]
            if not isinstance(data, list):
                return []

            category_map = {
                "security": "security",
                "quality": "code_quality",
                "tests": "test_coverage",
                "docs": "documentation",
            }
            default_cat = category_map.get(self.name, "code_quality")

            findings = []
            for item in data:
                if not isinstance(item, dict):
                    continue
                # Map raw category to valid schema category if necessary
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
            return findings
        except Exception as e:
            logger.warning(f"[{self.name}] Failed to parse findings from output: {e}. Raw content: {raw_content[:200]}")
            return []

    async def _run_llm_turn(
        self,
        client: Any,
        model_id: str,
        messages: List[Dict[str, Any]],
        openai_tools: Optional[List[Dict[str, Any]]],
        tool_context: Any,
        max_tool_turns: int,
    ) -> Tuple[List[Finding], int, int]:
        tokens_in = 0
        tokens_out = 0
        findings: List[Finding] = []

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
                findings = self.parse_findings(raw_content)
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

        return findings, tokens_in, tokens_out

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
            findings, tokens_in, tokens_out = await self._run_llm_turn(
                client, model_id, messages.copy(), openai_tools, tool_context, max_tool_turns
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
                    findings, tokens_in, tokens_out = await self._run_llm_turn(
                        fallback_client, fallback_model, messages.copy(), openai_tools, tool_context, max_tool_turns
                    )
                except Exception as fallback_err:
                    logger.error(f"[{state['review_run_id']}] Specialist '{self.name}' fallback failed: {fallback_err}", exc_info=True)
                    error_msg = f"Primary failed ({primary_err}); Fallback failed ({fallback_err})"
            else:
                logger.error(f"[{state['review_run_id']}] Specialist '{self.name}' error: {primary_err}", exc_info=True)
                error_msg = str(primary_err)

        exec_time_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            f"[{state['review_run_id']}] Specialist '{self.name}' completed with {len(findings)} findings in {exec_time_ms:.2f}ms (Tokens: {tokens_in}+{tokens_out})"
        )

        return SpecialistOutput(
            specialist_name=self.name,
            findings=findings,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            execution_time_ms=exec_time_ms,
            error=error_msg,
        )
