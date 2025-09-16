# oauth_client.py
import os, time, base64, requests
from typing import Dict, Optional

class RedditOAuth:
    TOKEN_URL = "https://www.reddit.com/api/v1/access_token"

    def __init__(self,
                 client_id: str,
                 client_secret: str,
                 username: str,
                 password: str,
                 user_agent: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.username = username
        self.password = password
        self.user_agent = user_agent
        self._token: Optional[str] = None
        self._token_expiry = 0

    @classmethod
    def from_env(cls) -> "RedditOAuth":
        def req(name: str) -> str:
            v = os.getenv(name, "").strip()
            if not v:
                raise RuntimeError(f"Missing env var: {name}")
            return v
        return cls(
            client_id=req("REDDIT_CLIENT_ID"),
            client_secret=req("REDDIT_CLIENT_SECRET"),
            username=req("REDDIT_USERNAME"),
            password=req("REDDIT_PASSWORD"),
            user_agent=os.getenv("REDDIT_USER_AGENT", "SavedRedditJSON/1.0").strip()
        )

    def _fetch_token(self) -> None:
        auth = requests.auth.HTTPBasicAuth(self.client_id, self.client_secret)
        data = {
            "grant_type": "password",
            "username": self.username,
            "password": self.password,
        }
        headers = {"User-Agent": self.user_agent}
        r = requests.post(self.TOKEN_URL, auth=auth, data=data, headers=headers, timeout=30)
        r.raise_for_status()
        js = r.json()
        self._token = js["access_token"]
        # expires_in is typically 3600
        self._token_expiry = time.time() + int(js.get("expires_in", 3600)) * 0.9  # refresh a bit early

    def access_token(self) -> str:
        if not self._token or time.time() >= self._token_expiry:
            self._fetch_token()
        return self._token

    def auth_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"bearer {self.access_token()}",
            "User-Agent": self.user_agent,
        }
