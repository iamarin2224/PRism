import os
import re
from typing import List, Optional, Tuple
import tiktoken
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

from app.rag.models import CodeChunk

# Map file extensions to LangChain Language enums
EXTENSION_LANGUAGE_MAP = {
    ".py": Language.PYTHON,
    ".js": Language.JS,
    ".jsx": Language.JS,
    ".mjs": Language.JS,
    ".cjs": Language.JS,
    ".ts": Language.TS,
    ".tsx": Language.TS,
    ".cpp": Language.CPP,
    ".cc": Language.CPP,
    ".cxx": Language.CPP,
    ".c": Language.CPP,
    ".h": Language.CPP,
    ".hpp": Language.CPP,
    ".java": Language.JAVA,
    ".go": Language.GO,
    ".rs": Language.RUST,
    ".html": Language.HTML,
    ".htm": Language.HTML,
    ".md": Language.MARKDOWN,
    ".markdown": Language.MARKDOWN,
    ".php": Language.PHP,
    ".rb": Language.RUBY,
    ".sol": Language.SOL,
    ".swift": Language.SWIFT,
    ".kt": Language.KOTLIN,
    ".cs": Language.CSHARP,
}

_tokenizer = None


def get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        try:
            _tokenizer = tiktoken.get_encoding("cl100k_base")
        except Exception:
            _tokenizer = None
    return _tokenizer


def count_tokens(text: str) -> int:
    """Estimates the number of tokens in a text string."""
    enc = get_tokenizer()
    if enc:
        return len(enc.encode(text, disallowed_special=()))
    # Fallback heuristic: ~4 characters per token
    return max(1, len(text) // 4)


def detect_language(file_path: str) -> Tuple[Optional[Language], str]:
    """
    Determines programming language from file extension.
    Returns (LangChain Language enum or None, string representation).
    """
    _, ext = os.path.splitext(file_path.lower())
    lang_enum = EXTENSION_LANGUAGE_MAP.get(ext)
    lang_name = lang_enum.value if lang_enum else (ext[1:] if ext else "text")
    return lang_enum, lang_name


def extract_symbol_hint(chunk_text: str) -> Optional[str]:
    """Heuristic extraction of function or class name from chunk header."""
    patterns = [
        r"(?:def|async\s+def)\s+([a-zA-Z_0-9]+)\s*\(",
        r"class\s+([a-zA-Z_0-9]+)",
        r"(?:function|const|let|var)\s+([a-zA-Z_0-9]+)\s*=\s*(?:async\s*)?\(?",
        r"(?:public|private|protected|static|\s)*[a-zA-Z_0-9<>]+\s+([a-zA-Z_0-9]+)\s*\(",
        r"fn\s+([a-zA-Z_0-9]+)\s*\(",
    ]
    for pattern in patterns:
        match = re.search(pattern, chunk_text)
        if match:
            return match.group(1)
    return None


# Custom structural separators for formats without direct LangChain Language enums
CUSTOM_SEPARATORS = {
    "json": ["\n  },", "\n  ],", "\n},", "\n],", "\n\n", "\n", " ", ""],
    "css": ["\n}\n", "\n}", ";\n", "\n\n", "\n", " ", ""],
    "scss": ["\n}\n", "\n}", ";\n", "\n\n", "\n", " ", ""],
    "yaml": ["\n\n", "\n---", "\n- ", "\n", " ", ""],
    "yml": ["\n\n", "\n---", "\n- ", "\n", " ", ""],
    "sql": [";\n\n", ";\n", "\n\n", "\n", " ", ""],
    "sh": ["\nfi\n", "\ndone\n", "\nesac\n", "\n\n", "\n", " ", ""],
    "bash": ["\nfi\n", "\ndone\n", "\nesac\n", "\n\n", "\n", " ", ""],
    "zsh": ["\nfi\n", "\ndone\n", "\nesac\n", "\n\n", "\n", " ", ""],
}


class CodeSplitter:
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 150):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split_file(
        self,
        file_path: str,
        content: str,
        repo_name: str,
        commit_sha: str,
    ) -> List[CodeChunk]:
        """
        Splits a source file into code chunks using language-aware separators.
        Computes line ranges (start_line, end_line) and token counts.
        """
        if not content.strip():
            return []

        lang_enum, lang_name = detect_language(file_path)

        # 1. Use LangChain language-aware splitter if enum exists
        if lang_enum:
            splitter = RecursiveCharacterTextSplitter.from_language(
                language=lang_enum,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
            )
        # 2. Use custom structural separators for JSON, CSS, YAML, SQL, Shell, etc.
        elif lang_name in CUSTOM_SEPARATORS:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
                separators=CUSTOM_SEPARATORS[lang_name],
            )
        # 3. Generic fallback
        else:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
                separators=["\n\n", "\n", " ", ""],
            )


        text_chunks = splitter.split_text(content)
        code_chunks: List[CodeChunk] = []

        # Track line positions
        current_search_index = 0
        for chunk_text in text_chunks:
            # Find start position of chunk in original content
            pos = content.find(chunk_text, current_search_index)
            if pos == -1:
                pos = content.find(chunk_text)
                if pos == -1:
                    pos = current_search_index

            current_search_index = pos

            # Calculate 1-indexed line numbers
            start_line = content[:pos].count("\n") + 1
            end_line = start_line + chunk_text.count("\n")

            symbol = extract_symbol_hint(chunk_text)
            tokens = count_tokens(chunk_text)

            chunk = CodeChunk(
                repo_name=repo_name,
                commit_sha=commit_sha,
                file_path=file_path,
                language=lang_name,
                start_line=start_line,
                end_line=end_line,
                symbol=symbol,
                content=chunk_text,
                token_count=tokens,
            )
            code_chunks.append(chunk)

        return code_chunks


# Global code splitter singleton
code_splitter = CodeSplitter()


def split_code_file(repo_name: str, file_content) -> List[CodeChunk]:
    """Convenience helper to split a FileContent object."""
    return code_splitter.split_file(
        file_path=file_content.path,
        content=file_content.content,
        repo_name=repo_name,
        commit_sha=file_content.commit_sha,
    )

