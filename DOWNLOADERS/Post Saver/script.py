import os, re, sys, csv, json, time, random, argparse, subprocess
import requests
from urllib.parse import urlparse, urljoin
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Reddit-Archiver/JSON"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})

def safe_name(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"[^\w\-. ]+", "_", s)
    return re.sub(r"\s+", " ", s)[:200] or "reddit"

def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def request_with_backoff(method: str, url: str, *, max_retries=5, timeout=30, stream=False, headers=None):
    attempt = 0
    while True:
        try:
            resp = SESSION.request(method, url, timeout=timeout, stream=stream, headers=headers)
        except requests.RequestException as e:
            if attempt >= max_retries: raise
            sleep = min(60, 2 ** attempt) + random.uniform(0, 0.5)
            print(f"Network error {e}; retrying in {sleep:.1f}s …")
            time.sleep(sleep); attempt += 1; continue

        if resp.status_code == 429 or 500 <= resp.status_code < 600:
            if attempt >= max_retries: resp.raise_for_status()
            retry_after = resp.headers.get("Retry-After")
            if retry_after is not None:
                try: sleep = float(retry_after)
                except ValueError: sleep = 10.0
            else:
                sleep = min(60, 2 ** attempt) + random.uniform(0, 0.5)
            print(f"{resp.status_code} on {url} → retrying in {sleep:.1f}s …")
            time.sleep(sleep); attempt += 1; continue

        if 400 <= resp.status_code < 500:
            resp.raise_for_status()
        return resp

def fetch_post_and_comments(url: str, *, max_retries=5):
    if not url.startswith(("http://", "https://")):
        raise ValueError(f"Not a URL: {url}")
    u = url
    if not u.endswith("/"): u += "/"
    if not u.endswith(".json"): u += ".json"
    r = request_with_backoff("GET", u, max_retries=max_retries, timeout=30)
    data = r.json()
    if not (isinstance(data, list) and len(data) >= 2):
        raise RuntimeError("Unexpected Reddit JSON format")
    post_listing = data[0]["data"]["children"]
    if not post_listing:
        raise RuntimeError("Post listing empty")
    post = post_listing[0]["data"]
    comments_listing = data[1]
    return post, comments_listing, data

def extract_comments(listing_node, *, max_depth=2, max_count=1000):
    collected = []
    def walk(node, depth, remaining):
        if remaining[0] <= 0 or depth > max_depth: return
        if not isinstance(node, dict): return
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
                "permalink": "https://www.reddit.com" + data.get("permalink", ""),
                "is_submitter": data.get("is_submitter"),
                "parent_id": data.get("parent_id"),
                "replies": []
            }
            replies = data.get("replies")
            if replies and isinstance(replies, dict):
                children = replies.get("data", {}).get("children", [])
                for ch in children:
                    if remaining[0] <= 0: break
                    child_obj = walk(ch, depth + 1, remaining)
                    if child_obj: item["replies"].append(child_obj)
            return item
        if kind == "Listing":
            for ch in node.get("data", {}).get("children", []):
                if remaining[0] <= 0: break
                obj = walk(ch, depth, remaining)
                if obj: collected.append(obj)
        return None
    remaining = [max_count]
    walk(listing_node, 1, remaining)
    return collected

def has_ffmpeg() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        return True
    except FileNotFoundError:
        return False

def download_file(url: str, outpath: str, *, max_retries=5):
    with request_with_backoff("GET", url, max_retries=max_retries, timeout=60, stream=True) as r:
        total = int(r.headers.get("Content-Length", 0))
        done = 0; chunk = 1 << 15
        with open(outpath, "wb") as f:
            for part in r.iter_content(chunk_size=chunk):
                if not part: continue
                f.write(part); done += len(part)
                if total:
                    pct = done * 100 // total
                    print(f"\r  {os.path.basename(outpath)}  {pct}% ({done}/{total} bytes)", end="")
        if total: print()

def pick_best_from_mpd(mpd_xml: str):
    root = ET.fromstring(mpd_xml)
    ns = {"mpd": root.tag.split('}')[0].strip('{')} if '}' in root.tag else {}
    def fa(elem, path): return elem.findall(path, ns) if ns else elem.findall(path)
    base_urls = fa(root, ".//mpd:BaseURL") if ns else root.findall(".//BaseURL")
    base_url = base_urls[0].text.strip() if base_urls else ""
    best_video = (0, None); best_audio = (0, None)
    for aset in fa(root, ".//mpd:AdaptationSet") if ns else root.findall(".//AdaptationSet"):
        mime = aset.get("mimeType", "")
        for rep in fa(aset, "mpd:Representation") if ns else aset.findall("Representation"):
            bw = int(rep.get("bandwidth", "0"))
            rep_base = fa(rep, "mpd:BaseURL") if ns else rep.findall("BaseURL")
            if not rep_base: continue
            url = rep_base[0].text.strip()
            if base_url and not url.lower().startswith(("http://", "https://")):
                url = urljoin(base_url, url)
            if mime.startswith("video/") and bw > best_video[0]: best_video = (bw, url)
            elif mime.startswith("audio/") and bw > best_audio[0]: best_audio = (bw, url)
    return best_video[1], best_audio[1]

def classify_media_kind(post: dict) -> str:
    url = (post.get("url_overridden_by_dest") or post.get("url") or "").lower()
    domain = (post.get("domain") or "").lower()
    post_hint = (post.get("post_hint") or "").lower()
    if post.get("is_gallery", False): return "gallery"
    if "v.redd.it" in url or \
       (post.get("secure_media") and post["secure_media"].get("reddit_video")) or \
       (post.get("media") and post["media"].get("reddit_video")) or \
       bool(post.get("crosspost_parent_list")):
        return "video"
    if post_hint == "image" or domain in ("i.redd.it", "i.reddituploads.com"): return "image"
    if post.get("is_self", False): return "self"
    return "external"

def download_image(post: dict, base_dir: str, *, max_retries=5):
    media = {"kind": "image", "files": []}
    url = post.get("url_overridden_by_dest") or post.get("url")
    if not url: return media
    ext = os.path.splitext(urlparse(url).path)[1] or ".jpg"
    path = os.path.join(base_dir, f"image{ext}")
    print(f"Downloading image → {path}")
    download_file(url, path, max_retries=max_retries)
    media["files"].append(path); return media

def download_gallery(post: dict, base_dir: str, *, max_retries=5):
    media = {"kind": "gallery", "files": []}
    media_meta = post.get("media_metadata", {})
    gallery_data = post.get("gallery_data", {}).get("items", [])
    if not media_meta or not gallery_data: return media
    for i, item in enumerate(gallery_data, 1):
        meta = media_meta[item["media_id"]]
        candidate = (meta["p"][-1]["u"] if ("p" in meta and meta["p"]) else meta["s"]["u"]).replace("&amp;", "&")
        ext = ".jpg"; mt = meta.get("s", {}).get("m", "")
        if "png" in mt: ext = ".png"
        elif "gif" in mt: ext = ".gif"
        path = os.path.join(base_dir, f"{i:02d}{ext}")
        print(f"Downloading gallery item {i} → {path}")
        download_file(candidate, path, max_retries=max_retries)
        media["files"].append(path)
    return media

def download_video(post: dict, base_dir: str, *, max_retries=5):
    media = {"kind": "video", "files": [], "merged": None}
    title = safe_name(post.get("title", "video"))
    rv = None
    if post.get("secure_media") and post["secure_media"].get("reddit_video"):
        rv = post["secure_media"]["reddit_video"]
    elif post.get("media") and post["media"].get("reddit_video"):
        rv = post["media"]["reddit_video"]
    elif post.get("crosspost_parent_list"):
        for p in post["crosspost_parent_list"]:
            if p.get("secure_media") and p["secure_media"].get("reddit_video"):
                rv = p["secure_media"]["reddit_video"]; break
            if p.get("media") and p["media"].get("reddit_video"):
                rv = p["media"]["reddit_video"]; break

    dash_url = rv.get("dash_url") if rv else None
    fallback = rv.get("fallback_url") if rv else None
    if not dash_url:
        url = post.get("url_overridden_by_dest") or post.get("url", "")
        if "v.redd.it" in url:
            dash_url = url.rstrip("/") + "/DASHPlaylist.mpd"

    if dash_url:
        print(f"Fetching DASH manifest: {dash_url}")
        r = request_with_backoff("GET", dash_url, max_retries=max_retries, timeout=30)
        if r.status_code == 403:
            r = request_with_backoff("GET", dash_url.replace("https://", "http://"), max_retries=max_retries, timeout=30)
        v_url, a_url = pick_best_from_mpd(r.text)
        v_path = os.path.join(base_dir, f"{title}.video.mp4")
        a_path = os.path.join(base_dir, f"{title}.audio.mp4")
        if v_url:
            print(f"Downloading best video → {v_path}")
            download_file(v_url, v_path, max_retries=max_retries); media["files"].append(v_path)
        if a_url:
            print(f"Downloading best audio → {a_path}")
            download_file(a_url, a_path, max_retries=max_retries); media["files"].append(a_path)
        if a_url:
            if not has_ffmpeg(): raise RuntimeError("FFmpeg not found to merge audio+video.")
            out = os.path.join(base_dir, f"{title}.mp4")
            print("Merging A+V with ffmpeg…")
            subprocess.run(["ffmpeg","-y","-i",v_path,"-i",a_path,"-c","copy",out],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            try: os.remove(v_path); os.remove(a_path)
            except Exception: pass
            media["merged"] = out; return media
        if v_url:
            final = os.path.join(base_dir, f"{title}.mp4")
            os.replace(v_path, final); media["merged"] = final; return media

    if fallback:
        out = os.path.join(base_dir, f"{title}.mp4")
        print(f"Downloading fallback MP4 (may be muted) → {out}")
        download_file(fallback, out, max_retries=max_retries)
        media["merged"] = out
    return media

def make_archive_object(post: dict, comments_listing: dict, *, include_comments=True, comments_depth=2, comments_limit=500):
    obj = {
        "archived_at": now_iso(),
        "reddit_fullname": post.get("name"),
        "reddit_id": post.get("id"),
        "permalink": "https://www.reddit.com" + post.get("permalink", ""),
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
        "media": None,
        "external_link": None,
        "raw_post": post,
        "raw_comments": None
    }
    if include_comments:
        obj["comments"] = extract_comments(comments_listing, max_depth=comments_depth, max_count=comments_limit)
        obj["raw_comments"] = comments_listing
    return obj

def archive_one(url: str, *, download_media=True, media_root="media", max_retries=5,
                include_comments=True, comments_depth=2, comments_limit=500):
    post, comments_listing, raw_full = fetch_post_and_comments(url, max_retries=max_retries)
    archive = make_archive_object(post, comments_listing,
                                  include_comments=include_comments,
                                  comments_depth=comments_depth,
                                  comments_limit=comments_limit)
    media_kind = classify_media_kind(post)
    archive["media_kind"] = media_kind
    if download_media:
        base_dir = os.path.join(media_root, post.get('id', 'post'))
        ensure_dir(base_dir)
        if media_kind == "image":
            archive["media"] = download_image(post, base_dir, max_retries=max_retries)
        elif media_kind == "gallery":
            archive["media"] = download_gallery(post, base_dir, max_retries=max_retries)
        elif media_kind == "video":
            archive["media"] = download_video(post, base_dir, max_retries=max_retries)
        elif media_kind == "external":
            archive["external_link"] = post.get("url_overridden_by_dest") or post.get("url")
            archive["media"] = {"kind": "external", "files": []}
        else:
            archive["media"] = {"kind": "self", "files": []}
    else:
        if media_kind == "external":
            archive["external_link"] = post.get("url_overridden_by_dest") or post.get("url")
    return archive

def main():
    p = argparse.ArgumentParser(description="Archive Reddit posts to JSON (raw JSON + nested comments).")
    p.add_argument("-u","--url", help="Single Reddit post URL")
    p.add_argument("-c","--csv", dest="in_csv", default="videos.csv", help="CSV with one Reddit URL per line")
    p.add_argument("-d","--outdir", default="json_archive", help="Root directory for per-post JSON files")
    p.add_argument("--jsonl", default=None, help="Also append each post as one JSON line to this file")
    p.add_argument("--media-dir", default="media", help="Where to save media assets")
    p.add_argument("--no-media", action="store_true", help="Skip media downloads")
    p.add_argument("--comments-depth", type=int, default=2, help="Nested comment depth to include")
    p.add_argument("--comments-limit", type=int, default=500, help="Max comments to include (total)")
    p.add_argument("--delay", type=float, default=2.0, help="Seconds between posts")
    p.add_argument("--batch-size", type=int, default=25, help="Posts per batch")
    p.add_argument("--batch-pause", type=int, default=90, help="Seconds to sleep between batches")
    p.add_argument("--max-retries", type=int, default=5, help="HTTP retries on 429/5xx")
    args, _ = p.parse_known_args()

    ensure_dir(args.outdir)
    ensure_dir(args.media_dir)

    # Subfolder routing for JSON outputs:
    # - media/     (image|gallery|video)
    # - external/  (external link only)
    # - text/      (self/no media)
    def select_bucket(media_kind: str) -> str:
        if media_kind in ("image", "gallery", "video"):
            return "media"
        if media_kind == "external":
            return "external"
        return "text"

    def write_json_file(archive_obj):
        rid = archive_obj.get("reddit_id") or "post"
        fname = f"{rid}.json"
        bucket = select_bucket(archive_obj.get("media_kind"))
        outdir_bucket = os.path.join(args.outdir, bucket)
        ensure_dir(outdir_bucket)
        path = os.path.join(outdir_bucket, fname)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(archive_obj, f, ensure_ascii=False, indent=2)
        if args.jsonl:
            with open(args.jsonl, "a", encoding="utf-8") as jf:
                jf.write(json.dumps(archive_obj, ensure_ascii=False) + "\n")
        print(f"Saved JSON → {path}")

    def process_one(link: str, idx: int):
        print(f"\n[{idx}] >>> {link}")
        try:
            obj = archive_one(
                link,
                download_media=(not args.no_media),
                media_root=args.media_dir,
                max_retries=args.max_retries,
                include_comments=True,
                comments_depth=args.comments_depth,
                comments_limit=args.comments_limit
            )
            write_json_file(obj)
        except Exception as e:
            print(f"Failed {link}: {e}")

    if args.url:
        process_one(args.url, 1)
        return

    if os.path.exists(args.in_csv):
        with open(args.in_csv, newline="", encoding="utf-8") as f:
            rows = [row[0].strip() for row in csv.reader(f) if row and row[0].strip() and not row[0].strip().startswith("#")]
        total = len(rows); i = 0
        while i < total:
            batch = rows[i:i+args.batch_size]
            print(f"\nProcessing batch {i//args.batch_size + 1} ({len(batch)} items)…")
            for j, link in enumerate(batch, start=1):
                process_one(link, i + j)
                time.sleep(args.delay)
            i += args.batch_size
            if i < total:
                print(f"\nSleeping {args.batch_pause}s between batches…")
                time.sleep(args.batch_pause)
        return

    link = input("Paste a Reddit post URL: ").strip()
    process_one(link, 1)

if __name__ == "__main__":
    main()
