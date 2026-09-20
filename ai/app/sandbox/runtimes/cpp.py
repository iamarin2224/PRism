from typing import Dict, Optional
from app.sandbox.models import CommandCategory, RuntimeType
from app.sandbox.runtimes.base import BaseRuntimeAdapter


class CppRuntimeAdapter(BaseRuntimeAdapter):
    """Runtime adapter for C and C++ projects."""

    CPP_EXTENSIONS = (".cpp", ".cc", ".cxx", ".c", ".hpp", ".h", ".hxx")
    CPP_MANIFESTS = {"CMakeLists.txt", "Makefile", "meson.build"}

    @property
    def runtime_type(self) -> RuntimeType:
        return RuntimeType.CPP

    @property
    def priority(self) -> int:
        return 3

    def detect(self, files: Dict[str, str]) -> bool:
        paths = set(files.keys())
        if any(m in paths for m in self.CPP_MANIFESTS):
            return True
        if any(p.endswith(self.CPP_EXTENSIONS) for p in paths):
            return True
        return False

    def get_command(self, category: CommandCategory, files: Dict[str, str]) -> Optional[str]:
        paths = set(files.keys())

        if category == CommandCategory.TEST:
            if "CMakeLists.txt" in paths:
                return "cmake -B build && cmake --build build && ctest --test-dir build --output-on-failure"
            if "Makefile" in paths:
                return "make test"
            cpp_files = [p for p in paths if p.endswith((".cpp", ".cc", ".cxx"))]
            if cpp_files:
                return f"g++ -std=c++17 {' '.join(cpp_files)} -o test_bin && ./test_bin"
            return None

        if category == CommandCategory.LINT:
            cpp_files = [p for p in paths if p.endswith(self.CPP_EXTENSIONS)]
            if cpp_files:
                return f"clang-tidy {' '.join(cpp_files)} -- -std=c++17"
            return None

        if category == CommandCategory.TYPECHECK:
            cpp_files = [p for p in paths if p.endswith((".cpp", ".cc", ".cxx", ".c"))]
            if "CMakeLists.txt" in paths:
                return "cmake -B build && cmake --build build"
            if cpp_files:
                return f"g++ -fsyntax-only -std=c++17 {' '.join(cpp_files)}"
            return None

        return None
