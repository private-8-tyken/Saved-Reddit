import{B as o,j as r}from"./base.LUk68UGw.js";import{r as n}from"./index.RH_Wq4ov.js";function s(t){return t?new Date(t*1e3).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"}):""}function l(t){if(!t)return null;try{const i=t.split("/").filter(Boolean),e=i.findIndex(a=>a==="comments");if(e!==-1&&i[e+1]){const a=i[e+1];return a.startsWith("t3_")?a:`t3_${a}`}}catch{}return null}function m(){const[t,i]=n.useState([]);return n.useEffect(()=>{fetch(`${o}data/indexes/posts-manifest.json`).then(e=>e.json()).then(e=>e.sort((a,d)=>(d.created_utc??0)-(a.created_utc??0))).then(i).catch(e=>console.error("Failed to load manifest",e))},[]),t.length?r.jsxs("div",{className:"feed",children:[t.map(e=>{const a=e.id||l(e.permalink);return a?r.jsxs("article",{className:"post-card",children:[r.jsxs("div",{className:"topline",children:[r.jsxs("a",{className:"subreddit",href:`https://www.reddit.com/r/${e.subreddit}`,target:"_blank",rel:"noreferrer noopener",children:["r/",e.subreddit]}),r.jsx("span",{className:"dot",children:"•"}),r.jsxs("span",{className:"by",children:["Posted by ",r.jsxs("span",{className:"author",children:["u/",e.author]})]}),e.created_utc&&r.jsxs(r.Fragment,{children:[r.jsx("span",{className:"dot",children:"•"}),r.jsx("time",{dateTime:new Date(e.created_utc*1e3).toISOString(),children:s(e.created_utc)})]})]}),r.jsxs("h2",{className:"title",children:[r.jsx("a",{href:`${o}post/${a}`,children:e.title}),e.flair&&r.jsx("span",{className:"flair",children:e.flair}),e.media_type&&r.jsx("span",{className:"pill",children:e.media_type})]}),e.media_preview&&r.jsx("a",{href:`${o}post/${a}`,className:"media-wrap",children:r.jsx("img",{src:e.media_preview,alt:"",loading:"lazy",width:e.preview_width||void 0,height:e.preview_height||void 0})}),e.selftext_preview&&r.jsx("p",{className:"excerpt",children:e.selftext_preview}),e.link_domain&&e.url&&r.jsxs("a",{className:"link-card",href:e.url,target:"_blank",rel:"noreferrer noopener",title:e.url,children:[r.jsx("div",{className:"link-domain",children:e.link_domain}),r.jsx("div",{className:"link-cta",children:"Open link ↗"})]}),r.jsxs("div",{className:"bottomline",children:[r.jsxs("span",{className:"score",children:["▲ ",e.score??0]}),r.jsx("span",{className:"dot",children:"•"}),r.jsxs("span",{className:"comments",children:["💬 ",e.num_comments??0]}),r.jsx("span",{className:"spacer"}),e.permalink&&r.jsx("a",{className:"action",href:e.permalink,target:"_blank",rel:"noreferrer noopener",children:"View on Reddit"}),r.jsx("a",{className:"action",href:`${o}post/${a}`,children:"Details"}),e.saved_utc&&r.jsxs("span",{className:"saved",children:["Saved ",s(e.saved_utc)]})]})]},a):null}),r.jsx("style",{children:`
        :root {
          --bg: #0b1416;
          --card: #1a1a1b;
          --card-hover: #1f1f20;
          --border: #343536;
          --border-hover: #4a4c4f;
          --text: #d7dadc;
          --meta: #818384;
          --link: #3aa0ff;
          --link-visited: #a970ff;
          --badge: #343536;
        }
        .feed {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          max-width: 860px;
          margin: 24px auto;
          padding: 0 12px;
          color: var(--text);
        }
        .post-card {
          border: 1px solid var(--border);
          background: var(--card);
          border-radius: 8px;
          padding: 12px;
          transition: background .15s ease, border-color .15s ease;
        }
        .post-card:hover { background: var(--card-hover); border-color: var(--border-hover); }
        .topline, .bottomline {
          display: flex; align-items: center; gap: 8px;
          color: var(--meta); font-size: 12px; line-height: 1;
        }
        .topline { margin-bottom: 6px; }
        .bottomline { margin-top: 8px; flex-wrap: wrap; }
        .spacer { flex: 1; min-width: 8px; }
        .dot { opacity: .9; }
        .subreddit { color: var(--text); text-decoration: none; font-weight: 600; }
        .subreddit:hover { text-decoration: underline; }
        .author { color: var(--meta); }
        .title {
          display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
          font-size: 1rem; font-weight: 600; margin: 2px 0 6px; line-height: 1.25;
        }
        .title a { color: var(--text); text-decoration: none; }
        .title a:hover { text-decoration: underline; }
        .title a:visited { color: var(--link-visited); }
        .flair {
          background: var(--badge); color: var(--text);
          border-radius: 4px; padding: 2px 6px; font-size: 11px;
        }
        .pill {
          background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
          color: var(--text); border-radius: 999px; padding: 2px 8px; font-size: 11px; opacity: .9;
        }
        .media-wrap {
          display: block; border-radius: 6px; overflow: hidden;
          border: 1px solid rgba(255,255,255,.08); margin: 6px 0 8px;
        }
        .media-wrap img { display: block; width: 100%; max-height: 360px; object-fit: cover; }
        .excerpt {
          margin: 4px 0 8px; font-size: 14px; line-height: 1.45; color: #c9d1d9;
          display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap;
        }
        .link-card {
          display: flex; justify-content: space-between; align-items: center;
          border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03);
          border-radius: 6px; padding: 10px 12px; text-decoration: none; color: var(--text); margin-top: 6px;
        }
        .link-card:hover { border-color: rgba(255,255,255,.2); }
        .link-domain { font-size: 12px; color: var(--meta); }
        .link-cta { font-size: 12px; color: var(--text); }
        .score, .comments { color: var(--meta); }
        .action { color: var(--link); text-decoration: none; }
        .action:hover { text-decoration: underline; }
        .saved { color: var(--meta); }
        @media (min-width: 900px) { .feed { grid-template-columns: 1fr 1fr; } }
      `})]}):r.jsx("div",{className:"feed loading",children:"Loading…"})}export{m as default};
