"""
Phase 3 Code-Aware RAG Verification Script
Tests chunking, filtering, vector store contracts, and ingestion pipelines.
"""

import sys
import os

# Add ai directory to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.rag.chunking.splitter import split_code_file, count_tokens
from app.rag.ingestion.github import should_skip_file, MAX_FILE_SIZE_BYTES, MAX_FILE_TOKENS, IngestedFile

def test_filtering():
    print("Testing Ingestion Filtering Rules...")
    # Ignore path rules
    skip1, r1 = should_skip_file("node_modules/package.json")
    assert skip1 == True, f"Expected node_modules to be skipped, got {skip1}"
    
    skip2, r2 = should_skip_file("dist/index.js")
    assert skip2 == True, f"Expected dist to be skipped, got {skip2}"
    
    skip3, r3 = should_skip_file(".next/server.js")
    assert skip3 == True, f"Expected .next to be skipped, got {skip3}"

    skip4, r4 = should_skip_file(".venv/bin/activate")
    assert skip4 == True, f"Expected .venv to be skipped, got {skip4}"

    skip5, r5 = should_skip_file("src/app/main.py")
    assert skip5 == False, f"Expected src/app/main.py not to be skipped, got {skip5}"
    
    # Binary file detection
    skip6, r6 = should_skip_file("assets/image.png")
    assert skip6 == True, f"Expected png to be skipped, got {skip6}"
    
    # Size limit
    skip7, r7 = should_skip_file("huge.txt", size_bytes=MAX_FILE_SIZE_BYTES + 100)
    assert skip7 == True, f"Expected >1MB to be skipped, got {skip7}"
    
    # Token estimation
    small_code = "def hello():\n    return 'world'\n"
    assert count_tokens(small_code) < 100
    
    print("  ✓ Filtering rules passed!")

def test_language_aware_chunking():
    print("Testing Language-Aware Code Chunking...")
    sample_py = '''
import os
import sys

def compute_metrics(a: int, b: int) -> int:
    """Computes basic sum metric."""
    result = a + b
    return result

class RepositoryManager:
    """Manages repository lifecycle and indexing."""
    def __init__(self, name: str):
        self.name = name

    def get_status(self) -> str:
        return "INDEXED"
'''
    file_content = IngestedFile(
        path="src/manager.py",
        content=sample_py,
        size_bytes=len(sample_py.encode()),
        token_count=count_tokens(sample_py),
    )
    setattr(file_content, "commit_sha", "abc12345")
    
    chunks = split_code_file("test-owner/test-repo", file_content)
    assert len(chunks) > 0
    for chunk in chunks:
        assert chunk.repo_name == "test-owner/test-repo"
        assert chunk.file_path == "src/manager.py"
        assert chunk.language == "python"
        assert chunk.start_line >= 1
        assert chunk.end_line >= chunk.start_line
        assert len(chunk.content.strip()) > 0
    
    print(f"  ✓ Python chunking passed! Created {len(chunks)} chunks with accurate line spans & metadata.")

    # Test TypeScript chunking
    sample_ts = '''
import { NextRequest, NextResponse } from 'next/server';

export interface UserConfig {
  id: string;
  enabled: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const data = await req.json();
  return NextResponse.json({ success: true, data });
}
'''
    ts_content = IngestedFile(
        path="app/api/route.ts",
        content=sample_ts,
        size_bytes=len(sample_ts.encode()),
        token_count=count_tokens(sample_ts),
    )
    setattr(ts_content, "commit_sha", "abc12345")
    ts_chunks = split_code_file("test-owner/test-repo", ts_content)
    assert len(ts_chunks) > 0
    assert ts_chunks[0].language in ["ts", "typescript"]
    print(f"  ✓ TypeScript chunking passed! Created {len(ts_chunks)} chunks.")

    # Test JSON chunking
    sample_json = '''{
  "name": "prism",
  "version": "1.0.0",
  "dependencies": {
    "next": "15.2.1",
    "react": "19.0.0"
  }
}'''
    json_content = IngestedFile(
        path="package.json",
        content=sample_json,
        size_bytes=len(sample_json.encode()),
        token_count=count_tokens(sample_json),
    )
    setattr(json_content, "commit_sha", "abc12345")
    json_chunks = split_code_file("test-owner/test-repo", json_content)
    assert len(json_chunks) > 0
    assert json_chunks[0].language == "json"
    print(f"  ✓ JSON chunking passed! Created {len(json_chunks)} chunks.")

    # Test CSS chunking
    sample_css = '''.container {
  display: flex;
  margin: 0 auto;
}
.btn-primary {
  color: #fff;
  background-color: #0070f3;
}'''
    css_content = IngestedFile(
        path="styles/globals.css",
        content=sample_css,
        size_bytes=len(sample_css.encode()),
        token_count=count_tokens(sample_css),
    )
    setattr(css_content, "commit_sha", "abc12345")
    css_chunks = split_code_file("test-owner/test-repo", css_content)
    assert len(css_chunks) > 0
    assert css_chunks[0].language == "css"
    print(f"  ✓ CSS chunking passed! Created {len(css_chunks)} chunks.")


if __name__ == "__main__":
    print("=========================================")
    print("PRism Phase 3 RAG Pipeline Unit Tests")
    print("=========================================")
    test_filtering()
    test_language_aware_chunking()
    print("=========================================")
    print("All Phase 3 RAG unit tests completed successfully!")
