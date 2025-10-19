# jsonDownloader.py
"""
JSON archiver for Reddit posts + comments, extracted from the legacy notebook.
Designed to be imported in Jupyter with minimal methodology changes.
- Maintains the same function names (where possible)
- Uses environment variables for Reddit credentials
- Adds a simple CLI for batch processing
"""

from __future__ import annotations

import os
import re
import csv
import json
import time
import random
import requests
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse, urlencode, parse_qsl

# --- Optional .env support ---
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(override=False)
except Exception:
    pass

# optional progress bar (Jupyter-friendly); falls back if not installed
try:
    from tqdm.auto import tqdm as _tqdm
except Exception:
    _tqdm = None

# ------------------ Defaults (match legacy notebook) ------------------
DATA_ROOT       = os.environ.get("DATA_ROOT", "out")  # output root used by the site
CSV_PATH        = os.environ.get("CSV_PATH", "./links.csv")  # optional list of URLs
SKIP_EXISTING   = os.environ.get("SKIP_EXISTING", "1") != "0"
COMMENTS_DEPTH  = int(os.environ.get("COMMENTS_DEPTH", "1000"))
COMMENTS_LIMIT  = int(os.environ.get("COMMENTS_LIMIT", "100000"))
REQ_MAX_RETRIES = int(os.environ.get("REQ_MAX_RETRIES", "10"))
DELAY_BETWEEN   = float(os.environ.get("DELAY_BETWEEN", "0.05"))
BATCH_PAUSE     = int(os.environ.get("BATCH_PAUSE", "100"))

RUN_TS = datetime.now().strftime("%Y%m%d-%H%M%S")
REPORTS_DIR = os.environ.get("REPORTS_DIR", "reports")
# NOTE: REPORTS_CSV is now (re)computed in init_report() so changes to REPORTS_DIR take effect.
REPORTS_CSV = None  # set in init_report()

# Reddit credentials (from environment)
REDDIT_CLIENT_ID     = os.environ.get("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.environ.get("REDDIT_CLIENT_SECRET", "")
REDDIT_USERNAME      = os.environ.get("REDDIT_USERNAME", "")
REDDIT_PASSWORD      = os.environ.get("REDDIT_PASSWORD", "")
REDDIT_USER_AGENT    = os.environ.get("REDDIT_USER_AGENT", f"SavedRedditJSON/1.0 by u/{REDDIT_USERNAME or 'unknown'}")

# -------------- OAuth + HTTP ------------------

class RedditOAuth:
    TOKEN_URL = "https://www.reddit.com/api/v1/access_token"

    def __init__(self, client_id: str, client_secret: str, username: str, password: str, user_agent: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.username = username
        self.password = password
        self.user_agent = user_agent
        self._token: Optional[str] = None
        self._exp: float = 0.0

    def fetch(self) -> None:
        auth = requests.auth.HTTPBasicAuth(self.client_id, self.client_secret)
        data = {"grant_type": "password", "username": self.username, "password": self.password}
        headers = {"User-Agent": self.user_agent}
        r = requests.post(self.TOKEN_URL, auth=auth, data=data, headers=headers, timeout=30)
        r.raise_for_status()
        j = r.json()
        self._token = j.get("access_token")
        self._exp = time.time() + float(j.get("expires_in", 3600)) * 0.9  # refresh a bit early

    def headers(self) -> Dict[str, str]:
        now = time.time()
        if not self._token or now >= self._exp:
            self.fetch()
        return {"Authorization": f"bearer {self._token}", "User-Agent": self.user_agent}

# single session
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": REDDIT_USER_AGENT})
oauth = RedditOAuth(REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD, REDDIT_USER_AGENT)

def oauth_request(method: str, url: str, **kw) -> requests.Response:
    """Perform an authenticated request to oauth.reddit.com, handling 401 + 429."""
    headers = kw.pop("headers", {}) or {}
    headers.update(oauth.headers())  # ensure token
    # ensure we target the oauth host for API calls if missing
    url2 = url
    if url2.startswith("https://www.reddit.com"):
        url2 = url2.replace("https://www.reddit.com", "https://oauth.reddit.com")
    elif url2.startswith("https://reddit.com"):
        url2 = url2.replace("https://reddit.com", "https://oauth.reddit.com")

    while True:
        r = SESSION.request(method, url2, headers=headers, **kw)
        if r.status_code == 401:  # expired token
            oauth._token = None
            headers.update(oauth.headers())
            r = SESSION.request(method, url2, headers=headers, **kw)
        if r.status_code == 429:  # rate limited
            delay = r.headers.get("retry-after")
            try:
                delay = float(delay) if delay is not None else 2.0
            except Exception:
                delay = 2.0
            time.sleep(max(2.0, delay))
            continue
        return r

# -------------- Helpers ------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def request_with_backoff(method: str, url: str, *, max_retries: int = 5, timeout: int = 30,
                         stream: bool = False, headers: Optional[dict] = None, params: Optional[dict] = None) -> requests.Response:
    attempt = 0
    while True:
        try:
            resp = oauth_request(method, url, timeout=timeout, stream=stream, headers=headers, params=params)
        except requests.RequestException as e:
            if attempt >= max_retries:
                raise
            sleep = min(60, 2 ** attempt) + random.uniform(0, 0.5)
            print(f"Network error {e}; retrying in {sleep:.1f}s …")
            time.sleep(sleep); attempt += 1
            continue

        # Respect rate limits / transient errors
        if resp.status_code == 429 or 500 <= resp.status_code < 600:
            if attempt >= max_retries:
                resp.raise_for_status()
                return resp
            retry_after = resp.headers.get("retry-after")
            try:
                sleep = float(retry_after) if retry_after is not None else min(60, 2 ** attempt)
            except Exception:
                sleep = min(60, 2 ** attempt)
            sleep += random.uniform(0, 0.5)
            print(f"HTTP {resp.status_code}; retrying in {sleep:.1f}s …")
            time.sleep(sleep); attempt += 1
            continue

        resp.raise_for_status()
        return resp

def find_existing_path_and_bucket(root: str, rid: str) -> Tuple[Optional[str], Optional[str]]:
    for b in ("media", "external", "text"):
        p = os.path.join(root, b, f"{rid}.json")
        if os.path.exists(p):
            return p, b
    return None, None

def out_path_for(root: str, bucket: str, rid: str) -> str:
    return os.path.join(root, bucket, f"{rid}.json")

def init_report() -> None:
    global REPORTS_CSV
    # recompute per call so changes to REPORTS_DIR are respected
    run_ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    REPORTS_CSV = os.path.join(REPORTS_DIR, f"run-{run_ts}.csv")
    os.makedirs(os.path.dirname(REPORTS_CSV), exist_ok=True)

    if not os.path.exists(REPORTS_CSV):
        with open(REPORTS_CSV, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(
                ["ts","id","status","url","bucket","out_path","reason","http_status"]
            )

def log_report(*, ts: str, rid: str, status: str, url: str,
               bucket: Optional[str] = None, out_path: Optional[str] = None,
               reason: Optional[str] = None, http_status: Optional[int] = None) -> None:
    with open(REPORTS_CSV, "a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow([ts, rid, status, url, bucket or "", out_path or "", reason or "", http_status or ""])

def configure(**kwargs) -> None:
    """
    Change module settings at runtime.
    Example: configure(DATA_ROOT="out2", SKIP_EXISTING=False, REPORTS_DIR="reports2")
    Recomputes REPORTS_CSV and ensures directories exist.
    """
    global DATA_ROOT, CSV_PATH, SKIP_EXISTING, COMMENTS_DEPTH, COMMENTS_LIMIT
    global REQ_MAX_RETRIES, DELAY_BETWEEN, BATCH_PAUSE
    global REPORTS_DIR, REPORTS_CSV

    for k, v in kwargs.items():
        if k in globals():
            globals()[k] = v

    # ensure directories exist for new paths
    os.makedirs(REPORTS_DIR, exist_ok=True)
    for _sub in ("media", "external", "text"):
        os.makedirs(os.path.join(DATA_ROOT, _sub), exist_ok=True)

    # recompute the report file for this run
    run_ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    REPORTS_CSV = os.path.join(REPORTS_DIR, f"run-{run_ts}.csv")

# -------------- Reddit JSON extraction ------------------

def fetch_post_and_comments(url: str, *, max_retries: int = REQ_MAX_RETRIES):
    if not url.startswith(("http://", "https://")):
        raise ValueError(f"Not a URL: {url}")
    u = url if url.endswith("/") else url + "/"
    params = {"raw_json": 1, "limit": COMMENTS_LIMIT, "depth": COMMENTS_DEPTH}
    r = request_with_backoff("GET", u, max_retries=max_retries, timeout=30, params=params)
    data = r.json()
    if not (isinstance(data, list) and len(data) >= 2):
        raise RuntimeError("Unexpected Reddit JSON format")
    post_listing = data[0]["data"]["children"]
    if not post_listing:
        raise RuntimeError("Post listing empty")
    post = post_listing[0]["data"]
    comments_listing = data[1]
    return post, comments_listing, data

def extract_comments(listing_node, *, max_depth: int = COMMENTS_DEPTH, max_count: int = COMMENTS_LIMIT) -> List[dict]:
    """
    Normalize Reddit 'Listing' trees into a clean array of nested comment dicts:
    { id, author, body, body_html, score, created_utc, permalink, is_submitter, parent_id, replies: [] }
    - Replies are ALWAYS an array ('' -> [])
    - Only kind 't1' (comments) are collected
    - Depth and total count are bounded for safety
    """
    collected: List[dict] = []

    def walk(node, depth, remaining):
        if remaining[0] <= 0 or depth > max_depth:
            return
        if not isinstance(node, dict):
            return
        kind = node.get("kind"); data = node.get("data", {})

        if kind == "t1":
            remaining[0] -= 1
            item = {
                "id": data.get("id"),
                "author": data.get("author"),
                "author_fullname": data.get("author_fullname"),
                "body": data.get("body"),
                "body_html": data.get("body_html"),
                "score": data.get("score"),
                "created_utc": data.get("created_utc"),
                "permalink": "https://www.reddit.com" + (data.get("permalink") or ""),
                "is_submitter": data.get("is_submitter"),
                "parent_id": data.get("parent_id"),
                "replies": [],
            }
            replies = data.get("replies", "")
            if isinstance(replies, dict):
                for ch in replies.get("data", {}).get("children", []):
                    if remaining[0] <= 0: break
                    if not isinstance(ch, dict): continue
                    child_obj = walk(ch, depth + 1, remaining)
                    if child_obj:
                        item["replies"].append(child_obj)
            collected.append(item)
            return item

        if kind == "Listing":
            for ch in node.get("data", {}).get("children", []):
                if remaining[0] <= 0: break
                # Walk children but don't append here; t1 branch handles collection.
                walk(ch, depth, remaining)
        return None


    remaining = [max_count]
    walk(listing_node, 1, remaining)
    return collected

def classify_media_kind(post: dict) -> str:
    url = (post.get("url_overridden_by_dest") or post.get("url") or "").lower()
    domain = (post.get("domain") or "").lower()
    post_hint = (post.get("post_hint") or "").lower()
    if post.get("is_gallery", False): return "gallery"
    elif "v.redd.it" in url or \
       (post.get("secure_media") and post["secure_media"].get("reddit_video")) or \
       (post.get("media") and post["media"].get("reddit_video")) or \
       bool(post.get("crosspost_parent_list")):
        return "video"
    elif post_hint == "image" or domain in ("i.redd.it", "i.reddituploads.com"): return "image"
    elif post.get("is_self", False): return "self"
    return "external"

def select_bucket(media_kind: str) -> str:
    if media_kind in ("image", "gallery", "video"):
        return "media"
    elif media_kind == "external":
        return "external"
    return "text"

def make_archive_object(post: dict, comments_listing: dict, *,
                        include_comments: bool = True,
                        comments_depth: int = COMMENTS_DEPTH,
                        comments_limit: int = COMMENTS_LIMIT) -> dict:
    obj: Dict[str, Any] = {
        "archived_at": now_iso(),
        "reddit_fullname": post.get("name"),
        "reddit_id": post.get("id"),
        "permalink": "https://www.reddit.com" + (post.get("permalink") or ""),
        "title": post.get("title", ""),
        "selftext": post.get("selftext", ""),
        "author": post.get("author"),
        "author_fullname": post.get("author_fullname"),
        "subreddit": post.get("subreddit"),
        "subreddit_id": post.get("subreddit_id"),
        "created_utc": post.get("created_utc"),
        "is_self": post.get("is_self", False),
        "url": post.get("url_overridden_by_dest") or post.get("url"),
        "domain": post.get("domain"),
        "post_hint": post.get("post_hint"),
        "is_gallery": post.get("is_gallery", False),
        "over_18": post.get("over_18", False),
        "spoiler": post.get("spoiler", False),
        "link_flair_text": post.get("link_flair_text"),
        "is_original_content": post.get("is_original_content", False),
        "stickied": post.get("stickied", False),
        "locked": post.get("locked", False),
        "edited": post.get("edited"),
        "num_comments": post.get("num_comments"),
        "score": post.get("score"),
        "upvote_ratio": post.get("upvote_ratio"),
        "media_kind": classify_media_kind(post),
        "media": None,              # (extend later if you also download assets)
        "external_link": None,      # (fill if media_kind == external)
        "raw_post": post,
        "raw_comments": None
    }

    mk = classify_media_kind(post)
    obj["media_kind"] = mk

    if include_comments:
        # Keep the raw Reddit Listing (as-is) AND a normalized tree
        obj["raw_comments"] = comments_listing
        obj["comments"] = extract_comments(
            comments_listing,
            max_depth=comments_depth,
            max_count=comments_limit
        )

    if obj["media_kind"] == "external":
        obj["external_link"] = obj["url"]

    return obj

def write_archive_json(archive_obj: dict, root: str = DATA_ROOT) -> str:
    rid = archive_obj.get("reddit_id") or "post"
    bucket = select_bucket(archive_obj.get("media_kind"))
    out_dir = os.path.join(root, bucket)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{rid}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(archive_obj, f, ensure_ascii=False, indent=2)
    return path

# -------------- Processing API ------------------

def process_one(url: str, *, skip_existing: bool = SKIP_EXISTING) -> dict:
    ts = now_iso()
    try:
        # Quick fetch to determine reddit id
        post, comments_listing, _ = fetch_post_and_comments(url, max_retries=REQ_MAX_RETRIES)
        rid = post.get("id") or "post"

        # Skip if JSON already exists in any bucket
        if skip_existing:
            existing_path, existing_bucket = find_existing_path_and_bucket(DATA_ROOT, rid)
            if existing_path:
                return {
                    "ts": ts, "status": "skipped", "id": rid, "url": url,
                    "bucket": existing_bucket, "path": existing_path,
                    "reason": "exists", "http_status": 200,
                }

        archive_obj = make_archive_object(post, comments_listing, include_comments=True)
        out_path = write_archive_json(archive_obj, root=DATA_ROOT)
        return {
            "ts": ts, "status": "success", "id": rid, "url": url,
            "bucket": select_bucket(archive_obj.get("media_kind")),
            "path": out_path, "reason": None, "http_status": 200,
        }
    except requests.HTTPError as e:
        code = e.response.status_code if getattr(e, "response", None) is not None else None
        return {
            "ts": ts, "status": "failed", "id": locals().get("rid", "") or "",
            "url": url, "bucket": None, "path": None,
            "reason": str(e), "http_status": code,
        }
    except Exception as e:
        rid = locals().get("rid", None)
        return {
            "ts": ts, "status": "failed", "id": rid or "", "url": url,
            "bucket": None, "path": None, "reason": str(e), "http_status": None,
        }

def read_links(csv_path: str) -> List[str]:
    out: List[str] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if not row: continue
            u = (row[0] or "").strip()
            if not u or u.startswith("#"): continue
            out.append(u)
    return out

def process_all(links: List[str], *, show_progress: bool = True) -> dict:
    """
    Batch process with optional tqdm progress bar.
    Shows live counts for success/skipped/failed.
    """
    init_report()
    results = {"success": 0, "skipped": 0, "failed": 0}

    iterator = links
    progress = None
    if show_progress and _tqdm is not None:
        progress = _tqdm(links, total=len(links), unit="post")
        progress.set_description("Starting")

    for i, link in enumerate(iterator, 1):
        info = process_one(link)
        results[info["status"]] += 1
        log_report(
            ts=info["ts"], rid=info["id"], status=info["status"], url=info["url"],
            bucket=info.get("bucket"), out_path=info.get("path"),
            reason=info.get("reason"), http_status=info.get("http_status"),
        )

        # ✅ Update progress bar text dynamically
        if progress is not None:
            progress.set_description(
                f"Saved:{results['success']}  Skipped:{results['skipped']}  Failed:{results['failed']}"
            )
            progress.update(1)

        if DELAY_BETWEEN:
            time.sleep(DELAY_BETWEEN)
        if BATCH_PAUSE and (i % BATCH_PAUSE == 0):
            time.sleep(1.0)

    if progress is not None:
        progress.close()
        print(f"Done. Success: {results['success']}, Skipped: {results['skipped']}, Failed: {results['failed']}")
    return results

# -------------- CLI --------------
def _cli():
    import argparse
    p = argparse.ArgumentParser(description="Reddit JSON archiver")
    p.add_argument("--csv", default=CSV_PATH, help="CSV with one Reddit post URL per row")
    p.add_argument("--out", default=DATA_ROOT, help="Output root directory")
    p.add_argument("--no-skip", action="store_true", help="Do not skip existing JSONs")
    args = p.parse_args()

    # global DATA_ROOT
    DATA_ROOT = args.out
    os.makedirs(DATA_ROOT, exist_ok=True)

    links = read_links(args.csv)
    print(f"Found {len(links)} links.")
    res = process_all(links)
    print("Done.", res, "Report:", REPORTS_CSV)

if __name__ == "__main__":
    _cli()
