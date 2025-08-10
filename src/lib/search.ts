// Chooses between two prebuilt FlexSearch indexes: with or without comments
export async function loadSearch(withComments: boolean) {
    const url = withComments
        ? '/data/indexes/search-with-comments.json'
        : '/data/indexes/search-no-comments.json';
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
}