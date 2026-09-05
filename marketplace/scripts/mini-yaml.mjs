/** Minimal YAML subset parser (block maps, block/flow sequences, scalars). Enough for activate.yaml and SKILL.md frontmatter. */
export function parse(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  let i = 0;
  const indentOf = (l) => l.match(/^ */)[0].length;
  function scalar(raw) {
    const s = raw.trim();
    if (s === '') return null;
    if (s.startsWith('[')) return s.slice(1, s.lastIndexOf(']')).split(',').map((x) => x.trim()).filter(Boolean).map(scalar);
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null' || s === '~') return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }
  function block(indent) {
    const first = lines[i];
    if (first === undefined) return null;
    if (first.trim().startsWith('- ')) {
      const arr = [];
      while (i < lines.length && indentOf(lines[i]) === indent && lines[i].trim().startsWith('- ')) {
        const item = lines[i].trim().slice(2);
        if (item.includes(': ') && !item.startsWith('"') && !item.startsWith('[')) {
          // inline map inside a list item
          lines[i] = ' '.repeat(indent + 2) + item;
          arr.push(block(indent + 2));
        } else { arr.push(scalar(item)); i++; }
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length && indentOf(lines[i]) === indent) {
      const line = lines[i];
      const m = line.trim().match(/^([^:]+):(.*)$/);
      if (!m) throw new Error(`bad line: ${line}`);
      const key = m[1].trim().replace(/^["']|["']$/g, '');
      const rest = m[2];
      if (rest.trim() === '' || rest.trim() === '|' || rest.trim() === '>') {
        i++;
        if (rest.trim() === '|' || rest.trim() === '>') {
          const buf = [];
          while (i < lines.length && indentOf(lines[i]) > indent) buf.push(lines[i].trim()), i++;
          obj[key] = buf.join(rest.trim() === '|' ? '\n' : ' ');
        } else if (i < lines.length && indentOf(lines[i]) > indent) obj[key] = block(indentOf(lines[i]));
        else obj[key] = null;
      } else { obj[key] = scalar(rest); i++; }
    }
    return obj;
  }
  return block(lines.length ? indentOf(lines[0]) : 0) ?? {};
}
