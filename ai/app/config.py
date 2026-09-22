from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

# Base directory for the AI service (PRism/ai)
AI_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(AI_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # OpenRouter Text Generation Settings
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openrouter/free"

    # AICredits Text Generation / LLM Routing Settings
    AICREDITS_API_KEY: str = ""
    AICREDITS_BASE_URL: str = "https://api.aicredits.in/v1"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536
    MID_MODEL: str = "qwen/qwen3-coder-30b-a3b-instruct"
    HIGH_MODEL: str = "deepseek/deepseek-v4.1-flash"

    # Optional model pricing per 1M tokens (in INR / base currency)
    HM_INPUT_COST: Optional[float] = None
    HM_OUTPUT_COST: Optional[float] = None
    MM_INPUT_COST: Optional[float] = None
    MM_OUTPUT_COST: Optional[float] = None


    # GitHub API Token (optional fallback for rate limits)
    GITHUB_TOKEN: str = ""

    # E2B Sandbox Settings
    E2B_API_KEY: str = ""
    E2B_TEMPLATE: str = "prism-polyglot-reviewer"

    # Neon PostgreSQL Database Settings

    DATABASE_URL: str = ""

    # Redis & Asynchronous Job Queue Settings
    REDIS_URL: str = "redis://localhost:6379"

    # CORS configuration with fallback defaults (Next.js runs on port 5050)
    NEXTJS_URL: str = "http://localhost:5050"
    FRONTEND_URL: str = "http://localhost:5050"
    BACKEND_URL: str = "http://localhost:5050"
    ALLOWED_ORIGINS: str = ""

    @property
    def allowed_origins_list(self) -> List[str]:
        """Return allowed CORS origins from ALLOWED_ORIGINS or fallback to configured URLs."""
        if self.ALLOWED_ORIGINS.strip():
            return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]
        
        origins = {self.NEXTJS_URL.strip(), self.FRONTEND_URL.strip(), self.BACKEND_URL.strip(), "http://localhost:5050"}
        return list(origins)


settings = Settings()
