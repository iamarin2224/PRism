from typing import Dict, Optional
from app.sandbox.models import CommandCategory, RuntimeType
from app.sandbox.runtimes.base import BaseRuntimeAdapter


class JavaRuntimeAdapter(BaseRuntimeAdapter):
    """Runtime adapter for Java projects (Maven, Gradle, javac)."""

    JAVA_MANIFESTS = {"pom.xml", "build.gradle", "build.gradle.kts"}

    @property
    def runtime_type(self) -> RuntimeType:
        return RuntimeType.JAVA

    @property
    def priority(self) -> int:
        return 3

    def detect(self, files: Dict[str, str]) -> bool:
        paths = set(files.keys())
        if any(m in paths for m in self.JAVA_MANIFESTS):
            return True
        if any(p.endswith(".java") for p in paths):
            return True
        return False

    def get_command(self, category: CommandCategory, files: Dict[str, str]) -> Optional[str]:
        paths = set(files.keys())
        java_files = [p for p in paths if p.endswith(".java")]

        if category == CommandCategory.TEST:
            if "pom.xml" in paths:
                return "mvn test -B"
            if "build.gradle" in paths or "build.gradle.kts" in paths:
                return "./gradlew test" if "gradlew" in paths else "gradle test"
            if java_files:
                return f"javac {' '.join(java_files)}"
            return None

        if category == CommandCategory.LINT:
            if "pom.xml" in paths:
                return "mvn checkstyle:check"
            if java_files:
                return f"javac -Xlint:all {' '.join(java_files)}"
            return None

        if category == CommandCategory.TYPECHECK:
            if "pom.xml" in paths:
                return "mvn test-compile -B"
            if "build.gradle" in paths or "build.gradle.kts" in paths:
                return "./gradlew classes" if "gradlew" in paths else "gradle classes"
            if java_files:
                return f"javac {' '.join(java_files)}"
            return None

        return None
