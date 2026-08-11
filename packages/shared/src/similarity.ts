function bigrams(value: string): Map<string, number> {
  const compact = value.replace(/\s+/gu, " ");
  const result = new Map<string, number>();
  if (compact.length < 2) {
    if (compact) result.set(compact, 1);
    return result;
  }
  for (let index = 0; index < compact.length - 1; index += 1) {
    const pair = compact.slice(index, index + 2);
    result.set(pair, (result.get(pair) ?? 0) + 1);
  }
  return result;
}

export function diceSimilarity(left: string, right: string): number {
  if (left === right) return left.length > 0 ? 1 : 0;
  if (!left || !right) return 0;
  const a = bigrams(left);
  const b = bigrams(right);
  let intersection = 0;
  for (const [pair, count] of a) {
    intersection += Math.min(count, b.get(pair) ?? 0);
  }
  const sizeA = [...a.values()].reduce((sum, count) => sum + count, 0);
  const sizeB = [...b.values()].reduce((sum, count) => sum + count, 0);
  return (2 * intersection) / (sizeA + sizeB);
}

export function tokenSimilarity(left: string, right: string): number {
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function textSimilarity(left: string, right: string): number {
  if (left === right && left.length > 0) return 1;
  return Math.max(diceSimilarity(left, right), tokenSimilarity(left, right));
}
