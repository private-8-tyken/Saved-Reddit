# mediaDownloader.py
from __future__ import annotations

import os
import re
import csv
import json
import time
import html
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from typing import Tuple, List, Dict, Any

import requests

try:
    from tqdm.auto import tqdm as _tqdm
except Exception:
    _tqdm = None

# -------------------- configuration (no side effects) --------------------
DATA_ROOT = os.environ.get("DATA_ROOT", "out")
BASE_OUT = Path(DATA_ROOT)
MEDIA_JSON_DIR = BASE_OUT / "media"         # default input (when run as a script)
MEDIA_OUT_DIR = BASE_OUT / "media_files"    # default output (when run as a script)
# NOTE: No mkdir on import — avoids stray folders like Media_files/

# Single shared session (you can replace headers if you want)
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "reddit-media-downloader/1.2 (preserve-originals)"
})

# -------------------- helpers (kept from your original logic) --------------------
WIN_ILLEGAL = set('<>:"/\\|?*')

def _clean_url(u: str | None) -> str | None:
    if not u:
        return None
    return html.unescape(u)

def _domain(u: str | None) -> str:
    if not u:
        return ""
    try:
        return urlparse(u).netloc.lower()
    except Exception:
        return ""

def _ext_from_url_or_type(url: str | None, content_type: str | None) -> str:
    # 1) Try from URL
    if url:
        path = urlparse(url).path
        ext = os.path.splitext(path)[1].lower()
        if ext in {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".mp4", ".webm", ".mov"}:
            return ext
    # 2) Try from content-type
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        ext = mimetypes.guess_extension(ct) or ""
        if ext:
            if ext == ".jpe":
                return ".jpg"
            if ext == ".apng":
                return ".png"
            return ext.lower()
        if ct == "image/jpg":   return ".jpg"
        if ct == "image/jpeg":  return ".jpg"
        if ct == "image/webp":  return ".webp"
        if ct == "image/avif":  return ".avif"
        if ct == "image/gif":   return ".gif"
        if ct == "video/mp4":   return ".mp4"
        if ct == "video/webm":  return ".webm"
    # 3) Heuristic from URL string
    if url:
        low = url.lower()
        for marker, e in [
            (".jpg", ".jpg"), (".jpeg", ".jpg"), (".png", ".png"),
            (".webp", ".webp"), (".avif", ".avif"),
            (".gif", ".gif"), (".mp4", ".mp4"), (".webm", ".webm"), (".mov", ".mov")
        ]:
            if marker in low:
                return e
    # 4) Default to jpg
    return ".jpg"

def _stream_download(url: str, dest: Path, *, session: requests.Session, max_retries: int = 4, chunk=1024*256) -> Path:
    """
    Stream download to `dest`. If `dest` has no suffix, refine it from Content-Type.
    Returns the final path (might differ if suffix is refined).
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    final_dest = dest
    for attempt in range(max_retries):
        try:
            with session.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                ctype = r.headers.get("Content-Type")
                if final_dest.suffix == "" and ctype:
                    final_dest = final_dest.with_suffix(_ext_from_url_or_type(url, ctype))
                with open(final_dest, "wb") as f:
                    for part in r.iter_content(chunk_size=chunk):
                        if part:
                            f.write(part)
            return final_dest
        except Exception:
            if attempt + 1 >= max_retries:
                raise
            time.sleep(min(2 ** attempt, 15))
    return final_dest

def _pick_best_preview_original_first(post: Dict[str, Any]) -> str | None:
    prev = post.get("preview") or {}
    variants = prev.get("variants") or {}

    # Prefer original gif if present
    gifv = variants.get("gif")
    if gifv and gifv.get("source", {}).get("url"):
        return _clean_url(gifv["source"]["url"])

    # Then original still image
    src = (prev.get("images") or [{}])[0].get("source", {})
    if src.get("url"):
        return _clean_url(src["url"])

    # Then mp4 preview (or hls via preview)
    mp4v = variants.get("mp4") or variants.get("reddit_video_preview")
    if mp4v and mp4v.get("source", {}).get("url"):
        return _clean_url(mp4v["source"]["url"])
    return None

def _pick_vreddit_urls(post: Dict[str, Any]) -> Tuple[str | None, str | None]:
    media = post.get("media") or {}
    rv = media.get("reddit_video") or {}
    fallback = rv.get("fallback_url")
    hls = rv.get("hls_url")

    prev = post.get("preview") or {}
    pv = prev.get("reddit_video_preview") or {}
    prev_mp4 = pv.get("fallback_url") if isinstance(pv, dict) else None
    return (_clean_url(fallback), _clean_url(prev_mp4 or hls))

def _safe_dirname_from_title(title: str | None, pid: str) -> str:
    t = html.unescape((title or "").strip())
    t = re.sub(r"\s+", " ", t)
    t = "".join(ch for ch in t if ch not in WIN_ILLEGAL and ord(ch) >= 32)
    t = t[:120].strip(" .")
    return t or pid

def _gallery_items_with_originals(post: Dict[str, Any]) -> List[Tuple[str, str]]:
    items: List[Tuple[str, str]] = []
    meta = post.get("media_metadata") or {}
    gdata = post.get("gallery_data") or {}
    order = [e.get("media_id") for e in gdata.get("items", []) if e.get("media_id")]
    for mid in order:
        m = meta.get(mid) or {}
        s = m.get("s") or {}
        url = _clean_url(s.get("gif") or s.get("u") or s.get("url") or s.get("mp4"))
        if not url:
            continue
        m_type = m.get("m")  # e.g., image/jpeg
        ext = _ext_from_url_or_type(url, m_type)
        items.append((url, ext))
    return items

def _num_pad_width(n: int) -> int:
    return max(2, len(str(n)))

# -------------------- public API --------------------
def download_embedded_media(
    *,
    media_json_dir: str | Path,
    media_out_dir: str | Path,
    write_fail_csv_to: str | Path | None = None,
    show_progress: bool = True,
    session: requests.Session | None = None,
) -> Dict[str, Any]:
    """
    Download Reddit-hosted media referenced by JSON files produced elsewhere.

    Parameters
    ----------
    media_json_dir : Path-like
        Directory containing per-post JSON files (each with a 'raw_post' dict).
    media_out_dir : Path-like
        Directory where downloaded media files/folders should go.
    write_fail_csv_to : Path-like or None
        If provided, writes a CSV with failed items to this path.
    show_progress : bool
        If True and tqdm is available, show a progress bar.
    session : requests.Session or None
        Custom session; if None, uses the module-global SESSION.

    Returns
    -------
    dict with: downloaded, failed, skipped, fail_rows, out_dir, json_dir
    """
    media_json_dir = Path(media_json_dir)
    media_out_dir = Path(media_out_dir)
    json_files = sorted(media_json_dir.glob("*.json"))

    sess = session or SESSION

    iterator = json_files
    if show_progress and _tqdm is not None:
        iterator = _tqdm(json_files, desc="Downloading embedded media", unit="post", total=len(json_files))

    downloaded = 0
    skipped = 0
    fail_rows: List[Dict[str, str]] = []

    for fp in iterator:
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
            post = (data or {}).get("raw_post") or {}
            pid = post.get("id") or fp.stem

            # Prefer Reddit-hosted URL if present
            url = _clean_url(post.get("url_overridden_by_dest") or post.get("url"))
            dom = _domain(url)

            # A) Gallery
            if post.get("is_gallery") or (post.get("gallery_data") and post.get("media_metadata")):
                items = _gallery_items_with_originals(post)
                if not items:
                    fail_rows.append({"id": pid, "reason": "gallery_no_items"})
                else:
                    gal_dir = media_out_dir / str(pid).strip()
                    pad = _num_pad_width(len(items))
                    for idx, (item_url, ext) in enumerate(items, start=1):
                        if not ext.startswith("."):
                            ext = "." + ext
                        outfile = gal_dir / f"{str(idx).zfill(pad)}{ext}"
                        if outfile.exists():
                            skipped += 1
                            continue
                        try:
                            _stream_download(item_url, outfile, session=sess)
                            downloaded += 1
                        except Exception as e:
                            fail_rows.append({"id": pid, "reason": f"gallery_item_fail:{e}"})
                continue

            # B) v.redd.it → MP4
            if (post.get("is_video") or (post.get("media") or {}).get("reddit_video")) and dom.endswith("v.redd.it"):
                main_mp4, alt_mp4 = _pick_vreddit_urls(post)
                src = main_mp4 or alt_mp4 or _pick_best_preview_original_first(post)
                if not src:
                    fail_rows.append({"id": pid, "reason": "vreddit_no_source"})
                    continue
                target = media_out_dir / f"{pid}.mp4"
                if target.exists():
                    skipped += 1
                    continue
                try:
                    _stream_download(src, target, session=sess)
                    downloaded += 1
                except Exception as e:
                    fail_rows.append({"id": pid, "reason": f"vreddit_dl_fail:{e}"})
                continue

            # C) i.redd.it direct image/gif
            if dom.endswith("i.redd.it"):
                ext = _ext_from_url_or_type(url, None)
                target = media_out_dir / f"{pid}{ext}"
                if target.exists():
                    skipped += 1
                else:
                    try:
                        _stream_download(url, target, session=sess)
                        downloaded += 1
                    except Exception as e:
                        fail_rows.append({"id": pid, "reason": f"ireddit_dl_fail:{e}"})
                continue

            # D) Fallback via preview (prefer original formats before mp4)
            prev_url = _pick_best_preview_original_first(post)
            if prev_url and _domain(prev_url) in {"i.redd.it", "v.redd.it", "preview.redd.it"}:
                ext = _ext_from_url_or_type(prev_url, None)
                target = media_out_dir / f"{pid}{ext}"
                if target.exists():
                    skipped += 1
                else:
                    try:
                        _stream_download(prev_url, target, session=sess)
                        downloaded += 1
                    except Exception as e:
                        fail_rows.append({"id": pid, "reason": f"preview_dl_fail:{e}"})
                continue

            # No Reddit-hosted media we can reliably fetch
            fail_rows.append({"id": pid, "reason": "no_reddit_media_url"})

        except Exception as e:
            fail_rows.append({"id": fp.stem, "reason": f"read_error:{e}"})

    # Optional failure CSV
    if write_fail_csv_to and fail_rows:
        fail_csv = Path(write_fail_csv_to)
        fail_csv.parent.mkdir(parents=True, exist_ok=True)
        with fail_csv.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["id", "reason"])
            w.writeheader()
            w.writerows(fail_rows)

    return {
        "downloaded": downloaded,
        "failed": len(fail_rows),
        "skipped": skipped,
        "fail_rows": fail_rows,
        "out_dir": media_out_dir,
        "json_dir": media_json_dir,
    }

# -------------------- script entrypoint --------------------
if __name__ == "__main__":
    # Keep CLI-style behavior, but still no side-effects until we run:
    print(f"Scanning {MEDIA_JSON_DIR} ...")
    stats = download_embedded_media(
        media_json_dir=MEDIA_JSON_DIR,
        media_out_dir=MEDIA_OUT_DIR,
        write_fail_csv_to=BASE_OUT / "media_failed.csv",
        show_progress=True,
        session=SESSION,
    )
    print(
        f"\nDone. Downloaded: {stats['downloaded']}, "
        f"Failed: {stats['failed']}, Skipped: {stats['skipped']}."
        f"\nFiles saved under: {MEDIA_OUT_DIR.resolve()}"
    )
    if stats["failed"]:
        print(f"Failures CSV: {(BASE_OUT / 'media_failed.csv').resolve()}")
