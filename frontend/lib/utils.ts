import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function accountAge(cbCreatedAt?: string): {
  label: string;
  dateStr: string;
  ageDays: number;
  stage: "new" | "ramping" | "mature";
} {
  if (!cbCreatedAt) return { label: "—", dateStr: "—", ageDays: 0, stage: "mature" };
  const ts = parseInt(cbCreatedAt);
  if (!ts) return { label: "—", dateStr: "—", ageDays: 0, stage: "mature" };
  const created = new Date(ts * 1000);
  const ageDays = Math.floor((Date.now() / 1000 - ts) / 86400);
  const dateStr = created.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  let label: string;
  if (ageDays < 1)        label = "Today";
  else if (ageDays < 30)  label = `${ageDays} days`;
  else if (ageDays < 365) label = `${Math.floor(ageDays / 30)} months`;
  else {
    const y = Math.floor(ageDays / 365);
    const m = Math.floor((ageDays % 365) / 30);
    label = m > 0 ? `${y}y ${m}mo` : `${y} year${y > 1 ? "s" : ""}`;
  }
  const stage = ageDays < 60 ? "new" : ageDays < 180 ? "ramping" : "mature";
  return { label, dateStr, ageDays, stage };
}

export function formatMrr(amount: number, currency: string): string {
  if (!amount || amount === 0) return "—";
  const formatted = amount.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  switch (currency) {
    case "INR": return `₹${formatted}`;
    case "USD": return `$${formatted}`;
    case "AED": return `AED ${formatted}`;
    case "EUR": return `€${formatted}`;
    case "GBP": return `£${formatted}`;
    default:    return `${currency} ${formatted}`;
  }
}
