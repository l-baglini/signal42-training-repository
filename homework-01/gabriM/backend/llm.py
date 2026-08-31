"""Thin wrapper around OpenRouter's chat completions endpoint."""
import os
import json
import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(Exception):
    pass


async def chat(prompt: str, system: str | None = None, max_tokens: int = 1500,
               temperature: float = 0.3) -> str:
    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free")
    if not api_key:
        raise LLMError("OPENROUTER_API_KEY non impostata nel file .env")

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                # OpenRouter consiglia questi header; sono opzionali.
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "NewsDesk Homework",
            },
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
    if resp.status_code != 200:
        raise LLMError(f"OpenRouter {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        raise LLMError(f"Risposta inattesa da OpenRouter: {json.dumps(data)[:300]}")


async def chat_json(prompt: str, system: str | None = None, max_tokens: int = 1500) -> dict | list:
    """Like chat() but parses JSON, tolerating ```json fences."""
    raw = await chat(prompt, system=system, max_tokens=max_tokens, temperature=0.1)
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    cleaned = cleaned.strip().strip("`").strip()
    # Fallback: estrai il primo blocco { ... } o [ ... ]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        for open_c, close_c in (("[", "]"), ("{", "}")):
            start = cleaned.find(open_c)
            end = cleaned.rfind(close_c)
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(cleaned[start:end + 1])
                except json.JSONDecodeError:
                    continue
        raise LLMError(f"Non sono riuscito a parsare il JSON: {raw[:300]}")
