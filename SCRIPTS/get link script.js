(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const user = (location.pathname.match(/\/user\/([^/]+)/) || [, ''])[1] || 'Successful-Banana-32';

    let after = null, count = 0;
    const postUrls = new Set();

    const toAbs = p => new URL(p, 'https://www.reddit.com').href.replace(/\/$/, '');

    // turn a comment permalink into its parent post URL
    const commentToPost = (permalink) => {
        const u = new URL(permalink, 'https://www.reddit.com');
        const parts = u.pathname.split('/').filter(Boolean);
        const i = parts.indexOf('comments');
        if (i >= 0 && parts.length >= i + 3) {
            // keep: /r/<sub>/comments/<post_id>/<slug>
            const kept = parts.slice(0, i + 3); // comments, <id>, <slug>
            return new URL('/' + kept.join('/'), 'https://www.reddit.com').href.replace(/\/$/, '');
        }
        return toAbs(permalink);
    };

    while (true) {
        const url = new URL(`/user/${user}/saved.json`, location.origin);
        url.searchParams.set('limit', '100');
        url.searchParams.set('raw_json', '1');
        if (after) {
            url.searchParams.set('after', after);
            url.searchParams.set('count', String(count));
        }

        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const children = (data?.data?.children) || [];
        for (const child of children) {
            const kind = child.kind;
            const d = child.data || {};
            if (kind === 't3' && d.permalink) {
                postUrls.add(toAbs(d.permalink));
            } else if (kind === 't1' && d.permalink) {
                postUrls.add(commentToPost(d.permalink));
            }
        }

        after = data?.data?.after ?? null;
        count += children.length;

        if (!after || children.length === 0) break;
        await wait(400); // gentle pacing
    }

    // download
    const blob = new Blob([[...postUrls].join('\n') + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reddit_saved_post_links_full_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();

    console.log(`Collected ${postUrls.size} unique post links.`);
})();
