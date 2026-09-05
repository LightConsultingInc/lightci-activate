import { formatDistanceToNowStrict, format } from "date-fns"

export const fmt = {
  pct: (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`,
  hours: (minutes: number) => `${(minutes / 60).toFixed(minutes >= 600 ? 0 : 1)}h`,
  num: (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v),
  money: (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v),
  date: (d: string | Date) => format(new Date(d), "MMM d, yyyy"),
  dateShort: (d: string | Date) => format(new Date(d), "MMM d"),
  ago: (d: string | Date) => formatDistanceToNowStrict(new Date(d), { addSuffix: true }),
  score: (v: number) => (v * 10).toFixed(1),
  initials: (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
}
