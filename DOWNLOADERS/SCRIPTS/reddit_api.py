# reddit_api.py
import time, requests
from typing import Dict, Optional, Tuple
from oauth_client import RedditOAuth

BASE = "https://oauth.reddit.com"

class RedditAPI:
    def __init__(self, oauth: RedditOAuth):
        self.oauth = oauth

    def _headers(self) -> Dict[str, str]:
        return self.oauth.auth_headers()

    def _request(self, method: str, path: str, params: Optional[Dict]=None, **kw):
        url = path if path.startswith("http") else f"{BASE}{path}"
        while True:
            r = requests.request(method, url, headers=self._headers(), params=params, timeout=60, **kw)
            # Handle occasional 401 (expired token) by refreshing once
            if r.status_code == 401:
                # force refresh and retry exactly once
                self.oauth._token = None
                r = requests.request(method, url, headers=self._headers(), params=params, timeout=60, **kw)

            # Simple rate-limit/backoff: if 429, sleep and retry
            if r.status_code == 429:
                retry = int(r.headers.get("retry-after", "2"))
                time.sleep(max(retry, 2))
                continue

            r.raise_for_status()
            return r

    # --- Common endpoints you likely use ---

    def me(self):
        return self._request("GET", "/api/v1/me").json()

    def get_saved(self, limit: int = 100, after: Optional[str] = None, raw_json:int=1):
        """
        Returns the standard listing JSON for the authenticated user's saved items.
        Use `after` for pagination (value of listing['data']['after']).
        """
        params = {"limit": limit, "raw_json": raw_json}
        if after: params["after"] = after
        return self._request("GET", "/user/me/saved", params=params).json()

    def get_by_id(self, fullname_list_csv: str, raw_json:int=1):
        """
        fullname_list_csv like: 't3_abcdef,t3_ghijkl'. Useful for batching post fetches.
        """
        params = {"id": fullname_list_csv, "raw_json": raw_json}
        return self._request("GET", "/api/info", params=params).json()

    def get_submissions_in_sub(self, subreddit: str, sort="hot", limit=100, after: Optional[str]=None, raw_json:int=1):
        params = {"limit": limit, "raw_json": raw_json}
        if after: params["after"] = after
        path = f"/r/{subreddit}/{sort}"
        return self._request("GET", path, params=params).json()

    def get_comments_for_link(self, link_fullname_or_id: str, depth=3, limit=50, raw_json:int=1):
        """
        link_fullname_or_id can be 't3_abc123' or the base-36 post id 'abc123'.
        """
        # Normalize to base36 id if needed: t3_abc123 -> abc123
        base36 = link_fullname_or_id.split("_")[-1]
        params = {"depth": depth, "limit": limit, "raw_json": raw_json}
        path = f"/comments/{base36}"
        return self._request("GET", path, params=params).json()
