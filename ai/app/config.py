from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

# Base directory for the AI service (PRism/ai)
AI_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(AI_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openrouter/free"
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    # CORS configuration with fallback defaults
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8080"
    ALLOWED_ORIGINS: str = ""

    @property
    def allowed_origins_list(self) -> List[str]:
        """Return allowed CORS origins from ALLOWED_ORIGINS or fallback to FRONTEND_URL & BACKEND_URL."""
        if self.ALLOWED_ORIGINS.strip():
            return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]
        return [self.FRONTEND_URL.strip(), self.BACKEND_URL.strip()]


settings = Settings()
