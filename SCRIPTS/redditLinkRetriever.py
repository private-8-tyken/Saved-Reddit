"""
redditLinkRetriever.py

A small utility to fetch the canonical post links for everything you've saved on Reddit,
directly from Python (usable in Jupyter). It converts saved comments -> their parent post,
de‑duplicates while preserving the saved order, and can optionally write out a .txt file.

Requires:
    pip install praw python-dotenv

Environment variables (e.g., in a .env file):
    REDDIT_CLIENT_ID=...
    REDDIT_CLIENT_SECRET=...
    REDDIT_USERNAME=...
    REDDIT_PASSWORD=...
    REDDIT_USER_AGENT=SavedRedditJSON/1.0 by u/<your_username>

Example (Jupyter):
    from SCRIPTS.redditLinkRetriever import fetch_saved_post_links, save_links_txt
    links = fetch_saved_post_links()           # list[str]
    save_links_txt(links, "saved_post_links.txt")

Example (CLI):
    python -m SCRIPTS.redditLinkRetriever --out saved_post_links.txt
"""
from __future__ import annotations

import os
import re
from typing import Iterable, List, Optional
from datetime import datetime

try:
    from dotenv import load_dotenv  # type: ignore
except Exception:
    # dotenv is optional, only used if present
    load_dotenv = None  # type: ignore

# --- Helpers -----------------------------------------------------------------

_RE_TRAILING_SLASH = re.compile(r"/+$")

def _norm_post_url(permalink: str) -> str:
    """
    Given a Reddit permalink (which may be '/r/...'), return absolute URL
    to the post (no trailing slash).
    """
    if permalink.startswith("/"):
        url = "https://www.reddit.com" + permalink
    else:
        url = permalink
    return _RE_TRAILING_SLASH.sub("", url)

# --- Core fetcher -------------------------------------------------------------

def fetch_saved_post_links(
    username: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[str]:
    """
    Fetch saved items for the authenticated user and return a de-duplicated list
    of canonical *post* URLs in the order they are returned by Reddit
    (i.e., most recently saved first).

    If `limit` is None, retrieves all available saved items.
    If `username` is None, it uses REDDIT_USERNAME from the environment.

    Notes:
    - Requires a Reddit "script" app's credentials and password OAuth (see PRAW docs).
    - Saved *comments* are converted to their parent submission's permalink.
    """
    # Load .env if python-dotenv is available
    if load_dotenv is not None:
        try:
            load_dotenv()
        except Exception:
            pass

    username = username or os.getenv("REDDIT_USERNAME")
    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    password = os.getenv("REDDIT_PASSWORD")
    user_agent = os.getenv("REDDIT_USER_AGENT", "SavedRedditJSON/1.0 (python)")

    missing = [k for k, v in {
        "REDDIT_CLIENT_ID": client_id,
        "REDDIT_CLIENT_SECRET": client_secret,
        "REDDIT_USERNAME": username,
        "REDDIT_PASSWORD": password,
    }.items() if not v]
    if missing:
        raise RuntimeError(
            "Missing environment variables: " + ", ".join(missing) +
            ". Put them in your environment or a .env file."
        )

    import praw  # local import to avoid hard dependency for module introspection

    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        username=username,
        password=password,
        user_agent=user_agent,
    )

    # `redditor.saved()` returns newest -> oldest by default.
    redditor = reddit.redditor(username)
    saved_stream = redditor.saved(limit=limit)

    # De-duplicate while preserving order (Python 3.7+ dicts preserve insertion order)
    seen = dict()
    for i, item in enumerate(saved_stream, 1):
        try:
            # Submissions have .permalink; Comments have .submission.permalink
            if hasattr(item, "permalink"):  # Submission
                link = _norm_post_url(item.permalink)
            else:  # Comment
                submission = getattr(item, "submission", None)
                permalink = getattr(submission, "permalink", None)
                if not permalink and hasattr(item, "link_id") and str(item.link_id).startswith("t3_"):
                    sub = reddit.submission(id=str(item.link_id)[3:])
                    permalink = getattr(sub, "permalink", None)
                if not permalink:
                    raise ValueError("No permalink found for comment or submission.")
                link = _norm_post_url(permalink)

            # Add if new
            if link not in seen:
                seen[link] = True

        except Exception as e:
            # Detailed diagnostic message — don't stop execution
            kind = type(item).__name__
            msg = f"[WARN] Failed to process saved item #{i} ({kind}): {e}"
            try:
                link_hint = getattr(item, "permalink", None) or getattr(getattr(item, "submission", None), "permalink", None)
                if link_hint:
                    msg += f"\n       Link: https://www.reddit.com{link_hint}"
            except Exception:
                pass
            print(msg)
            continue

    return list(seen.keys())

# --- Output helpers -----------------------------------------------------------

def save_links_txt(links: Iterable[str], path: Optional[str] = None) -> str:
    """
    Save links to a newline-delimited text file. If `path` is None,
    a dated filename is created in the current working directory.
    Returns the written path.
    """
    if path is None:
        path = f"reddit_saved_post_links_{datetime.utcnow().date().isoformat()}.txt"
    with open(path, "w", encoding="utf-8") as f:
        for url in links:
            f.write(str(url).rstrip() + "\n")
    return path

# --- CLI ---------------------------------------------------------------------

def _main():
    import argparse
    p = argparse.ArgumentParser(description="Fetch saved Reddit post links")
    p.add_argument("--username", help="Reddit username (defaults to env)")
    p.add_argument("--limit", type=int, default=None, help="Max saved items to scan")
    p.add_argument("--out", help="Write links to this .txt file")
    args = p.parse_args()

    links = fetch_saved_post_links(username=args.username, limit=args.limit)
    if args.out:
        out_path = save_links_txt(links, args.out)
        print(f"Wrote {len(links)} links to {out_path}")
    else:
        # Print to stdout
        for url in links:
            print(url)

if __name__ == "__main__":
    _main()
