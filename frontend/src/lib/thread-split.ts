import { postCharCount } from "@/lib/platform-limits";

export type ThreadOptions = {
  /** Key in PLATFORM_CHAR_LIMITS, e.g. "twitter_x". */
  platform: string;
  limit: number;
  /** Append " 1/5" to each post. */
  numbered: boolean;
  /** Start a new post at every blank line. */
  breakOnBlankLines: boolean;
};

const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].map((x) => x.segment);

/** Pieces small enough to pack: sentences, then words, then characters for giant words. */
function pieces(text: string, fits: (s: string) => boolean): string[] {
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n+|$)\s*/g) ?? [text];
  const out: string[] = [];
  for (const s of sentences) {
    if (fits(s.trim())) {
      out.push(s);
      continue;
    }
    for (const w of s.match(/\S+\s*/g) ?? []) {
      if (fits(w.trim())) {
        out.push(w);
        continue;
      }
      let chunk = "";
      for (const g of graphemes(w)) {
        if (!fits(chunk + g)) {
          out.push(chunk);
          chunk = "";
        }
        chunk += g;
      }
      if (chunk) out.push(chunk);
    }
  }
  return out;
}

function pack(text: string, room: number, platform: string, breakOnBlankLines: boolean): string[] {
  const fits = (s: string) => postCharCount(s, platform) <= room;
  const blocks = breakOnBlankLines ? text.split(/\n\s*\n/) : [text];
  const posts: string[] = [];
  for (const block of blocks) {
    let cur = "";
    for (const p of pieces(block, fits)) {
      if (cur && !fits((cur + p).trim())) {
        posts.push(cur.trim());
        cur = "";
      }
      cur += p;
    }
    if (cur.trim()) posts.push(cur.trim());
  }
  return posts.filter(Boolean);
}

/** Split long text into posts that each fit `limit`, breaking at sentences where possible. */
export function splitThread(text: string, o: ThreadOptions): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (!o.numbered) return pack(clean, o.limit, o.platform, o.breakOnBlankLines);
  // Reserve room for " n/total"; re-run if the total gains a digit.
  let total = 9;
  for (;;) {
    const reserve = ` ${total}/${total}`.length;
    const posts = pack(clean, o.limit - reserve, o.platform, o.breakOnBlankLines);
    if (String(posts.length).length <= String(total).length) {
      return posts.map((p, i) => `${p} ${i + 1}/${posts.length}`);
    }
    total = posts.length;
  }
}
