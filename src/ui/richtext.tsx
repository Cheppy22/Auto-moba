export type RichKind = 'm' | 'b' | 's' | 't' | 'g' | 'p' | 'r';

export interface Segment {
  kind: RichKind | null;
  text: string;
}

const TAG = /^\{([mbstgpr])\|([^{}]*)\}/;

export function parseRich(s: string): Segment[] {
  const out: Segment[] = [];
  const addPlain = (text: string): void => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === null) last.text += text;
    else out.push({ kind: null, text });
  };
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('{', i);
    if (open === -1) {
      addPlain(s.slice(i));
      break;
    }
    addPlain(s.slice(i, open));
    const m = TAG.exec(s.slice(open));
    if (m) {
      if (m[2]) out.push({ kind: m[1] as RichKind, text: m[2] });
      i = open + m[0].length;
    } else {
      addPlain('{');
      i = open + 1;
    }
  }
  return out;
}

export function plainText(s: string): string {
  return parseRich(s)
    .map((seg) => seg.text)
    .join('');
}

export function ruleName(desc: string): string {
  return parseRich(desc).find((seg) => seg.kind === 'r')?.text ?? '';
}

export function splitRule(desc: string): { stats: string; rule: string } {
  const at = desc.indexOf('{r|');
  if (at === -1) return { stats: desc, rule: '' };
  return { stats: desc.slice(0, at).trim(), rule: desc.slice(at) };
}

export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRich(text).map((seg, i) =>
        seg.kind ? (
          <span key={i} class={`kw-${seg.kind}`}>
            {seg.text}
          </span>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}
