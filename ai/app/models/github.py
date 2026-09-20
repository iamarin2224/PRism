from typing import Optional
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class RepositoryInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = Field(default=None, description="Repository short name")
    fullName: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("fullName", "full_name"),
        description="Repository full name (owner/repo)",
    )
    owner: Optional[str] = Field(default=None, description="Repository owner username")
    htmlUrl: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("htmlUrl", "html_url"),
        description="GitHub repository URL",
    )


class PullRequestInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    number: Optional[int] = Field(default=None, description="Pull Request number")
    title: Optional[str] = Field(default=None, description="Pull Request title")
    htmlUrl: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("htmlUrl", "html_url"),
        description="Pull Request URL on GitHub",
    )
    state: Optional[str] = Field(default=None, description="PR state (open, closed)")
    sourceBranch: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("sourceBranch", "source_branch", "head_ref"),
        description="Head source branch name",
    )
    sourceSha: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("sourceSha", "source_sha", "head_sha"),
        description="Head commit SHA",
    )
    targetBranch: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("targetBranch", "target_branch", "base_ref"),
        description="Base target branch name",
    )
    targetSha: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("targetSha", "target_sha", "base_sha"),
        description="Base commit SHA",
    )
    author: Optional[str] = Field(default=None, description="PR author login username")


class PREventPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deliveryId: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("deliveryId", "delivery_id"),
        description="GitHub Delivery GUID",
    )
    event: str = Field(default="pull_request", description="Event name")
    action: str = Field(..., description="Action performed (opened, synchronize, reopened, etc.)")
    repository: Optional[RepositoryInfo] = Field(default=None, description="Repository metadata")
    pullRequest: Optional[PullRequestInfo] = Field(
        default=None,
        validation_alias=AliasChoices("pullRequest", "pull_request"),
        description="PR metadata",
    )
    sender: Optional[str] = Field(default=None, description="Sender username")
    installationId: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("installationId", "installation_id"),
        description="GitHub App installation ID",
    )
