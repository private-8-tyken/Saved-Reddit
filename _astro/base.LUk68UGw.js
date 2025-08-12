var i={exports:{}},s={};/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var a;function v(){if(a)return s;a=1;var e=Symbol.for("react.transitional.element"),R=Symbol.for("react.fragment");function o(d,r,t){var n=null;if(t!==void 0&&(n=""+t),r.key!==void 0&&(n=""+r.key),"key"in r){t={};for(var u in r)u!=="key"&&(t[u]=r[u])}else t=r;return r=t.ref,{$$typeof:e,type:d,key:n,ref:r!==void 0?r:null,props:t}}return s.Fragment=R,s.jsx=o,s.jsxs=o,s}var x;function l(){return x||(x=1,i.exports=v()),i.exports}var p=l();const E="/Saved-Reddit/";function f(e){return e?/^https?:\/\//i.test(e)?e:`${E}${e.replace(/^\/+/,"")}`:""}export{E as B,f as a,p as j};
