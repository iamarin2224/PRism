import ipaddress
import logging
import re
import socket
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
import httpx
from pydantic import BaseModel, Field

from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

logger = logging.getLogger("prism.tools.web.search")

BLOCKED_DOMAINS = {"localhost", "metadata.google.internal", "instance-data"}


class WebSearchInput(BaseModel):
    query: str = Field(
        ...,
        description="External knowledge query (e.g. 'Next.js 15 cookies API changes', 'CVE-2024-XXXX', 'PostgreSQL pgvector cosine ops').",
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum number of search results to return.",
    )


class WebSearchResultItem(BaseModel):
    title: str
    url: str
    snippet: str
    domain: str


class WebSearchProvider(ABC):
    """Abstract interface for external search providers (DuckDuckGo, Tavily, Bing, etc.)."""
    @abstractmethod
    async def search(self, query: str, max_results: int = 5) -> List[WebSearchResultItem]:
        pass


class DuckDuckGoSearchProvider(WebSearchProvider):
    """
    Default free search provider using DuckDuckGo HTML/Instant API.
    Does not require third-party API keys.
    """
    async def search(self, query: str, max_results: int = 5) -> List[WebSearchResultItem]:
        url = "https://html.duckduckgo.com/html/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
        async with httpx.AsyncClient(headers=headers, timeout=15.0, follow_redirects=True) as client:
            res = await client.post(url, data={"q": query})

        if res.status_code != 200:
            raise RuntimeError(f"Search provider returned status {res.status_code}")

        html = res.text
        results: List[WebSearchResultItem] = []

        # Simple resilient regex extraction of title, url, snippet
        # Pattern for DuckDuckGo result links
        links = re.findall(
            r'<a class="result__url" href="([^"]+)".*?<h2 class="result__title">.*?<a.*?>(.*?)</a>.*?<a class="result__snippet".*?>(.*?)</a>',
            html,
            re.DOTALL,
        )

        if not links:
            # Fallback regex for variant DDG HTML markup
            link_blocks = re.findall(r'<div class="result__body">(.*?)</div>', html, re.DOTALL)
            for block in link_blocks[:max_results]:
                url_m = re.search(r'href="([^"]+)"', block)
                title_m = re.search(r'<a class="result__snippet".*?>(.*?)</a>', block, re.DOTALL)
                snippet_m = re.search(r'<a class="result__snippet".*?>(.*?)</a>', block, re.DOTALL)
                if url_m and title_m:
                    raw_url = url_m.group(1)
                    if "uddg=" in raw_url:
                        # Extract actual URL from DuckDuckGo redirect wrapper
                        import urllib.parse
                        parsed = urllib.parse.parse_qs(urllib.parse.urlparse(raw_url).query)
                        actual_url = parsed.get("uddg", [raw_url])[0]
                    else:
                        actual_url = raw_url

                    domain = urlparse(actual_url).netloc
                    clean_title = re.sub(r"<[^>]+>", "", title_m.group(1)).strip()
                    clean_snippet = re.sub(r"<[^>]+>", "", snippet_m.group(1)).strip() if snippet_m else ""
                    results.append(
                        WebSearchResultItem(
                            title=clean_title,
                            url=actual_url,
                            snippet=clean_snippet,
                            domain=domain,
                        )
                    )
        else:
            for raw_url, raw_title, raw_snippet in links[:max_results]:
                import urllib.parse
                if "uddg=" in raw_url:
                    parsed = urllib.parse.parse_qs(urllib.parse.urlparse(raw_url).query)
                    actual_url = parsed.get("uddg", [raw_url])[0]
                else:
                    actual_url = raw_url

                domain = urlparse(actual_url).netloc
                clean_title = re.sub(r"<[^>]+>", "", raw_title).strip()
                clean_snippet = re.sub(r"<[^>]+>", "", raw_snippet).strip()
                results.append(
                    WebSearchResultItem(
                        title=clean_title,
                        url=actual_url,
                        snippet=clean_snippet,
                        domain=domain,
                    )
                )

        return results


class WebSearchTool(BaseTool[WebSearchInput]):
    name = "web_search"
    description = (
        "Search external web knowledge, official framework documentation, security advisories, CVEs, or library APIs. "
        "Returns top search result items with titles, URLs, domain names, and descriptive snippets. "
        "Use this tool when repository code alone is insufficient to verify library contracts, breaking changes, or vulnerabilities."
    )
    input_schema = WebSearchInput

    def __init__(self, provider: Optional[WebSearchProvider] = None):
        self.provider = provider or DuckDuckGoSearchProvider()

    async def execute(self, params: WebSearchInput, context: Optional[ToolContext] = None) -> ToolResult:
        query = params.query.strip()
        if not query:
            return ToolResult.fail("Search query cannot be empty.")

        try:
            results = await self.provider.search(query=query, max_results=params.max_results)
            items = [r.model_dump() for r in results]
            return ToolResult.ok(items, metadata={"query": query, "count": len(items)})
        except Exception as e:
            logger.warning(f"Web search execution error: {e}")
            return ToolResult.ok(
                [],
                metadata={"status": "WEB_SEARCH_UNAVAILABLE", "error": str(e), "query": query},
            )


web_search_tool = WebSearchTool()
