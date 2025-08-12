import{j as e,B as x,a as g}from"./base.LUk68UGw.js";import{r as p}from"./index.RH_Wq4ov.js";function b({facets:a,query:t,onChange:o}){const i=(d,l)=>{const c=new Set(t[d]||[]);c.has(l)?c.delete(l):c.add(l),o({...t,[d]:Array.from(c).sort(),page:1})},n=(d,l,c)=>e.jsxs("div",{className:"block",children:[e.jsx("div",{className:"label",children:d}),e.jsx("div",{className:"chips",children:c.map(s=>e.jsx("button",{className:`chip ${t[l]?.includes(s)?"on":""}`,onClick:()=>i(l,s),type:"button",children:s},s))})]});return e.jsxs("aside",{className:"filters",children:[e.jsx("div",{className:"row",children:e.jsx("input",{className:"search",type:"search",placeholder:"Search title & text…",value:t.q||"",onChange:d=>o({...t,q:d.target.value,page:1})})}),n("Subreddit","sub",a.subreddits||[]),n("Author","author",a.authors||[]),n("Flair","flair",a.flairs||[]),n("Domain","domain",a.domains||[]),n("Media","media",a.mediaTypes||[]),e.jsxs("div",{className:"row two",children:[e.jsxs("label",{children:["From",e.jsx("input",{type:"date",value:t.from||"",onChange:d=>o({...t,from:d.target.value,page:1})})]}),e.jsxs("label",{children:["To",e.jsx("input",{type:"date",value:t.to||"",onChange:d=>o({...t,to:d.target.value,page:1})})]})]}),e.jsx("div",{className:"row",children:e.jsxs("label",{children:["Sort",e.jsxs("select",{value:t.sort,onChange:d=>o({...t,sort:d.target.value}),children:[e.jsx("option",{value:"created_desc",children:"Newest"}),e.jsx("option",{value:"score_desc",children:"Top score"}),e.jsx("option",{value:"comments_desc",children:"Most comments"}),e.jsx("option",{value:"title_asc",children:"Title A→Z"})]})]})}),e.jsx("div",{className:"row actions",children:e.jsx("button",{type:"button",onClick:()=>o({q:"",sub:[],author:[],flair:[],domain:[],media:[],from:"",to:"",sort:"created_desc",page:1}),children:"Clear all"})}),e.jsx("style",{children:`
        .filters { border:1px solid rgba(255,255,255,.12); background:#1a1a1b; border-radius:8px; padding:12px; color:#d7dadc; }
        .label { font-size:12px; color:#9aa0a6; margin:6px 0; }
        .row { margin: 8px 0; }
        .row.two { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
        .search, input[type="date"], select { width:100%; background:#0f1a1c; color:#d7dadc; border:1px solid #343536; border-radius:6px; padding:8px; }
        .chips { display:flex; flex-wrap:wrap; gap:6px; }
        .chip { background:#2a2b2c; border:1px solid #343536; color:#d7dadc; border-radius:999px; padding:4px 10px; font-size:12px; cursor:pointer; }
        .chip.on { background:#3b3c3d; border-color:#4a4c4f; }
        .actions button { background:#2a2b2c; border:1px solid #343536; border-radius:6px; padding:6px 10px; color:#d7dadc; cursor:pointer; }
      `})]})}const f=new Set(["sub","author","flair","domain","media"]),v=new Set(["created_desc","score_desc","comments_desc","title_asc"]),j={q:"",sub:[],author:[],flair:[],domain:[],media:[],from:"",to:"",sort:"created_desc",page:1};function h(a=globalThis.location?.search||""){const t={...j},o=new URLSearchParams(a);for(const[i,n]of o.entries())f.has(i)?t[i]=n?n.split(",").filter(Boolean):[]:i==="page"?t.page=Math.max(1,parseInt(n||"1",10)):t[i]=n||"";return v.has(t.sort)||(t.sort="created_desc"),t}function w(a){const t=new URLSearchParams;a.q&&t.set("q",a.q);for(const i of f)a[i]?.length&&t.set(i,a[i].join(","));a.from&&t.set("from",a.from),a.to&&t.set("to",a.to),a.sort&&a.sort!=="created_desc"&&t.set("sort",a.sort),a.page&&a.page!==1&&t.set("page",String(a.page));const o=t.toString();return o?`?${o}`:""}function _(a,t=!1){const o=w(a),i=`${location.pathname}${o}`;t?history.replaceState(null,"",i):history.pushState(null,"",i)}function k(a,t){let o=a.slice();const i=(s,r)=>!r?.length||s&&r.includes(s),n=s=>s?Math.floor(new Date(s).getTime()/1e3):null;o=o.filter(s=>i(s.subreddit,t.sub)&&i(s.author,t.author)&&i(s.flair,t.flair)&&i(s.link_domain,t.domain)&&i(s.media_type,t.media));const d=n(t.from),l=n(t.to);d&&(o=o.filter(s=>(s.created_utc??0)>=d)),l&&(o=o.filter(s=>(s.created_utc??0)<=l));const c=(t.q||"").trim().toLowerCase();switch(c&&(o=o.filter(s=>(s.title||"").toLowerCase().includes(c)||(s.selftext_preview||"").toLowerCase().includes(c))),t.sort){case"score_desc":o.sort((s,r)=>(r.score??0)-(s.score??0));break;case"comments_desc":o.sort((s,r)=>(r.num_comments??0)-(s.num_comments??0));break;case"title_asc":o.sort((s,r)=>(s.title||"").localeCompare(r.title||""));break;case"created_desc":default:o.sort((s,r)=>(r.created_utc??0)-(s.created_utc??0))}return o}function u(a){return a?new Date(a*1e3).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"}):""}function N(a){if(!a)return null;try{const t=a.split("/").filter(Boolean),o=t.findIndex(i=>i==="comments");if(o!==-1&&t[o+1]){const i=t[o+1];return i.startsWith("t3_")?i:`t3_${i}`}}catch{}return null}function T(){const[a,t]=p.useState([]),[o,i]=p.useState(null),[n,d]=p.useState(h());p.useEffect(()=>{fetch(`${x}data/indexes/posts-manifest.json`).then(r=>r.json()).then(t).catch(r=>console.error("Failed to load manifest",r))},[]),p.useEffect(()=>{fetch(`${x}data/indexes/facets.json`).then(r=>r.json()).then(i).catch(r=>console.error("Failed to load facets",r))},[]),p.useEffect(()=>{const r=()=>d(h(location.search));return window.addEventListener("popstate",r),()=>window.removeEventListener("popstate",r)},[]);const l=r=>{d(r),_(r)},c=p.useMemo(()=>k(a,n),[a,n]),s=c.length;return a.length?e.jsxs("div",{className:"feed grid",children:[e.jsx("div",{className:"left",children:o&&e.jsx(b,{facets:o,query:n,onChange:l})}),e.jsxs("div",{className:"right",children:[e.jsxs("div",{className:"resultbar",children:[e.jsxs("span",{children:[s," result",s===1?"":"s"]}),n.q&&e.jsxs("span",{className:"meta",children:[" • searching “",n.q,"”"]})]}),(s?c:[]).map(r=>{const m=r.id||N(r.permalink);return m?e.jsxs("article",{className:"post-card",children:[e.jsxs("div",{className:"topline",children:[e.jsxs("a",{className:"subreddit",href:`https://www.reddit.com/r/${r.subreddit}`,target:"_blank",rel:"noreferrer noopener",children:["r/",r.subreddit]}),e.jsx("span",{className:"dot",children:"•"}),e.jsxs("span",{className:"by",children:["Posted by ",e.jsxs("span",{className:"author",children:["u/",r.author]})]}),r.created_utc&&e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"dot",children:"•"}),e.jsx("time",{dateTime:new Date(r.created_utc*1e3).toISOString(),children:u(r.created_utc)})]})]}),e.jsxs("h2",{className:"title",children:[e.jsx("a",{href:`${x}post/${m}`,children:r.title}),r.flair&&e.jsx("span",{className:"flair",children:r.flair}),r.media_type&&e.jsx("span",{className:"pill",children:r.media_type})]}),r.media_preview&&e.jsx("a",{href:`${x}post/${m}`,className:"media-wrap",children:e.jsx("img",{src:g(r.media_preview),alt:"",loading:"lazy",width:r.preview_width||void 0,height:r.preview_height||void 0})}),r.selftext_preview&&e.jsx("p",{className:"excerpt",children:r.selftext_preview}),r.link_domain&&r.url&&e.jsxs("a",{className:"link-card",href:r.url,target:"_blank",rel:"noreferrer noopener",title:r.url,children:[e.jsx("div",{className:"link-domain",children:r.link_domain}),e.jsx("div",{className:"link-cta",children:"Open link ↗"})]}),e.jsxs("div",{className:"bottomline",children:[e.jsxs("span",{className:"score",children:["▲ ",r.score??0]}),e.jsx("span",{className:"dot",children:"•"}),e.jsxs("span",{className:"comments",children:["💬 ",r.num_comments??0]}),e.jsx("span",{className:"spacer"}),r.permalink&&e.jsx("a",{className:"action",href:r.permalink,target:"_blank",rel:"noreferrer noopener",children:"View on Reddit"}),e.jsx("a",{className:"action",href:`${x}post/${m}`,children:"Details"}),r.saved_utc&&e.jsxs("span",{className:"saved",children:["Saved ",u(r.saved_utc)]})]})]},m):null}),!s&&e.jsx("div",{className:"empty",children:"No results. Try clearing filters."})]}),e.jsx("style",{children:`
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
        .grid { display:grid; grid-template-columns: 280px 1fr; gap:16px; }
        @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .left{order:2} .right{order:1} }
        .resultbar { color:#818384; font-size:12px; margin: 4px 0 8px; }
        .empty { color:#818384; font-size:14px; margin: 12px 0; }

        .feed {
          max-width: 1160px;
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
          margin-bottom: 12px;
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
      `})]}):e.jsx("div",{className:"feed loading",children:"Loading…"})}export{T as default};
