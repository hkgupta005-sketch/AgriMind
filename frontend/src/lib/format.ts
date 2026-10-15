export const ACRES_PER_HA = 2.471;

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const num = (d = 2) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: d });

export const rupees = (v: number) => `₹${inr.format(Math.round(v))}`;
export const fmt = (v: number | null | undefined, digits = 2) => (v == null ? "—" : num(digits).format(v));
export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function dateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
export function shortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return shortDate(iso);
}
