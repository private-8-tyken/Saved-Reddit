import{j as e,B as f,a as g}from"./base.LUk68UGw.js";import{r as i}from"./index.RH_Wq4ov.js";function j(s){return s?new Date(s*1e3).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"}):""}function x({c:s,depth:a=0}){const[r,t]=i.useState(!0),o=s.replies&&s.replies.length>0;return e.jsxs("div",{className:"comment",style:{marginLeft:a?12:0},children:[e.jsx("div",{className:"bar","aria-hidden":!0}),e.jsxs("div",{className:"chead",children:[e.jsx("button",{className:"toggle",onClick:()=>t(!r),title:r?"Collapse":"Expand",children:r?"▾":"▸"}),e.jsxs("span",{className:"author",children:["u/",s.author||"unknown"]}),typeof s.score=="number"&&e.jsxs("span",{className:"score",children:["▲ ",s.score]}),s.created_utc&&e.jsx("span",{className:"date",children:j(s.created_utc)})]}),r&&e.jsxs("div",{className:"cbody",children:[e.jsx("div",{className:"text",children:s.body||""}),o&&e.jsx("div",{className:"children",children:s.replies.map(n=>e.jsx(x,{c:n,depth:a+1},n.id))})]})]})}function b({comments:s}){const a=i.useMemo(()=>{let r=0;const t=o=>o?.forEach(n=>{r++,t(n.replies||[])});return t(s||[]),r},[s]);return!s||s.length===0?e.jsx("div",{className:"empty",children:"No comments."}):e.jsxs("div",{className:"ctree",children:[e.jsx("div",{className:"ctools",children:e.jsxs("span",{className:"meta",children:[a," comment",a===1?"":"s"," loaded"]})}),s.map(r=>e.jsx(x,{c:r},r.id)),e.jsx("style",{children:`
        .ctools { display:flex; gap:12px; align-items:center; color:#818384; font-size:12px; margin: 8px 0; }
        .empty { color:#818384; font-size: 13px; }
        .comment { position: relative; padding-left: 10px; margin: 6px 0; }
        .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,.08); border-radius: 2px; }
        .chead { display:flex; align-items:center; gap:8px; color:#818384; font-size:12px; }
        .toggle { all: unset; cursor: pointer; color:#818384; }
        .toggle:hover { color:#d7dadc; }
        .author { color:#d7dadc; font-weight: 600; }
        .score, .date { color:#818384; }
        .cbody { margin: 4px 0 0; }
        .text { white-space: pre-wrap; font-size: 14px; line-height: 1.45; color:#c9d1d9; }
        .children { margin-top: 6px; }
      `})]})}function p(s){return s?new Date(s*1e3).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"}):""}function w({id:s}){const[a,r]=i.useState(null),[t,o]=i.useState(""),[n,c]=i.useState(!0);i.useEffect(()=>{c(!0),fetch(`${f}data/posts/${s}.json`).then(l=>l.ok?l.json():Promise.reject(new Error(`HTTP ${l.status}`))).then(r).catch(l=>o(`Could not load post ${s}: ${l.message}`)).finally(()=>c(!1))},[s]);const h=a?.title??"",m=a?.link_domain,u=m&&a?.url;return n?e.jsxs("div",{className:"detail-wrap",children:[e.jsx("div",{className:"loading",children:"Loading…"}),e.jsx(d,{})]}):t?e.jsxs("div",{className:"detail-wrap",children:[e.jsx("div",{className:"error",children:t}),e.jsx(d,{})]}):a?e.jsxs("div",{className:"detail-wrap",children:[e.jsxs("article",{className:"post",children:[e.jsxs("div",{className:"topline",children:[e.jsxs("a",{className:"subreddit",href:`https://www.reddit.com/r/${a.subreddit}`,target:"_blank",rel:"noreferrer noopener",children:["r/",a.subreddit]}),e.jsx("span",{className:"dot",children:"•"}),e.jsxs("span",{children:["Posted by ",e.jsxs("span",{className:"author",children:["u/",a.author]})]}),a.created_utc&&e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"dot",children:"•"}),e.jsx("time",{dateTime:new Date(a.created_utc*1e3).toISOString(),children:p(a.created_utc)})]})]}),e.jsxs("h1",{className:"title",children:[h,a.link_flair_text&&e.jsx("span",{className:"flair",children:a.link_flair_text}),a.media?.type&&e.jsx("span",{className:"pill",children:a.media.type})]}),a.media?.items?.[0]?.thumbnail&&e.jsx("div",{className:"media-wrap",children:e.jsx("img",{src:g(a.media.items[0].thumbnail),alt:"",loading:"lazy"})}),a.selftext&&e.jsx("div",{className:"selftext",children:a.selftext}),u&&e.jsxs("a",{className:"link-card",href:a.url,target:"_blank",rel:"noreferrer noopener",children:[e.jsx("div",{className:"link-domain",children:m}),e.jsx("div",{className:"link-cta",children:"Open link ↗"})]}),e.jsxs("div",{className:"bottomline",children:[e.jsxs("span",{children:["▲ ",a.score??0]}),e.jsx("span",{className:"dot",children:"•"}),e.jsxs("span",{children:["💬 ",a.num_comments??0]}),a.saved_utc&&e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"dot",children:"•"}),e.jsxs("span",{children:["Saved ",p(a.saved_utc)]})]}),e.jsx("span",{className:"spacer"}),a.permalink&&e.jsx("a",{className:"action",href:a.permalink,target:"_blank",rel:"noreferrer noopener",children:"View on Reddit"})]})]}),e.jsxs("section",{className:"comments-section",children:[e.jsxs("div",{className:"comments-header",children:[e.jsx("h2",{children:"Comments"}),e.jsxs("div",{className:"comments-meta",children:[a.num_comments??0," total"]})]}),e.jsx(b,{comments:a.comments||[]})]}),e.jsx(d,{})]}):e.jsxs("div",{className:"detail-wrap",children:[e.jsx("div",{className:"error",children:"Post not found."}),e.jsx(d,{})]})}function d(){return e.jsx("style",{children:`
      :root {
        --bg: #0b1416;
        --card: #1a1a1b;
        --card2: #0f1a1c;
        --card-hover: #1f1f20;
        --border: #343536;
        --border2: #2a2b2c;
        --text: #d7dadc;
        --meta: #818384;
        --link: #3aa0ff;
      }
      .detail-wrap {
        max-width: 860px;
        margin: 24px auto;
        padding: 0 12px;
        color: var(--text);
      }
      .loading, .error { color: var(--meta); }
      .post {
        border: 1px solid var(--border);
        background: var(--card);
        border-radius: 8px;
        padding: 12px;
      }
      .topline, .bottomline {
        display: flex; align-items: center; gap: 8px;
        color: var(--meta); font-size: 12px;
      }
      .topline { margin-bottom: 6px; }
      .bottomline { margin-top: 8px; flex-wrap: wrap; }
      .spacer { flex: 1; }
      .dot { opacity: .9; }
      .subreddit { color: var(--text); text-decoration: none; font-weight: 600; }
      .subreddit:hover { text-decoration: underline; }
      .author { color: var(--meta); }
      .title {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        font-size: 1.25rem; font-weight: 700; margin: 4px 0 8px;
      }
      .flair {
        background: #343536; color: var(--text);
        border-radius: 4px; padding: 2px 6px; font-size: 11px;
      }
      .pill {
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 999px; padding: 2px 8px; font-size: 11px;
      }
      .media-wrap { border: 1px solid rgba(255,255,255,.08); border-radius: 6px; overflow: hidden; margin: 6px 0 10px; }
      .media-wrap img { width: 100%; max-height: 460px; object-fit: cover; display: block; }

      .selftext {
        white-space: pre-wrap;
        line-height: 1.45; font-size: 14px; color: #c9d1d9;
        margin-bottom: 8px;
      }
      .link-card {
        display: flex; justify-content: space-between; align-items: center;
        border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03);
        border-radius: 6px; padding: 10px 12px; text-decoration: none; color: var(--text);
      }
      .link-card:hover { border-color: rgba(255,255,255,.2); }
      .link-domain { font-size: 12px; color: var(--meta); }
      .link-cta { font-size: 12px; }

      .comments-section { margin-top: 16px; }
      .comments-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
      .comments-header h2 { font-size: 1rem; margin: 0; }
      .comments-meta { color: var(--meta); font-size: 12px; }
    `})}export{w as default};
