from typing import Optional
from pydantic import BaseModel, Field


class RepositoryInfo(BaseModel):
    name: Optional[str] = Field(default=None, description="Repository short name")
    fullName: Optional[str] = Field(default=None, description="Repository full name (owner/repo)")
    owner: Optional[str] = Field(default=None, description="Repository owner username")
    htmlUrl: Optional[str] = Field(default=None, description="GitHub repository URL")


class PullRequestInfo(BaseModel):
    number: Optional[int] = Field(default=None, description="Pull Request number")
    title: Optional[str] = Field(default=None, description="Pull Request title")
    htmlUrl: Optional[str] = Field(default=None, description="Pull Request URL on GitHub")
    state: Optional[str] = Field(default=None, description="PR state (open, closed)")
    sourceBranch: Optional[str] = Field(default=None, description="Head source branch name")
    sourceSha: Optional[str] = Field(default=None, description="Head commit SHA")
    targetBranch: Optional[str] = Field(default=None, description="Base target branch name")
    targetSha: Optional[str] = Field(default=None, description="Base commit SHA")
    author: Optional[str] = Field(default=None, description="PR author login username")


class PREventPayload(BaseModel):
    deliveryId: Optional[str] = Field(default=None, description="GitHub Delivery GUID")
    event: str = Field(default="pull_request", description="Event name")
    action: str = Field(..., description="Action performed (opened, synchronize, reopened, etc.)")
    repository: Optional[RepositoryInfo] = Field(default=None, description="Repository metadata")
    pullRequest: Optional[PullRequestInfo] = Field(default=None, description="PR metadata")
    sender: Optional[str] = Field(default=None, description="Sender username")
    installationId: Optional[int] = Field(default=None, description="GitHub App installation ID")
