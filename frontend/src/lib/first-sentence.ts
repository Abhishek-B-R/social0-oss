/** First sentence of `s`; dots inside numbers or domains (1.91:1, social0.app) don't end it. */
export const firstSentence = (s: string) => s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s;
