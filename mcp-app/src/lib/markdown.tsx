import type { ReactNode } from 'react';

/**
 * Tiny, safe Markdown renderer for SKILL.md: frontmatter, headings, lists, code fences,
 * paragraphs, inline code/bold/italic. Everything is emitted as React elements, never raw HTML.
 */
export function Markdown({ source }: { source: string }) {
  return <div className="md">{render(source)}</div>;
}

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function render(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      nodes.push(<div key={`fm-${key++}`} className="fm">{lines.slice(1, end).join('\n')}</div>);
      i = end + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      nodes.push(<pre key={`pre-${key++}`}><code>{buf.join('\n')}</code></pre>);
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2], `h${key}`);
      nodes.push(level === 1 ? <h1 key={`h-${key++}`}>{content}</h1> : level === 2 ? <h2 key={`h-${key++}`}>{content}</h2> : <h3 key={`h-${key++}`}>{content}</h3>);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { nodes.push(<hr key={`hr-${key++}`} />); i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(<li key={`li-${key++}`}>{inline(lines[i].replace(/^\s*[-*]\s+/, ''), `li${key}`)}</li>);
        i++;
      }
      nodes.push(<ul key={`ul-${key++}`}>{items}</ul>);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(<li key={`oli-${key++}`}>{inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''), `oli${key}`)}</li>);
        i++;
      }
      nodes.push(<ol key={`ol-${key++}`}>{items}</ol>);
      continue;
    }

    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|```|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) buf.push(lines[i++]);
    nodes.push(<p key={`p-${key++}`}>{inline(buf.join(' '), `p${key}`)}</p>);
  }
  return nodes;
}
