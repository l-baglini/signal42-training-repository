"""Discover, download, cache, and serve images (CLAUDE.md §7).

Images are downloaded and served by the backend (proxy/cache) — never hotlinked.
Provenance (origin_url + attribution) is preserved for rendering credit.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass

import httpx

from app.config import Settings
from app.logging import get_logger

log = get_logger(__name__)

_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}


@dataclass
class StoredImage:
    origin_url: str
    stored_path: str
    mime: str
    attribution: str | None = None


async def _download_one(
    origin_url: str, settings: Settings, client: httpx.AsyncClient, attribution: str | None
) -> StoredImage | None:
    try:
        resp = await client.get(origin_url)
        resp.raise_for_status()
    except (httpx.HTTPError, httpx.InvalidURL) as exc:
        log.warning("image_fetch_failed", url=origin_url, error=str(exc))
        return None

    mime = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    if not mime.startswith("image/"):
        return None
    content = resp.content
    if len(content) > settings.max_image_bytes or len(content) == 0:
        log.info("image_skipped_size", url=origin_url, bytes=len(content))
        return None

    ext = _EXT_BY_MIME.get(mime, ".img")
    os.makedirs(settings.image_store_dir, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.image_store_dir, name)
    try:
        with open(path, "wb") as fh:
            fh.write(content)
    except OSError as exc:
        log.warning("image_write_failed", url=origin_url, error=str(exc))
        return None
    return StoredImage(origin_url=origin_url, stored_path=path, mime=mime, attribution=attribution)


async def download_images(
    image_refs: list[tuple[str, str | None]], settings: Settings
) -> list[StoredImage]:
    """Download up to max_images_per_finding images.

    image_refs: list of (origin_url, attribution). Returns successfully stored ones.
    """
    refs = image_refs[: settings.max_images_per_finding]
    if not refs:
        return []
    stored: list[StoredImage] = []
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(settings.fetch_timeout_seconds, connect=5.0),
        follow_redirects=True,
        headers={"User-Agent": "gatherer-tech-radar/0.1"},
    ) as client:
        for url, attribution in refs:
            img = await _download_one(url, settings, client, attribution)
            if img is not None:
                stored.append(img)
    log.info("images_downloaded", requested=len(refs), stored=len(stored))
    return stored
