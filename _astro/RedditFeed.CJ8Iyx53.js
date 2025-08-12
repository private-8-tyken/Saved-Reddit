import{j as r,B as x,a as b}from"./base.LUk68UGw.js";import{r as m}from"./index.RH_Wq4ov.js";function v({facets:a,query:t,onChange:s}){const o=(c,d)=>{const l=new Set(t[c]||[]);l.has(d)?l.delete(d):l.add(d),s({...t,[c]:Array.from(l).sort(),page:1})},i=(c,d,l)=>r.jsxs("div",{className:"block",children:[r.jsx("div",{className:"label",children:c}),r.jsx("div",{className:"chips",children:l.map(e=>r.jsx("button",{className:`chip ${t[d]?.includes(e)?"on":""}`,onClick:()=>o(d,e),type:"button",children:e},e))})]}),p=()=>{const c=t.sort||"created_desc";if(!/_asc$|_desc$/.test(c))return;const d=c.endsWith("_desc")?c.replace("_desc","_asc"):c.replace("_asc","_desc");s({...t,sort:d,page:1})};return(t.sort||"").endsWith("_desc"),r.jsxs("aside",{className:"filters",children:[r.jsx("div",{className:"row",children:r.jsx("input",{className:"search",type:"search",placeholder:"Search title & text…",value:t.q||"",onChange:c=>s({...t,q:c.target.value,page:1})})}),i("Subreddit","sub",a.subreddits||[]),i("Author","author",a.authors||[]),i("Flair","flair",a.flairs||[]),i("Domain","domain",a.domains||[]),i("Media","media",a.mediaTypes||[]),r.jsxs("div",{className:"row two",children:[r.jsxs("label",{children:["From",r.jsx("input",{type:"date",value:t.from||"",onChange:c=>s({...t,from:c.target.value,page:1})})]}),r.jsxs("label",{children:["To",r.jsx("input",{type:"date",value:t.to||"",onChange:c=>s({...t,to:c.target.value,page:1})})]})]}),r.jsx("div",{className:"row",children:r.jsxs("label",{children:["Sort",r.jsxs("div",{className:"sort-row",children:[r.jsxs("select",{value:t.sort,onChange:c=>s({...t,sort:c.target.value,page:1}),children:[r.jsx("option",{value:"created_desc",children:"Created date"}),r.jsx("option",{value:"score_desc",children:"Score"}),r.jsx("option",{value:"comments_desc",children:"Comments"}),r.jsx("option",{value:"title_asc",children:"Title"})]}),r.jsx("button",{type:"button",className:"dir",onClick:p,title:t.sort?.endsWith("_desc")?"Descending":"Ascending",children:t.sort?.endsWith("_desc")?"↓":"↑"})]})]})}),r.jsx("div",{className:"row actions",children:r.jsx("button",{type:"button",onClick:()=>s({q:"",sub:[],author:[],flair:[],domain:[],media:[],from:"",to:"",sort:"created_desc",page:1}),children:"Clear all"})}),r.jsx("style",{children:`
        .filters { border:1px solid rgba(255,255,255,.12); background:#1a1a1b; border-radius:8px; padding:12px; color:#d7dadc; }
        .label { font-size:12px; color:#9aa0a6; margin:6px 0; }
        .row { margin: 8px 0; }
        .row.two { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
        .search, input[type="date"], select { width:100%; background:#0f1a1c; color:#d7dadc; border:1px solid #343536; border-radius:6px; padding:8px; }
        .chips { display:flex; flex-wrap:wrap; gap:6px; }
        .chip { background:#2a2b2c; border:1px solid #343536; color:#d7dadc; border-radius:999px; padding:4px 10px; font-size:12px; cursor:pointer; }
        .chip.on { background:#3b3c3d; border-color:#4a4c4f; }
        .actions button { background:#2a2b2c; border:1px solid #343536; border-radius:6px; padding:6px 10px; color:#d7dadc; cursor:pointer; }

        .sort-controls { display:flex; gap:8px; align-items:center; }
        .dir { width:36px; height:36px; display:inline-flex; align-items:center; justify-content:center;
               background:#2a2b2c; border:1px solid #343536; border-radius:6px; color:#d7dadc; cursor:pointer; }
        .sort-row { display:flex; gap:8px; align-items:center; }
        .dir { background:#2a2b2c; border:1px solid #343536; border-radius:6px; padding:6px 10px; color:#d7dadc; cursor:pointer; }
      `})]})}const g=new Set(["sub","author","flair","domain","media"]),j=new Set(["created_desc","score_desc","comments_desc","title_asc"]),_={q:"",sub:[],author:[],flair:[],domain:[],media:[],from:"",to:"",sort:"created_desc",page:1};function h(a=globalThis.location?.search||""){const t={..._},s=new URLSearchParams(a);for(const[o,i]of s.entries())g.has(o)?t[o]=i?i.split(",").filter(Boolean):[]:o==="page"?t.page=Math.max(1,parseInt(i||"1",10)):t[o]=i||"";return j.has(t.sort)||(t.sort="created_desc"),t}function w(a){const t=new URLSearchParams;a.q&&t.set("q",a.q);for(const o of g)a[o]?.length&&t.set(o,a[o].join(","));a.from&&t.set("from",a.from),a.to&&t.set("to",a.to),a.sort&&a.sort!=="created_desc"&&t.set("sort",a.sort),a.page&&a.page!==1&&t.set("page",String(a.page));const s=t.toString();return s?`?${s}`:""}function k(a,t=!1){const s=w(a),o=`${location.pathname}${s}`;t?history.replaceState(null,"",o):history.pushState(null,"",o)}function N(a,t){let s=a.slice();const o=(e,n)=>!n?.length||e&&n.includes(e),i=e=>e?Math.floor(new Date(e).getTime()/1e3):null;s=s.filter(e=>o(e.subreddit,t.sub)&&o(e.author,t.author)&&o(e.flair,t.flair)&&o(e.link_domain,t.domain)&&o(e.media_type,t.media));const p=i(t.from),c=i(t.to);p&&(s=s.filter(e=>(e.created_utc??0)>=p)),c&&(s=s.filter(e=>(e.created_utc??0)<=c));const d=(t.q||"").trim().toLowerCase();switch(d&&(s=s.filter(e=>(e.title||"").toLowerCase().includes(d)||(e.selftext_preview||"").toLowerCase().includes(d))),t.sort||"created_desc"){case"created_asc":s.sort((e,n)=>(e.created_utc??0)-(n.created_utc??0));break;case"created_desc":default:s.sort((e,n)=>(n.created_utc??0)-(e.created_utc??0));break;case"score_desc":s.sort((e,n)=>(n.score??0)-(e.score??0));break;case"score_asc":s.sort((e,n)=>(e.score??0)-(n.score??0));break;case"comments_desc":s.sort((e,n)=>(n.num_comments??0)-(e.num_comments??0));break;case"comments_asc":s.sort((e,n)=>(e.num_comments??0)-(n.num_comments??0));break;case"title_asc":s.sort((e,n)=>(e.title||"").localeCompare(n.title||""));break;case"title_desc":s.sort((e,n)=>(n.title||"").localeCompare(e.title||""));break}return s}function u(a){return a?new Date(a*1e3).toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"}):""}function y(a){if(!a)return null;try{const t=a.split("/").filter(Boolean),s=t.findIndex(o=>o==="comments");if(s!==-1&&t[s+1]){const o=t[s+1];return o.startsWith("t3_")?o:`t3_${o}`}}catch{}return null}function f(a,t){if(!t||!a)return a;const s=t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),o=new RegExp(`(${s})`,"gi");return a.split(o).map((i,p)=>o.test(i)?r.jsx("mark",{children:i},p):i)}function E(){const[a,t]=m.useState([]),[s,o]=m.useState(null),[i,p]=m.useState(h());m.useEffect(()=>{fetch(`${x}data/indexes/posts-manifest.json`).then(e=>e.json()).then(t).catch(e=>console.error("Failed to load manifest",e))},[]),m.useEffect(()=>{fetch(`${x}data/indexes/facets.json`).then(e=>e.json()).then(o).catch(e=>console.error("Failed to load facets",e))},[]),m.useEffect(()=>{const e=()=>p(h(location.search));return window.addEventListener("popstate",e),()=>window.removeEventListener("popstate",e)},[]);const c=e=>{p(e),k(e)},d=m.useMemo(()=>N(a,i),[a,i]),l=d.length;return a.length?r.jsxs("div",{className:"feed grid",children:[r.jsx("div",{className:"left",children:s&&r.jsx(v,{facets:s,query:i,onChange:c})}),r.jsxs("div",{className:"right",children:[r.jsxs("div",{className:"resultbar",children:[r.jsxs("span",{children:[l," result",l===1?"":"s"]}),i.q&&r.jsxs("span",{className:"meta",children:[" • searching “",i.q,"”"]})]}),(l?d:[]).map(e=>{const n=e.id||y(e.permalink);return n?r.jsxs("article",{className:"post-card",children:[r.jsxs("div",{className:"topline",children:[r.jsxs("a",{className:"subreddit",href:`https://www.reddit.com/r/${e.subreddit}`,target:"_blank",rel:"noreferrer noopener",children:["r/",e.subreddit]}),r.jsx("span",{className:"dot",children:"•"}),r.jsxs("span",{className:"by",children:["Posted by ",r.jsxs("span",{className:"author",children:["u/",e.author]})]}),e.created_utc&&r.jsxs(r.Fragment,{children:[r.jsx("span",{className:"dot",children:"•"}),r.jsx("time",{dateTime:new Date(e.created_utc*1e3).toISOString(),children:u(e.created_utc)})]})]}),r.jsxs("h2",{className:"title",children:[r.jsx("a",{href:`${x}post/${n}`,children:f(e.title,i.q)}),e.flair&&r.jsx("span",{className:"flair",children:e.flair}),e.media_type&&r.jsx("span",{className:"pill",children:e.media_type})]}),e.media_preview&&r.jsx("a",{href:`${x}post/${n}`,className:"media-wrap",children:r.jsx("img",{src:b(e.media_preview),alt:"",loading:"lazy",width:e.preview_width||void 0,height:e.preview_height||void 0})}),e.selftext_preview&&r.jsx("p",{className:"excerpt",children:f(e.selftext_preview,i.q)}),e.link_domain&&e.url&&r.jsxs("a",{className:"link-card",href:e.url,target:"_blank",rel:"noreferrer noopener",title:e.url,children:[r.jsx("div",{className:"link-domain",children:e.link_domain}),r.jsx("div",{className:"link-cta",children:"Open link ↗"})]}),r.jsxs("div",{className:"bottomline",children:[r.jsxs("span",{className:"score",children:["▲ ",e.score??0]}),r.jsx("span",{className:"dot",children:"•"}),r.jsxs("span",{className:"comments",children:["💬 ",e.num_comments??0]}),r.jsx("span",{className:"spacer"}),e.permalink&&r.jsx("a",{className:"action",href:e.permalink,target:"_blank",rel:"noreferrer noopener",children:"View on Reddit"}),r.jsx("a",{className:"action",href:`${x}post/${n}`,children:"Details"}),e.saved_utc&&r.jsxs("span",{className:"saved",children:["Saved ",u(e.saved_utc)]})]})]},n):null}),!l&&r.jsx("div",{className:"empty",children:"No results. Try clearing filters."})]}),r.jsx("style",{children:`
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

                .grid {
                    display: grid;
                    grid-template-columns: 280px 1fr;
                    gap: 16px;
                }

                @media (max-width: 900px) {
                    .grid {
                        grid-template-columns: 1fr;
                    }

                    .left {
                        order: 2
                    }

                    .right {
                        order: 1
                    }
                }

                .resultbar {
                    color: #818384;
                    font-size: 12px;
                    margin: 4px 0 8px;
                }

                .empty {
                    color: #818384;
                    font-size: 14px;
                    margin: 12px 0;
                }

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

                .post-card:hover {
                    background: var(--card-hover);
                    border-color: var(--border-hover);
                }

                .topline,
                .bottomline {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--meta);
                    font-size: 12px;
                    line-height: 1;
                }

                .topline {
                    margin-bottom: 6px;
                }

                .bottomline {
                    margin-top: 8px;
                    flex-wrap: wrap;
                }

                .spacer {
                    flex: 1;
                    min-width: 8px;
                }

                .dot {
                    opacity: .9;
                }

                .subreddit {
                    color: var(--text);
                    text-decoration: none;
                    font-weight: 600;
                }

                .subreddit:hover {
                    text-decoration: underline;
                }

                .author {
                    color: var(--meta);
                }

                .title {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 6px;
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 2px 0 6px;
                    line-height: 1.25;
                }

                .title a {
                    color: var(--text);
                    text-decoration: none;
                }

                .title a:hover {
                    text-decoration: underline;
                }

                .title a:visited {
                    color: var(--link-visited);
                }

                .flair {
                    background: var(--badge);
                    color: var(--text);
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-size: 11px;
                }

                .pill {
                    background: rgba(255, 255, 255, .08);
                    border: 1px solid rgba(255, 255, 255, .12);
                    color: var(--text);
                    border-radius: 999px;
                    padding: 2px 8px;
                    font-size: 11px;
                    opacity: .9;
                }

                .media-wrap {
                    display: block;
                    border-radius: 6px;
                    overflow: hidden;
                    border: 1px solid rgba(255, 255, 255, .08);
                    margin: 6px 0 8px;
                }

                .media-wrap img {
                    display: block;
                    width: 100%;
                    max-height: 360px;
                    object-fit: cover;
                }

                .excerpt {
                    margin: 4px 0 8px;
                    font-size: 14px;
                    line-height: 1.45;
                    color: #c9d1d9;
                    display: -webkit-box;
                    -webkit-line-clamp: 6;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    white-space: pre-wrap;
                }

                .link-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border: 1px solid rgba(255, 255, 255, .12);
                    background: rgba(255, 255, 255, .03);
                    border-radius: 6px;
                    padding: 10px 12px;
                    text-decoration: none;
                    color: var(--text);
                    margin-top: 6px;
                }

                .link-card:hover {
                    border-color: rgba(255, 255, 255, .2);
                }

                .link-domain {
                    font-size: 12px;
                    color: var(--meta);
                }

                .link-cta {
                    font-size: 12px;
                    color: var(--text);
                }

                .score,
                .comments {
                    color: var(--meta);
                }

                .action {
                    color: var(--link);
                    text-decoration: none;
                }

                .action:hover {
                    text-decoration: underline;
                }

                .saved {
                    color: var(--meta);
                }

                mark {
                    background: rgba(255, 213, 79, 0.3);
                    color: inherit;
                    padding: 0 2px;
                    border-radius: 2px;
                }
      `})]}):r.jsx("div",{className:"feed loading",children:"Loading…"})}export{E as default};
