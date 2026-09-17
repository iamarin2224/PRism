import json
from typing import Type, TypeVar
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

from app.config import settings
from app.models.review import Finding, ReviewResponse

T = TypeVar("T", bound=BaseModel)

DEFAULT_SYSTEM_PROMPT = (
    "You are the PRism AI assistant, an intelligent agentic system for reviewing pull requests and code."
)

SAMPLE_CODE_FOR_STRUCTURED_TEST = """
def get_user_data(user_id: str, db_connection):
    # Potential SQL injection vulnerability
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    cursor = db_connection.cursor()
    cursor.execute(query)
    return cursor.fetchone()
"""

class LLMService:
    def __init__(self):
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        """Lazily initialize the OpenAI client with OpenRouter credentials."""
        if not settings.OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is not set. Please configure it in ai/.env")
        if self._client is None:
            self._client = OpenAI(
                base_url=settings.OPENROUTER_BASE_URL,
                api_key=settings.OPENROUTER_API_KEY,
            )
        return self._client

    def generate_text(self, prompt: str, system_message: str = DEFAULT_SYSTEM_PROMPT) -> str:
        """Send a prompt to the configured OpenRouter model and return raw text."""
        try:
            client = self.client
            completion = client.chat.completions.create(
                model=settings.OPENROUTER_MODEL,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt},
                ],
            )
            content = completion.choices[0].message.content
            if content is None:
                raise ValueError("Model returned an empty response.")
            return content.strip()
        except OpenAIError as e:
            # Handle API errors without exposing sensitive API keys
            raise RuntimeError(f"OpenRouter API error: {getattr(e, 'message', str(e))}")

    def generate_structured(
        self,
        prompt: str,
        response_format: Type[T],
        system_message: str = DEFAULT_SYSTEM_PROMPT,
    ) -> T:
        """
        Request structured output adhering to a Pydantic model using OpenAI SDK's
        parse method (JSON Schema / Structured Outputs).
        """
        try:
            client = self.client
            # Attempt native structured output via beta parse
            completion = client.beta.chat.completions.parse(
                model=settings.OPENROUTER_MODEL,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt},
                ],
                response_format=response_format,
            )

            message = completion.choices[0].message
            if getattr(message, "refusal", None):
                raise ValueError(f"Model refused to generate structured response: {message.refusal}")

            if message.parsed is not None:
                return message.parsed

            # If parse returned None but content exists, attempt explicit Pydantic validation
            if message.content:
                data = json.loads(message.content)
                return response_format.model_validate(data)

            raise ValueError("Model failed to produce parsed structured output.")
        except ValidationError as ve:
            raise ValueError(f"Model output failed Pydantic schema validation: {ve.errors()}")
        except OpenAIError as e:
            err_msg = getattr(e, "message", str(e))
            raise RuntimeError(
                f"OpenRouter structured output error (the model '{settings.OPENROUTER_MODEL}' may not support structured output schemas): {err_msg}"
            )


# Global service singleton
llm_service = LLMService()
