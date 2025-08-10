export type MediaItem = {
  mimetype?: string;
  width?: number; height?: number;
  local_path?: string; external_url?: string; thumbnail?: string;
};

export type Comment = {
  id: string; author?: string; body?: string; score?: number; created_utc?: number;
  replies?: Comment[];
};

export type Post = {
  id: string;
  permalink?: string; url?: string;
  subreddit?: string; author?: string;
  title: string; selftext?: string;
  created_utc?: number; saved_utc?: number;
  score?: number; num_comments?: number;
  flair?: string; over_18?: boolean; spoiler?: boolean;
  stickied?: boolean; locked?: boolean; is_self?: boolean;
  link_domain?: string;
  media?: { type?: string; items?: MediaItem[]; video?: any };
  awards?: { name: string; count: number }[];
};

export type ManifestItem = Pick<Post, 'id' | 'title' | 'subreddit' | 'author' | 'flair' | 'over_18' | 'spoiler' | 'created_utc' | 'saved_utc' | 'score' | 'num_comments' | 'link_domain'> & {
  hasMedia?: boolean; mediaType?: string;
};

export type Facets = {
  subreddits: string[]; authors: string[]; flairs: string[]; domains: string[];
};

---

// src/lib/format.ts
import dayjs from 'dayjs';
export const fmtDate = (ts?: number) => ts ? dayjs.unix(ts).format('MMM D, YYYY') : '';
export const plural = (n: number, s: string) => `${n} ${s}${n===1?'':'s'}`;