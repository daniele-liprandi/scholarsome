export function selectByPriority<T extends { priority: string }>(cards: T[], n: number): T[] {
  if (n >= cards.length) return [...cards];
  const buckets = [
    cards.filter((c) => c.priority === "A"),
    cards.filter((c) => c.priority === "B"),
    cards.filter((c) => c.priority !== "A" && c.priority !== "B")
  ];
  const result: T[] = [];
  for (const bucket of buckets) {
    if (result.length >= n) break;
    result.push(...bucket.slice(0, n - result.length));
  }
  return result;
}
