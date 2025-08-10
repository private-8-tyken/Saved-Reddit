# My Reddit Archive (Astro)

**Run locally**
```bash
npm i
# drop your per-post JSONs into data/posts/*.json
npm run dev
```

**Build & deploy**
```bash
npm run build  # creates data/indexes/* and dist/
```
Push to `main` and GitHub Actions will deploy to `gh-pages`.

**Notes**
- Comments are *optional* in search: toggle via the "Include comments" checkbox.
- Media embeds are intentionally disabled for now; link cards are shown for link posts.
- URL encodes filters; pages are static for speed.
