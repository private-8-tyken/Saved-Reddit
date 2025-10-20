# r2_audit.py
"""
Audit local media files (including gallery subfolders) against Cloudflare R2 keys.

Supports recursive matching of both:
  - post_id.jpeg
  - post_id/01.jpeg (gallery folders)

Automatically loads .env credentials if present in the working directory or project root.

Usage (in Jupyter or scripts):
    from pathlib import Path
    from SCRIPTS.r2_audit import audit_local_vs_r2

    results = audit_local_vs_r2(
        local_root=Path("Out/media_files"),
        r2_prefixes=["Images", "RedGiphys", "Gifs", "Videos"],
        write_csv_to=Path("Media/__reports/r2_audit.csv"),
        show_progress=True
    )
"""

from __future__ import annotations

import os
import csv
from pathlib import Path
from collections import defaultdict, Counter
from typing import Iterable, Optional, Dict, Any, List, Tuple

import boto3
from botocore.config import Config

# ✅ Auto-load .env credentials (local or project root)
try:
    from dotenv import load_dotenv

    for candidate in [Path(".env"), Path(__file__).resolve().parent.parent / ".env"]:
        if candidate.exists():
            load_dotenv(candidate, override=False)
            break
except Exception:
    pass

try:
    from tqdm import tqdm as _tqdm
except Exception:
    _tqdm = None


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _posix_rel(local_path: Path, root: Path) -> str:
    """Relative path with forward slashes (S3-style)."""
    return local_path.relative_to(root).as_posix()


def _make_key(prefix: str, rel: str) -> str:
    """Join normalized prefix with relative path."""
    prefix = (prefix or "").strip().strip("/")
    return f"{prefix}/{rel}" if prefix else rel


def _list_remote_objects(s3, bucket: str, prefix: Optional[str] = None) -> Dict[str, Any]:
    """Return {key: s3_object_dict} for the given (optional) prefix."""
    paginator = s3.get_paginator("list_objects_v2")
    kwargs = {"Bucket": bucket}
    if prefix:
        kwargs["Prefix"] = prefix
    by_key: Dict[str, Any] = {}
    for page in paginator.paginate(**kwargs):
        for obj in page.get("Contents", []):
            by_key[obj["Key"]] = obj
    return by_key


def _split_dir_stem_ext(key: str) -> Tuple[str, str, str, str]:
    """
    Return (dir_with_trailing_slash_or_empty, stem, ext_with_dot_or_empty, filename).
    For example:
        "Images/abc/01.jpeg" -> ("Images/abc/", "01", ".jpeg", "01.jpeg")
        "Images/abc.jpeg"    -> ("Images/", "abc", ".jpeg", "abc.jpeg")
    """
    if "/" in key:
        d, fname = key.rsplit("/", 1)
        d += "/"
    else:
        d, fname = "", key
    if "." in fname:
        st, ex = fname.rsplit(".", 1)
        return d, st, "." + ex.lower(), fname
    else:
        return d, fname, "", fname


def _resolve_prefixes(r2_prefixes: Optional[Iterable[str]]) -> List[str]:
    """Resolve prefixes from args → env → default."""
    if r2_prefixes:
        return [p.strip().strip("/") for p in r2_prefixes if str(p).strip()]

    env_multi = os.getenv("R2_PREFIXES")
    if env_multi:
        return [p.strip().strip("/") for p in env_multi.split(",") if p.strip()]

    env_single = (os.getenv("R2_PREFIX") or "").strip().strip("/")
    if env_single:
        return [env_single]

    # default set
    return ["Images", "RedGiphys", "Gifs", "Videos"]


def _resolve_env_default(value: Optional[str], env_name: str) -> Optional[str]:
    return value if value else os.getenv(env_name)


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

def audit_local_vs_r2(
    local_root: Path | str,
    *,
    r2_bucket: Optional[str] = None,
    r2_endpoint: Optional[str] = None,
    r2_access_key_id: Optional[str] = None,
    r2_secret_access_key: Optional[str] = None,
    r2_region: Optional[str] = None,
    r2_prefixes: Optional[Iterable[str]] = None,
    write_csv_to: Optional[Path | str] = None,
    show_progress: bool = False,
) -> Dict[str, Any]:
    """
    Compare local files (recursively) under `local_root` against Cloudflare R2 keys across prefixes.
    """

    root = Path(local_root).resolve()
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"Local images root not found or not a directory: {root}")

    endpoint = _resolve_env_default(r2_endpoint, "R2_ENDPOINT")
    access_key = _resolve_env_default(r2_access_key_id, "R2_ACCESS_KEY_ID")
    secret_key = _resolve_env_default(r2_secret_access_key, "R2_SECRET_ACCESS_KEY")
    bucket = _resolve_env_default(r2_bucket, "R2_BUCKET")
    region = r2_region or os.getenv("R2_REGION", "auto")
    prefixes = _resolve_prefixes(r2_prefixes)

    missing = [name for name, val in [
        ("R2_ENDPOINT", endpoint),
        ("R2_ACCESS_KEY_ID", access_key),
        ("R2_SECRET_ACCESS_KEY", secret_key),
        ("R2_BUCKET", bucket),
    ] if not val]
    if missing:
        raise ValueError(f"Missing required R2 config/env vars: {', '.join(missing)}")

    # Connect to R2
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        config=Config(signature_version="s3v4"),
    )

    # Pull remote index
    remote_by_key: Dict[str, Any] = {}
    by_dir_stem: Dict[Tuple[str, str], List[Tuple[str, str]]] = defaultdict(list)
    prefix_key_counts: Counter[str] = Counter()

    for pref in prefixes:
        pref_norm = pref.strip().strip("/")
        submap = _list_remote_objects(s3, bucket, pref_norm if pref_norm else None)
        remote_by_key.update(submap)
        prefix_key_counts[pref_norm or "(root)"] += len(submap)

    for key in remote_by_key:
        d, st, ex, _ = _split_dir_stem_ext(key)
        by_dir_stem[(d, st)].append((key, ex))

    rows: List[Dict[str, Any]] = []
    totals: Counter[str] = Counter()
    per_prefix_exact: Counter[str] = Counter()
    per_prefix_same_stem: Counter[str] = Counter()

    local_files = [p for p in root.rglob("*") if p.is_file()]
    iterator = local_files
    if show_progress and _tqdm is not None:
        iterator = _tqdm(local_files, total=len(local_files), unit="file", desc="Auditing")

    for local in iterator:
        local_rel = _posix_rel(local, root)
        local_ext = (("." + local.suffix.lower().lstrip(".")) if local.suffix else "").lower()
        expected_keys = [_make_key(pref, local_rel) for pref in prefixes]

        matched = False
        match_type = "missing"
        matched_prefix = ""
        matched_key = ""
        remote_ext = ""
        same_ext = False
        note = ""

        # Exact match
        for pref, key in zip(prefixes, expected_keys):
            if key in remote_by_key:
                matched = True
                match_type = "exact"
                matched_prefix = pref
                matched_key = key
                _, _, remote_ext, _ = _split_dir_stem_ext(key)
                same_ext = (remote_ext == local_ext)
                note = "exact_match"
                totals["exact"] += 1
                per_prefix_exact[pref or "(root)"] += 1
                break

        # Same-stem match
        if not matched:
            for pref, key in zip(prefixes, expected_keys):
                parent_dir, stem, _, _ = _split_dir_stem_ext(key)
                candidates = by_dir_stem.get((parent_dir, stem), [])
                if candidates:
                    alt_key, remote_ext = candidates[0]
                    matched = True
                    match_type = "same_stem"
                    matched_prefix = pref
                    matched_key = alt_key
                    same_ext = (remote_ext == local_ext)
                    note = "found_same_stem_same_ext" if same_ext else "found_same_stem_diff_ext"
                    totals["same_stem"] += 1
                    per_prefix_same_stem[pref or "(root)"] += 1
                    break

        if not matched:
            totals["missing"] += 1
            note = "missing"

        rows.append({
            "local_rel": local_rel,
            "local_ext": local_ext or "",
            "all_expected_keys": " | ".join(expected_keys),
            "matched": matched,
            "match_type": match_type,
            "matched_prefix": matched_prefix or "",
            "matched_key": matched_key,
            "remote_ext": remote_ext or "",
            "same_ext": same_ext,
            "note": note,
        })

    # Write CSV if requested
    csv_path: Optional[Path] = None
    if write_csv_to is not None:
        write_csv_to = Path(write_csv_to)
        csv_path = write_csv_to / "r2_audit.csv" if write_csv_to.is_dir() else write_csv_to
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        header = [
            "local_rel", "local_ext", "all_expected_keys",
            "matched", "match_type", "matched_prefix", "matched_key",
            "remote_ext", "same_ext", "note",
        ]
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=header)
            w.writeheader()
            w.writerows(rows)

    return {
        "total_files": len(rows),
        "totals": totals,
        "per_prefix_exact": per_prefix_exact,
        "per_prefix_same_stem": per_prefix_same_stem,
        "prefix_key_counts": prefix_key_counts,
        "rows": rows,
        "csv_path": csv_path,
        "config": {
            "local_root": str(root),
            "bucket": bucket,
            "endpoint": endpoint,
            "region": region,
            "prefixes": prefixes,
        },
    }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:  # pragma: no cover
    import argparse
    ap = argparse.ArgumentParser(description="Audit local media against Cloudflare R2")
    ap.add_argument("--local-root", required=True, help="Path to local media root")
    ap.add_argument("--prefixes", default=None, help="Comma-separated list of prefixes")
    ap.add_argument("--csv", default=None, help="Write CSV to this file or directory")
    ap.add_argument("--progress", action="store_true", help="Show progress bar")

    args = ap.parse_args()
    prefixes = [p.strip() for p in args.prefixes.split(",")] if args.prefixes else None

    res = audit_local_vs_r2(
        local_root=Path(args.local_root),
        r2_prefixes=prefixes,
        write_csv_to=(Path(args.csv) if args.csv else None),
        show_progress=args.progress,
    )

    cfg = res["config"]
    totals = res["totals"]

    print(f"Local root: {cfg['local_root']}")
    print(f"Bucket: {cfg['bucket']}")
    print(f"Endpoint: {cfg['endpoint']}")
    print("Prefixes:", [p or '(root)' for p in cfg['prefixes']])
    print("\nRemote objects per prefix:")
    for p in cfg['prefixes']:
        key = p or "(root)"
        print(f"  {key}: {res['prefix_key_counts'][key]}")

    print(f"\nLocal files scanned: {res['total_files']}")
    print(f"  Exact matches:      {totals.get('exact', 0)}")
    print(f"  Same-stem matches:  {totals.get('same_stem', 0)}")
    print(f"  Missing:            {totals.get('missing', 0)}")

    if res["csv_path"]:
        print(f"\nCSV written: {res['csv_path']}")


if __name__ == "__main__":
    main()
