#!/usr/bin/env python3
"""
r2_uploader.py
Upload media files and/or gallery folders to Cloudflare R2 (S3-compatible).

- Input path can contain files and/or "gallery" folders.
- Output prefix must be one of: Gifs, Images, RedGiphys, Videos
- Gallery structure is preserved beneath the prefix:
    Images/<gallery_id>/<filename>
- Single files at the top level are flattened to:
    Images/<post_id>.<ext>

Returns a dictionary with full details of actions (uploaded/skipped/failed),
and for dry runs, the same structure with action="dry-run" entries.

Usage (CLI):
    python r2_uploader.py --input "./MediaToUpload" --prefix Images --dry-run
    python r2_uploader.py --input "./MediaToUpload" --prefix Images --overwrite
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
from pathlib import Path
from typing import Dict, List, Tuple

try:
    # Optional convenience: load .env if present
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()  # safe if missing
except Exception:
    pass

import boto3
from botocore.exceptions import ClientError, BotoCoreError


VALID_PREFIXES = {"Gifs", "Images", "RedGiphys", "Videos"}


def _get_env(key: str, required: bool = True, default: str | None = None) -> str:
    val = os.getenv(key, default)
    if required and not val:
        raise RuntimeError(f"Missing required environment variable: {key}")
    return val  # type: ignore


def get_s3_client():
    """
    Create an S3-compatible client pointed at Cloudflare R2 using env vars:
      R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
    """
    endpoint_url = _get_env("R2_ENDPOINT")
    access_key = _get_env("R2_ACCESS_KEY_ID")
    secret_key = _get_env("R2_SECRET_ACCESS_KEY")

    session = boto3.session.Session()
    s3 = session.client(
        service_name="s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )
    return s3


def _plan_objects(input_path: Path, prefix: str) -> List[Tuple[Path, str]]:
    """
    Build a list of (local_file_path, r2_object_key) to upload.

    Rules:
      - Files directly under input_path ⇒ {prefix}/{stem}{suffix}
      - Files inside any immediate subdirectory D (gallery) ⇒
            {prefix}/{D.name}/{relative_path_inside_D}
      - Nested folders inside a gallery are preserved under {D.name}/...
    """
    plans: List[Tuple[Path, str]] = []

    # Top-level files
    for p in input_path.iterdir():
        if p.is_file():
            # Flatten: <prefix>/<post_id>.<ext> where post_id == stem
            r2_key = f"{prefix}/{p.stem}{p.suffix}"
            plans.append((p, r2_key))

    # Gallery folders (immediate subdirs)
    for d in [x for x in input_path.iterdir() if x.is_dir()]:
        root_name = d.name
        for f in d.rglob("*"):
            if f.is_file():
                rel = f.relative_to(d).as_posix()
                r2_key = f"{prefix}/{root_name}/{rel}"
                plans.append((f, r2_key))

    return plans


def _guess_content_type(path: Path) -> str | None:
    ctype, _ = mimetypes.guess_type(str(path))
    return ctype


def _object_exists(s3, bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        code = str(e.response.get("ResponseMetadata", {}).get("HTTPStatusCode", ""))
        if code == "404" or e.response.get("Error", {}).get("Code") in {"404", "NoSuchKey"}:
            return False
        # Any other error, bubble up — likely permissions/endpoint/etc.
        raise


def upload_media(
    input_path: str | Path,
    r2_prefix: str,
    dry_run: bool = False,
    overwrite: bool = False,
) -> Dict:
    """
    Upload media (files and gallery folders) under `input_path` to Cloudflare R2,
    placing objects under the given top-level `r2_prefix`.

    Returns a dict detailing planned and/or completed actions.
    """
    if r2_prefix not in VALID_PREFIXES:
        raise ValueError(f"prefix must be one of {sorted(VALID_PREFIXES)}")

    input_path = Path(input_path).resolve()
    if not input_path.exists() or not input_path.is_dir():
        raise FileNotFoundError(f"Input path not found or not a directory: {input_path}")

    bucket = _get_env("R2_BUCKET")
    s3 = None if dry_run else get_s3_client()

    plans = _plan_objects(input_path, r2_prefix)

    report = {
        "bucket": bucket,
        "prefix": r2_prefix,
        "input_path": str(input_path),
        "dry_run": bool(dry_run),
        "overwrite": bool(overwrite),
        "planned": [],   # everything we intend to put
        "uploaded": [],  # actually uploaded (or would_upload in dry_run)
        "skipped": [],   # existed and overwrite=False
        "failed": [],    # errors
        "summary": {
            "planned": 0,
            "uploaded": 0,
            "skipped": 0,
            "failed": 0,
            "bytes_uploaded": 0,
            "bytes_planned": 0,
        },
    }

    # Add planned
    for lp, key in plans:
        size = lp.stat().st_size
        report["planned"].append(
            {"local": str(lp), "r2_key": key, "bytes": size, "content_type": _guess_content_type(lp)}
        )
        report["summary"]["planned"] += 1
        report["summary"]["bytes_planned"] += size

    # Execute (or simulate)
    for lp, key in plans:
        size = lp.stat().st_size
        ctype = _guess_content_type(lp)
        entry = {"local": str(lp), "r2_key": key, "bytes": size, "content_type": ctype}

        try:
            if dry_run:
                # Record as "would upload"
                entry["action"] = "dry-run"
                report["uploaded"].append(entry)
                report["summary"]["uploaded"] += 1
                continue

            # Real upload flow
            exists = _object_exists(s3, bucket, key)
            if exists and not overwrite:
                entry["reason"] = "exists"
                report["skipped"].append(entry)
                report["summary"]["skipped"] += 1
                continue

            extra = {}
            if ctype:
                extra["ContentType"] = ctype

            # Use upload_file for multipart robustness
            s3.upload_file(Filename=str(lp), Bucket=bucket, Key=key, ExtraArgs=extra or None)

            report["uploaded"].append(entry)
            report["summary"]["uploaded"] += 1
            report["summary"]["bytes_uploaded"] += size

        except (ClientError, BotoCoreError, OSError) as e:
            entry["error"] = repr(e)
            report["failed"].append(entry)
            report["summary"]["failed"] += 1

    return report


def main():
    parser = argparse.ArgumentParser(description="Upload media/galleries to Cloudflare R2.")
    parser.add_argument("--input", required=True, help="Path to a folder containing files and/or gallery subfolders")
    parser.add_argument("--prefix", required=True, choices=sorted(VALID_PREFIXES),
                        help="Top-level destination: one of Gifs, Images, RedGiphys, Videos")
    parser.add_argument("--dry-run", action="store_true", help="Plan only; do not upload")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing objects if present")
    parser.add_argument("--print-json", action="store_true", help="Pretty-print the result JSON to stdout")
    args = parser.parse_args()

    result = upload_media(
        input_path=args.input,
        r2_prefix=args.prefix,
        dry_run=args.dry_run,
        overwrite=args.overwrite,
    )

    if args.print_json:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
