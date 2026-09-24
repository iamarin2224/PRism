from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class IndexStatus(str, Enum):
    NOT_INDEXED = "NOT_INDEXED"
    INDEXING = "INDEXING"
    INDEXED = "INDEXED"
    STALE = "STALE"
    FAILED = "FAILED"


class CodeChunk(BaseModel):
    """Represents a single parsed and embedded source code chunk."""
    id: Optional[str] = None
    repo_name: str
    commit_sha: str
    file_path: str
    language: str
    start_line: int
    end_line: int
    symbol: Optional[str] = None
    content: str
    token_count: int
    embedding: Optional[List[float]] = None


class RetrievedChunk(BaseModel):
    """Represents a retrieved chunk with similarity score and metadata."""
    id: str
    repo_name: str
    file_path: str
    language: str
    start_line: int
    end_line: int
    symbol: Optional[str] = None
    content: str
    similarity: float = Field(..., description="Cosine similarity score (0 to 1)")


class RetrievalResult(BaseModel):
    """Encapsulates top-K search results with latency metrics."""
    query: str
    repo_name: str
    chunks: List[RetrievedChunk]
    top_k: int
    latency_ms: float


class IndexingRequest(BaseModel):
    """Request payload to manually trigger or update repository indexing."""
    repo_name: str = Field(..., description="Full repository name (e.g. owner/repo)")
    commit_sha: Optional[str] = Field(default=None, description="Optional target commit SHA")
    force_full: bool = Field(default=False, description="Whether to force a full re-index instead of incremental")
    installation_id: Optional[int] = Field(default=None, description="GitHub App installation ID")
    github_token: Optional[str] = Field(default=None, description="Optional GitHub PAT or installation token")
    files: Optional[List[dict]] = Field(default=None, description="Optional raw file payloads for local indexing/testing")



class IndexingResponse(BaseModel):
    """Response returned when indexing is scheduled."""
    repo_name: str
    status: IndexStatus
    message: str
    commit_sha: Optional[str] = None


class RepoIndexState(BaseModel):
    """Status details for a repository's indexing state."""
    repo_name: str
    status: IndexStatus
    indexed_commit: Optional[str] = None
    current_commit: Optional[str] = None
    last_indexed_at: Optional[str] = None
    error_message: Optional[str] = None
    total_chunks: int = 0


class QARequest(BaseModel):
    """Query payload for repository Question & Answering."""
    repo_name: str = Field(..., description="Repository to query")
    query: str = Field(..., description="User question or prompt")
    top_k: int = Field(default=5, description="Number of context chunks to retrieve")


class SourceReference(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    symbol: Optional[str] = None
    similarity: float
    content: Optional[str] = None


class QAResponse(BaseModel):
    """Answer with source code citations."""
    query: str
    repo_name: str
    answer: str
    sources: List[SourceReference]
    latency_ms: float
