/**
 * Tiny line diff (LCS-based) with no dependencies. Good for SKILL.md sized inputs.
 * Returns a flat list of ops: equal / add / del, each carrying its line and the line numbers on both sides.
 */
export type DiffOp = { kind: "equal" | "add" | "del"; text: string; a: number | null; b: number | null }

export function lineDiff(before: string, after: string): DiffOp[] {
  const a = before.replace(/\r\n/g, "\n").split("\n")
  const b = after.replace(/\r\n/g, "\n").split("\n")
  const n = a.length, m = b.length
  // Trim common prefix/suffix to keep the LCS table small.
  let start = 0
  while (start < n && start < m && a[start] === b[start]) start++
  let endA = n, endB = m
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const ops: DiffOp[] = []
  for (let i = 0; i < start; i++) ops.push({ kind: "equal", text: a[i], a: i + 1, b: i + 1 })

  const midA = a.slice(start, endA), midB = b.slice(start, endB)
  const la = midA.length, lb = midB.length
  if (la * lb > 4_000_000) {
    // Pathologically large: fall back to whole-block replace.
    midA.forEach((t, i) => ops.push({ kind: "del", text: t, a: start + i + 1, b: null }))
    midB.forEach((t, j) => ops.push({ kind: "add", text: t, a: null, b: start + j + 1 }))
  } else {
    const dp: Uint32Array[] = Array.from({ length: la + 1 }, () => new Uint32Array(lb + 1))
    for (let i = la - 1; i >= 0; i--)
      for (let j = lb - 1; j >= 0; j--)
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    let i = 0, j = 0
    while (i < la && j < lb) {
      if (midA[i] === midB[j]) { ops.push({ kind: "equal", text: midA[i], a: start + i + 1, b: start + j + 1 }); i++; j++ }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ kind: "del", text: midA[i], a: start + i + 1, b: null }); i++ }
      else { ops.push({ kind: "add", text: midB[j], a: null, b: start + j + 1 }); j++ }
    }
    while (i < la) { ops.push({ kind: "del", text: midA[i], a: start + i + 1, b: null }); i++ }
    while (j < lb) { ops.push({ kind: "add", text: midB[j], a: null, b: start + j + 1 }); j++ }
  }

  for (let k = 0; k < n - endA; k++) ops.push({ kind: "equal", text: a[endA + k], a: endA + k + 1, b: endB + k + 1 })
  return ops
}

export function diffStats(ops: DiffOp[]) {
  let additions = 0, deletions = 0
  for (const o of ops) { if (o.kind === "add") additions++; else if (o.kind === "del") deletions++ }
  return { additions, deletions }
}
