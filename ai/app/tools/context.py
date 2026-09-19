from dataclasses import dataclass
from typing import Optional


@dataclass
class ToolContext:
    """
    Context establishing the target repository and review environment.
    Prevents tools from operating on the wrong repository or requiring
    the LLM to repeatedly provide ownership information.
    """
    repository: str  # e.g., "owner/repo"
    commit_sha: str  # Head commit SHA or branch ref
    pr_number: Optional[int] = None
    installation_id: Optional[int] = None
    github_token: Optional[str] = None
    base_sha: Optional[str] = None
    base_branch: Optional[str] = None
    head_branch: Optional[str] = None

    @property
    def owner(self) -> str:
        owner_part, _, _ = self.repository.partition("/")
        return owner_part or "unknown"

    @property
    def repo_name(self) -> str:
        _, _, name_part = self.repository.partition("/")
        return name_part or self.repository
