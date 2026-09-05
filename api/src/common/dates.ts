export const DAY_MS = 86_400_000;
export function isoDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
export function daysAgo(n: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - n * DAY_MS);
}
export function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / DAY_MS;
}
