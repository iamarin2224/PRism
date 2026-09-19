import ipaddress
import logging
import re
import socket
from typing import Optional
from urllib.parse import urlparse
import httpx
from pydantic import BaseModel, Field

from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

logger = logging.getLogger("prism.tools.web.fetch")

MAX_RESPONSE_BYTES = 1024 * 1024  # 1MB max body limit
MAX_REDIRECTS = 5
REQUEST_TIMEOUT = 15.0


class FetchWebpageInput(BaseModel):
    url: str = Field(
        ...,
        description="Public HTTP/HTTPS URL of the documentation or article to fetch.",
    )


def _is_private_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        )
    except ValueError:
        return True


def validate_public_url(url_str: str) -> Optional[str]:
    """
    SSRF Protection: Validates that the target URL is a safe public HTTP/HTTPS destination.
    Blocks localhost, loopback, private RFC1918 subnets, cloud metadata endpoints, and internal domains.
    """
    try:
        parsed = urlparse(url_str)
    except Exception:
        return "Malformed URL structure."

    if parsed.scheme not in ("http", "https"):
        return f"Prohibited URL scheme '{parsed.scheme}'. Only http and https are permitted."

    hostname = parsed.hostname
    if not hostname:
        return "URL is missing a valid hostname."

    hostname_lower = hostname.lower()

    # Block well-known internal hostnames and cloud metadata targets
    blocked_hosts = {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "metadata.google.internal",
        "169.254.169.254",  # AWS/GCP/Azure metadata IP
        "instance-data",
    }
    if hostname_lower in blocked_hosts or hostname_lower.endswith(".local") or hostname_lower.endswith(".internal"):
        return f"Access to private/internal host '{hostname}' is blocked."

    # DNS resolution check for private IP ranges
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for entry in addr_info:
            ip_str = entry[4][0]
            if _is_private_ip(ip_str):
                return f"Host '{hostname}' resolves to private/prohibited IP address ({ip_str})."
    except socket.gaierror:
        return f"Unable to resolve host '{hostname}'."
    except Exception as e:
        return f"Error verifying host '{hostname}': {str(e)}"

    return None


def _clean_html_to_text(html_content: str) -> str:
    """Strips scripts, styles, navigation, and boilerplate tags to extract clean text."""
    # 1. Remove scripts, styles, head, svgs, and iframes
    cleaned = re.sub(r"<(script|style|head|svg|iframe|noscript)[\s\S]*?</\1>", "", html_content, flags=re.IGNORECASE)
    # 2. Extract title
    title_match = re.search(r"<title[\s\S]*?>(.*?)</title>", html_content, flags=re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else ""

    # 3. Strip remaining HTML tags
    text = re.sub(r"<[^>]+>", " ", cleaned)
    # 4. Normalize excess whitespace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()

    return text[:20000]  # Cap at 20,000 characters for LLM consumption


class FetchWebpageTool(BaseTool[FetchWebpageInput]):
    name = "fetch_webpage"
    description = (
        "Fetch readable textual content from a public web page or online documentation. "
        "Automatically strips scripts, styles, and page navigation chrome, returning cleaned text. "
        "Includes SSRF protections against internal network addresses. "
        "Use this tool to read full documentation pages, release notes, or CVE advisory details."
    )
    input_schema = FetchWebpageInput

    async def execute(self, params: FetchWebpageInput, context: Optional[ToolContext] = None) -> ToolResult:
        url = params.url.strip()
        if not url:
            return ToolResult.fail("URL cannot be empty.")

        # 1. SSRF Validation
        validation_error = validate_public_url(url)
        if validation_error:
            return ToolResult.fail(f"SSRF Protection: {validation_error}")

        headers = {
            "User-Agent": "PRism-External-Knowledge-Fetcher/1.0 (Documentation Researcher)",
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        }

        try:
            async with httpx.AsyncClient(
                headers=headers,
                timeout=REQUEST_TIMEOUT,
                max_redirects=MAX_REDIRECTS,
                follow_redirects=True,
            ) as client:
                res = await client.get(url)

            # Re-validate final destination if redirected
            if str(res.url) != url:
                redirect_err = validate_public_url(str(res.url))
                if redirect_err:
                    return ToolResult.fail(f"SSRF Protection (Redirect Target): {redirect_err}")

            if res.status_code != 200:
                return ToolResult.fail(f"HTTP request to '{url}' failed with status {res.status_code}.")

            content_type = res.headers.get("content-type", "").lower()
            if "image" in content_type or "audio" in content_type or "video" in content_type or "pdf" in content_type:
                return ToolResult.fail(f"Unsupported content type '{content_type}'. Only HTML/text pages are supported.")

            raw_bytes = res.content
            if len(raw_bytes) > MAX_RESPONSE_BYTES:
                return ToolResult.fail(f"Webpage response ({len(raw_bytes)} bytes) exceeds maximum allowable size (1MB).")

            try:
                html_text = res.text
            except Exception:
                html_text = raw_bytes.decode("utf-8", errors="replace")

            extracted_text = _clean_html_to_text(html_text)

            return ToolResult.ok({
                "url": str(res.url),
                "content_type": content_type,
                "text": extracted_text,
                "character_count": len(extracted_text),
            })
        except httpx.TimeoutException:
            return ToolResult.fail(f"Request to '{url}' timed out after {REQUEST_TIMEOUT}s.")
        except Exception as e:
            return ToolResult.fail(f"Failed to fetch webpage '{url}': {str(e)}")


fetch_webpage_tool = FetchWebpageTool()
