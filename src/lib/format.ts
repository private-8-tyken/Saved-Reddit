import dayjs from 'dayjs';
export const fmtDate = (ts?: number) => ts ? dayjs.unix(ts).format('MMM D, YYYY') : '';
export const plural = (n: number, s: string) => `${n} ${s}${n===1?'':'s'}`;