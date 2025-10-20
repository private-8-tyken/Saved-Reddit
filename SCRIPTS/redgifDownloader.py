# redgif_downloader.py
# Extract external links from saved Reddit JSONs and download Redgifs as <post_id>.mp4
from __future__ import annotations

import re
import csv
import json
import time
from pathlib import Path
from typing import Iterable, Optional, Dict, Any, List
from urllib.parse import urlparse

import requests

# tqdm is optional; degrade gracefully if not installed
try:
    from tqdm.auto import tqdm as _tqdm
except Exception:  # pragma: no cover
    def _tqdm(x, **kwargs):
        return x

# -------------------------------
# 1) Helpers: domains & extraction
# -------------------------------

REDDITS_OK = {
    "reddit.com", "www.reddit.com", "old.reddit.com",
    "np.reddit.com", "oauth.reddit.com", "redd.it"
}
REDDIT_NATIVE_MEDIA = {"i.redd.it", "v.redd.it"}

def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""

def extract_external_url(archive_obj: dict) -> Optional[str]:
    """
    From an archive object like:
      { "raw_post": {...}, "raw_comments": {...}, "comments": [...] }
    Pull the outbound link for external posts (non-Reddit, non-native-media).
    """
    post = (archive_obj or {}).get("raw_post") or {}
    url = post.get("url_overridden_by_dest") or post.get("url")
    if not url:
        return None
    d = _domain(url)
    if d and d not in REDDITS_OK and d not in REDDIT_NATIVE_MEDIA:
        return url
    return None

# ------------------------------------
# 2) Redgifs id parsing & API handling
# ------------------------------------

RE_REDGIFS_ID = re.compile(
    r"""(?ix)
    (?:^|/)(?:watch|ifr)/([a-z0-9]+)   # redgifs.com/watch/<id> or /ifr/<id>
    |                                  # OR
    (?:^|/)(?:i)/([a-z0-9]+)           # i.redgifs.com/i/<id>
    """.strip()
)

def redgifs_id_from_url(url: str) -> Optional[str]:
    """
    Extract the media ID from redgifs URLs:
      - https://redgifs.com/watch/<id>
      - https://www.redgifs.com/watch/<id>
      - https://v3.redgifs.com/watch/<id>
      - https://redgifs.com/ifr/<id>
      - https://i.redgifs.com/i/<id>
    """
    m = RE_REDGIFS_ID.search(url)
    if not m:
        return None
    gid = m.group(1) or m.group(2)
    return gid.lower() if gid else None

REDGIFS_AUTH_URL = "https://api.redgifs.com/v2/auth/temporary"
REDGIFS_GIF_URL  = "https://api.redgifs.com/v2/gifs/{id}"

_SESSION = requests.Session()
_RG_TOKEN: Optional[str] = None
_RG_TOKEN_TS: float = 0.0

def redgifs_token(force: bool = False) -> str:
    """Obtain/refresh a temporary Redgifs token (cached ~20 minutes)."""
    global _RG_TOKEN, _RG_TOKEN_TS
    now = time.time()
    if not force and _RG_TOKEN and (now - _RG_TOKEN_TS) < 1200:
        return _RG_TOKEN  # type: ignore[return-value]
    r = _SESSION.get(REDGIFS_AUTH_URL, timeout=30)
    r.raise_for_status()
    _RG_TOKEN = r.json().get("token")
    _RG_TOKEN_TS = now
    if not _RG_TOKEN:
        raise RuntimeError("Failed to obtain Redgifs token.")
    return _RG_TOKEN

def redgifs_mp4_url(gid: str) -> Optional[str]:
    """Resolve a Redgifs ID to an mp4 URL (hd/sd/origin)."""
    tok = redgifs_token()
    headers = {"Authorization": f"Bearer {tok}"}
    r = _SESSION.get(REDGIFS_GIF_URL.format(id=gid), headers=headers, timeout=30)

    if r.status_code in (401, 403):
        tok = redgifs_token(force=True)
        headers = {"Authorization": f"Bearer {tok}"}
        r = _SESSION.get(REDGIFS_GIF_URL.format(id=gid), headers=headers, timeout=30)

    r.raise_for_status()
    info = r.json().get("gif") or {}
    urls = info.get("urls") or {}
    return urls.get("hd") or urls.get("sd") or urls.get("origin")

def download_stream(url: str, dest: Path, *, max_retries: int = 4):
    """Download a URL to dest with simple retry/backoff."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(max_retries):
        try:
            with _SESSION.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 256):
                        if chunk:
                            f.write(chunk)
            return
        except Exception:
            if attempt + 1 >= max_retries:
                raise
            time.sleep(min(2 ** attempt, 15))

# ---------------------------------------------------
# 3) Core pipeline pieces (pure functions, parameterized)
# ---------------------------------------------------

def list_external_jsons(media_json_dir: Path) -> List[Path]:
    """Return sorted list of *.json files in the provided directory."""
    return sorted(media_json_dir.glob("*.json"))

def collect_external_rows(
    files: Iterable[Path],
    *,
    show_progress: bool = True,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Read external post JSON files and collect:
      - external_rows: [{"id","link","domain"}]
      - redgifs_candidates: [{"id","link","domain"}] subset for redgifs
      - redgifs_failed: [{"id","link","reason"}] (read/parse errors)
    """
    external_rows: List[Dict[str, Any]] = []
    redgifs_candidates: List[Dict[str, Any]] = []
    redgifs_failed: List[Dict[str, Any]] = []

    iterator = files
    if show_progress:
        iterator = _tqdm(files, desc="Scanning external posts", unit="post")

    for fp in iterator:
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
            post = (data or {}).get("raw_post") or {}
            pid  = post.get("id") or fp.stem

            ext_url = extract_external_url(data)
            if not ext_url:
                external_rows.append({"id": pid, "link": "", "domain": ""})
                continue

            dom = _domain(ext_url)
            row = {"id": pid, "link": ext_url, "domain": dom}
            external_rows.append(row)

            if "redgifs.com" in dom or dom.endswith(".redgifs.com"):
                redgifs_candidates.append(row)

        except Exception as e:
            redgifs_failed.append({"id": fp.stem, "link": "", "reason": f"read_error: {e}"})

    return {
        "external_rows": external_rows,
        "redgifs_candidates": redgifs_candidates,
        "redgifs_failed": redgifs_failed,
    }

def download_redgifs_batch(
    candidates: Iterable[Dict[str, Any]],
    out_dir: Path,
    *,
    overwrite: bool = False,
    show_progress: bool = True,
    max_retries: int = 4,
    dry_run: bool = False,
) -> List[Dict[str, str]]:
    """
    Download redgifs -> mp4 named by reddit post id into out_dir.
    Return a list of failures: [{"id","link","reason"}].
    When dry_run=True, do not download; just compute planned paths.
    """
    failures: List[Dict[str, str]] = []
    out_dir.mkdir(parents=True, exist_ok=True)

    iterator = candidates
    if show_progress:
        iterator = _tqdm(list(candidates), desc="Downloading Redgifs", unit="file")

    for row in iterator:
        pid = row.get("id")
        ext_url = row.get("link") or ""
        if not pid or not ext_url:
            failures.append({"id": pid or "", "link": ext_url, "reason": "missing_id_or_url"})
            continue

        gid = redgifs_id_from_url(ext_url)
        if not gid:
            failures.append({"id": pid, "link": ext_url, "reason": "no_id_from_url"})
            continue

        out_path = out_dir / f"{pid}.mp4"

        if dry_run:
            row["planned_path"] = str(out_path)
            print(f"[DRY-RUN] would download id={pid} -> {out_path.name}")
            continue

        if out_path.exists() and not overwrite:
            # already downloaded
            continue

        try:
            mp4_url = redgifs_mp4_url(gid)
            if not mp4_url:
                failures.append({"id": pid, "link": ext_url, "reason": "no_mp4_url"})
                continue
            download_stream(mp4_url, out_path, max_retries=max_retries)
            print(f"[REDGIFS] id={pid} -> {out_path.name}")
        except Exception as e:
            failures.append({"id": pid, "link": ext_url, "reason": str(e)})

    return failures

# ------------------------------------------
# 4) CSV persistence and orchestrator
# ------------------------------------------

def write_csv(path: Path, rows: List[Dict[str, Any]], fieldnames: List[str]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    return path

def process_external(
    *,
    # Explicit, user-controlled paths
    media_json_dir: Path,                          # where your *.json live
    media_out_dir: Path,                           # where downloads should go

    # Optional CSV targets (None => don't write)
    write_links_csv_to: Optional[Path] = None,     # e.g., Path("Media/__reports/external_links.csv")
    write_fail_csv_to: Optional[Path]  = None,     # e.g., Path("Media/__reports/redgif_report_...csv")

    # Behavior flags
    show_progress: bool = True,
    overwrite_downloads: bool = False,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    High-level convenience:
      - Reads external JSONs from `media_json_dir`
      - Downloads redgifs into `media_out_dir` (unless dry_run=True)
      - Writes CSVs to user-specified paths if provided

    Returns:
      {
        "external_rows": [...],
        "redgifs_failed": [...],
        "links_csv_path": Path|None,
        "fail_csv_path": Path|None,
        "out_dir": Path
      }
    """
    files = list_external_jsons(media_json_dir)
    print(f"Found {len(files)} external post JSONs in {media_json_dir}")

    coll = collect_external_rows(files, show_progress=show_progress)

    # Download (or preview)
    redgifs_fail_dl = download_redgifs_batch(
        coll["redgifs_candidates"],
        media_out_dir,
        overwrite=overwrite_downloads,
        show_progress=show_progress,
        dry_run=dry_run,
    )

    all_failures = (coll["redgifs_failed"] or []) + (redgifs_fail_dl or [])

    links_csv_path = None
    fail_csv_path = None

    if write_links_csv_to is not None:
        links_csv_path = write_csv(
            write_links_csv_to,
            coll["external_rows"],
            fieldnames=["id", "link", "domain"],
        )
        print(f"Saved external links to: {links_csv_path.resolve()}")

    if write_fail_csv_to is not None and all_failures:
        fail_csv_path = write_csv(
            write_fail_csv_to,
            all_failures,
            fieldnames=["id", "link", "reason"],
        )
        print(f"Saved Redgifs failures to: {fail_csv_path.resolve()}")

    if dry_run:
        print(f"[DRY-RUN] No files were downloaded. Planned output dir: {media_out_dir.resolve()}")

    return {
        "external_rows": coll["external_rows"],
        "redgifs_failed": all_failures,
        "links_csv_path": links_csv_path,
        "fail_csv_path": fail_csv_path,
        "out_dir": media_out_dir,
    }

# -----------------------------
# 5) Optional CLI entry point
# -----------------------------
if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Extract external links and download Redgifs.")
    p.add_argument("--media-json-dir", type=Path, required=True, help="Directory containing external *.json")
    p.add_argument("--media-out-dir", type=Path, required=True, help="Where to save mp4s")
    p.add_argument("--links-csv", type=Path, default=None, help="Write external links CSV to this path")
    p.add_argument("--fail-csv", type=Path, default=None, help="Write failures CSV to this path")
    p.add_argument("--overwrite", action="store_true", help="Overwrite already-downloaded mp4s")
    p.add_argument("--dry-run", action="store_true", help="Preview actions without downloading")
    p.add_argument("--no-progress", action="store_true", help="Disable progress bars")

    args = p.parse_args()

    process_external(
        media_json_dir=args.media_json_dir,
        media_out_dir=args.media_out_dir,
        write_links_csv_to=args.links_csv,
        write_fail_csv_to=args.fail_csv,
        show_progress=not args.no_progress,
        overwrite_downloads=args.overwrite,
        dry_run=args.dry_run,
    )
