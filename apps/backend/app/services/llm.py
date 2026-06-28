"""Thin async wrapper around OpenRouter's OpenAI-compatible chat/completions API."""
import json
import httpx

from app.core.config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(Exception):
    """Raised on any failure to obtain a valid LLM response."""


async def parse_with_llm(*, system: str, user: str, schema: dict, model: str | None = None) -> dict:
    """Send (system, user) to OpenRouter; ask for JSON matching `schema`; return parsed dict.

    Raises LLMError on network errors, non-2xx responses, missing API key, or invalid JSON.
    """
    if not settings.openrouter_api_key:
        raise LLMError("OPENROUTER_API_KEY not configured")

    body = {
        "model": model or settings.openrouter_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "structured", "strict": True, "schema": schema},
        },
        "temperature": 0.1,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.openrouter_timeout_seconds) as client:
            resp = await client.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": "https://chillbill.skdev.one",
                    "X-Title": "Halvio",
                },
                json=body,
            )
    except (httpx.TimeoutException, httpx.HTTPError) as e:
        raise LLMError(f"openrouter request failed: {e}") from e

    if resp.status_code >= 400:
        raise LLMError(f"openrouter returned {resp.status_code}: {resp.text[:300]}")

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except (KeyError, IndexError, ValueError, TypeError) as e:
        raise LLMError(f"openrouter returned malformed response: {e}") from e
