"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { cn, accountAge, formatMrr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

const PB = process.env.NEXT_PUBLIC_PB_BASE || "http://127.0.0.1:8090";

type Account = {
  id: string;
  company: string;
  email: string;
  plan: string;
  mrr: number;
  mrr_inr: number;
  currency: string;
  status: string;
  lead_owner?: string;
  kam?: string;
  industry?: string;
  cb_created_at?: string;
  churn_score?: number;
  upsell_score?: number;
  health?: string;
  explanation?: string;
  churn_reasons?: string[];
  upsell_reasons?: string[];
  convos_7d?: number;
  convos_30d?: number;
  wow_delta?: number;
  messages_7d?: number;
  avg_msgs_per_convo?: number;
  bot_ratio?: number;
  resolution_rate?: number;
  avg_frt_secs?: number;
  active_agents?: number;
  active_bots?: number;
  total_channels?: number;
  trend_consistency?: number;
  scored_at?: string;
};

type SortKey = "churn_score" | "upsell_score" | "mrr" | "convos_30d" | "company" | "cb_created_at";

type SortDir = "asc" | "desc";
type Tab = "all" | "red" | "yellow" | "green" | "upsell";

function formatInrShort(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}k`;
  return `₹${amount.toFixed(0)}`;
}

const HEALTH_TABS: [Tab, string, string][] = [
  ["all", "All", ""],
  ["red", "At Risk", "text-red-600 border-red-200 bg-red-50"],
  ["yellow", "Warning", "text-amber-600 border-amber-200 bg-amber-50"],
  ["green", "Healthy", "text-emerald-600 border-emerald-200 bg-emerald-50"],
  ["upsell", "Upsell", "text-indigo-600 border-indigo-200 bg-indigo-50"],
];

export default function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initTab    = (searchParams.get("tab")  as Tab)     || "all";
  const initSort   = (searchParams.get("sort") as SortKey) || "churn_score";
  const initDir    = (searchParams.get("dir")  as SortDir) || "desc";
  const initSearch = searchParams.get("q")     || "";
  const initKam    = searchParams.get("kam")   || "";
  const initInd    = searchParams.get("industry") || "";
  const initPage   = parseInt(searchParams.get("page") || "1", 10);

  const [accounts, setAccounts]       = useState<Account[]>([]);
  const [stats, setStats]             = useState({ total: 0, green: 0, yellow: 0, red: 0, upsell: 0, totalMrr: 0, churnMrr: 0, warningMrr: 0 });
  const [page, setPage]               = useState(initPage);
  const [totalItems, setTotalItems]   = useState(0);
  const [search, setSearch]           = useState(initSearch);
  const [activeTab, setActiveTab]     = useState<Tab>(initTab);
  const [sortKey, setSortKey]         = useState<SortKey>(initSort);
  const [sortDir, setSortDir]         = useState<SortDir>(initDir);
  const [loading, setLoading]         = useState(false);
  const [fetchError, setFetchError]   = useState<string | null>(null);
  const [kamFilter, setKamFilter]     = useState(initKam);
  const [industryFilter, setIndustryFilter] = useState(initInd);
  const [kamOptions, setKamOptions]   = useState<string[]>([]);
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── URL sync ───────────────────────────────────────────────────────────────
  const syncUrl = useCallback((
    tab: Tab, sort: SortKey, dir: SortDir,
    q: string, kam: string, ind: string, pg: number
  ) => {
    const p = new URLSearchParams();
    if (tab !== "all")          p.set("tab", tab);
    if (sort !== "churn_score") p.set("sort", sort);
    if (dir !== "desc")         p.set("dir", dir);
    if (q)                      p.set("q", q);
    if (kam)                    p.set("kam", kam);
    if (ind)                    p.set("industry", ind);
    if (pg !== 1)               p.set("page", String(pg));
    const qs = p.toString();
    router.replace(`/app${qs ? "?" + qs : ""}`, { scroll: false });
  }, [router]);

  // ── Core fetch ─────────────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async (
    p: number, q: string, tab: Tab, sKey: SortKey, sDir: SortDir, kam: string, ind: string
  ) => {
    setLoading(true);
    setFetchError(null);

    let f = `(account_id.status="active"||account_id.status="non_renewing")`;
    if (q)   f += `&&(account_id.company~"${q}"||account_id.email~"${q}")`;
    if (kam) f += `&&(account_id.kam="${kam}")`;
    if (ind) f += `&&(account_id.industry="${ind}")`;
    if (tab === "upsell")     f += `&&(upsell_score>=40)`;
    else if (tab !== "all")   f += `&&(health="${tab}")`;

    const sortPrefix = sDir === "desc" ? "-" : "";
    // mrr and company live on the accounts relation, not on churn_scores
    const RELATION_FIELDS: Record<string, string> = { company: "account_id.company", mrr: "account_id.mrr", cb_created_at: "account_id.cb_created_at" };
    const sortField  = RELATION_FIELDS[sKey] ?? sKey;
    const finalSort  = tab === "upsell" ? "-upsell_score" : `${sortPrefix}${sortField}`;

    const res = await fetch(
      `${PB}/api/collections/churn_scores/records?perPage=50&page=${p}&sort=${finalSort}&expand=account_id&filter=${encodeURIComponent(f)}`
    ).then(r => {
      if (!r.ok) throw new Error(`PocketBase ${r.status}`);
      return r.json();
    }).catch((e) => { setFetchError(`Could not reach data source — ${e.message}`); return { items: [], totalItems: 0 }; });

    setAccounts((res.items || []).map((s: any) => ({
      id:               s.expand?.account_id?.id || s.account_id,
      company:          s.expand?.account_id?.company   || "Unknown",
      email:            s.expand?.account_id?.email     || "",
      plan:             s.expand?.account_id?.plan      || "",
      mrr:              s.expand?.account_id?.mrr       || 0,
      mrr_inr:          s.expand?.account_id?.mrr_inr   || 0,
      currency:         s.expand?.account_id?.currency  || "INR",
      status:           s.expand?.account_id?.status    || "",
      kam:              s.expand?.account_id?.kam        || "",
      industry:         s.expand?.account_id?.industry  || "",
      cb_created_at:    s.expand?.account_id?.cb_created_at || "",
      churn_score:      s.churn_score,
      upsell_score:     s.upsell_score,
      health:           s.health,
      explanation:      s.explanation,
      churn_reasons:    Array.isArray(s.churn_reasons)  ? s.churn_reasons  : [],
      upsell_reasons:   Array.isArray(s.upsell_reasons) ? s.upsell_reasons : [],
      convos_7d:        s.convos_7d        || 0,
      convos_30d:       s.convos_30d       || 0,
      wow_delta:        s.wow_delta        || 0,
      messages_7d:      s.messages_7d      || 0,
      avg_msgs_per_convo: s.avg_msgs_per_convo || 0,
      bot_ratio:        s.bot_ratio        || 0,
      resolution_rate:  s.resolution_rate  || 0,
      avg_frt_secs:     s.avg_frt_secs     || 0,
      active_agents:    s.active_agents    || 0,
      active_bots:      s.active_bots      || 0,
      total_channels:   s.total_channels   || 0,
      trend_consistency: s.trend_consistency || 0,
      scored_at:        s.scored_at,
    })));
    setTotalItems(res.totalItems || 0);
    setLoading(false);
  }, []);

  // ── Stats fetch ────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    const BASE = 'account_id.status="active"||account_id.status="non_renewing"';
    const [all, green, yellow, red, upsellRes] = await Promise.all([
      fetch(`${PB}/api/collections/churn_scores/records?perPage=1&filter=${encodeURIComponent(BASE)}`).then(r => r.json()).catch(() => ({ totalItems: 0 })),
      fetch(`${PB}/api/collections/churn_scores/records?perPage=1&filter=${encodeURIComponent(`(${BASE})&&health="green"`)}`).then(r => r.json()).catch(() => ({ totalItems: 0 })),
      fetch(`${PB}/api/collections/churn_scores/records?perPage=1&filter=${encodeURIComponent(`(${BASE})&&health="yellow"`)}`).then(r => r.json()).catch(() => ({ totalItems: 0 })),
      fetch(`${PB}/api/collections/churn_scores/records?perPage=1&filter=${encodeURIComponent(`(${BASE})&&health="red"`)}`).then(r => r.json()).catch(() => ({ totalItems: 0 })),
      fetch(`${PB}/api/collections/churn_scores/records?perPage=1&filter=${encodeURIComponent(`(${BASE})&&upsell_score>=40`)}`).then(r => r.json()).catch(() => ({ totalItems: 0 })),
    ]);

    const STATUS_F = encodeURIComponent('status="active"||status="non_renewing"');
    let totalMrr = 0, pg = 1;
    while (true) {
      const r = await fetch(`${PB}/api/collections/accounts/records?perPage=500&page=${pg}&fields=mrr_inr&filter=${STATUS_F}`).then(r => r.json()).catch(() => ({ items: [] }));
      totalMrr += (r.items || []).reduce((s: number, a: any) => s + (a.mrr_inr || 0), 0);
      if ((r.items || []).length < 500) break;
      pg++;
    }

    const RED_F    = encodeURIComponent(`(${BASE})&&health="red"`);
    const YELLOW_F = encodeURIComponent(`(${BASE})&&health="yellow"`);

    let churnMrr = 0, warningMrr = 0;
    pg = 1;
    while (true) {
      const r = await fetch(`${PB}/api/collections/churn_scores/records?perPage=500&page=${pg}&filter=${RED_F}&expand=account_id`).then(r => r.json()).catch(() => ({ items: [] }));
      churnMrr += (r.items || []).reduce((s: number, sc: any) => s + (sc.expand?.account_id?.mrr_inr || 0), 0);
      if ((r.items || []).length < 500) break;
      pg++;
    }
    pg = 1;
    while (true) {
      const r = await fetch(`${PB}/api/collections/churn_scores/records?perPage=500&page=${pg}&filter=${YELLOW_F}&expand=account_id`).then(r => r.json()).catch(() => ({ items: [] }));
      warningMrr += (r.items || []).reduce((s: number, sc: any) => s + (sc.expand?.account_id?.mrr_inr || 0), 0);
      if ((r.items || []).length < 500) break;
      pg++;
    }

    setStats({ total: all.totalItems || 0, green: green.totalItems || 0, yellow: yellow.totalItems || 0, red: red.totalItems || 0, upsell: upsellRes.totalItems || 0, totalMrr, churnMrr, warningMrr });
  }, []);

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchAccounts(1, search, activeTab, sortKey, sortDir, kamFilter, industryFilter);
      syncUrl(activeTab, sortKey, sortDir, search, kamFilter, industryFilter, 1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Instant filter/sort changes ───────────────────────────────────────────
  const apply = useCallback((
    overrides: Partial<{ tab: Tab; sKey: SortKey; sDir: SortDir; kam: string; ind: string; pg: number }>
  ) => {
    const tab = overrides.tab  ?? activeTab;
    const sKey = overrides.sKey ?? sortKey;
    const sDir = overrides.sDir ?? sortDir;
    const kam  = overrides.kam  ?? kamFilter;
    const ind  = overrides.ind  ?? industryFilter;
    const pg   = overrides.pg   ?? 1;

    if (overrides.tab  !== undefined) setActiveTab(tab);
    if (overrides.sKey !== undefined) setSortKey(sKey);
    if (overrides.sDir !== undefined) setSortDir(sDir);
    if (overrides.kam  !== undefined) setKamFilter(kam);
    if (overrides.ind  !== undefined) setIndustryFilter(ind);
    if (overrides.pg   !== undefined) setPage(pg);

    fetchAccounts(pg, search, tab, sKey, sDir, kam, ind);
    syncUrl(tab, sKey, sDir, search, kam, ind, pg);
  }, [activeTab, sortKey, sortDir, kamFilter, industryFilter, search, fetchAccounts, syncUrl]);

  // ── Column sort toggle ─────────────────────────────────────────────────────
  const toggleSort = (col: SortKey) => {
    if (sortKey === col) {
      apply({ sDir: sortDir === "desc" ? "asc" : "desc" });
    } else {
      apply({ sKey: col, sDir: "desc" });
    }
  };

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchStats();
    fetchAccounts(initPage, initSearch, initTab, initSort, initDir, initKam, initInd);
    fetch(`${PB}/api/collections/accounts/records?perPage=500&fields=kam,industry&filter=${encodeURIComponent('status="active"||status="non_renewing"')}`)
      .then(r => r.json())
      .then(data => {
        setKamOptions(Array.from(new Set((data.items || []).map((a: any) => a.kam).filter(Boolean))).sort() as string[]);
        setIndustryOptions(Array.from(new Set((data.items || []).map((a: any) => a.industry).filter(Boolean))).sort() as string[]);
      }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Active filter chips ────────────────────────────────────────────────────
  const activeFilters: { label: string; clear: () => void }[] = [];
  if (kamFilter)      activeFilters.push({ label: `KAM: ${kamFilter}`,      clear: () => apply({ kam: "" }) });
  if (industryFilter) activeFilters.push({ label: `Industry: ${industryFilter}`, clear: () => apply({ ind: "" }) });

  const clearAll = () => {
    setSearch("");
    apply({ kam: "", ind: "", tab: "all" });
  };
  const hasFilters = !!search || !!kamFilter || !!industryFilter || activeTab !== "all";

  const healthColor = (h?: string) =>
    h === "red"    ? "bg-red-100 text-red-700 border-red-200"
    : h === "yellow" ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-emerald-100 text-emerald-700 border-emerald-200";

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-zinc-300 ml-1 inline" />;
    return sortDir === "asc"
      ? <ChevronUp   className="w-3 h-3 text-zinc-700 ml-1 inline" />
      : <ChevronDown className="w-3 h-3 text-zinc-700 ml-1 inline" />;
  };

  const pages = Math.max(1, Math.ceil(totalItems / 50));

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      <Sidebar />
      <main className="flex-1 pl-16">

        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-sm">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">Gallabox Churn</h1>
              <p className="text-sm text-zinc-500">Accounts ranked by churn risk and upsell signals</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { fetchStats(); fetchAccounts(page, search, activeTab, sortKey, sortDir, kamFilter, industryFilter); }}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>

        {fetchError && (
          <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
            <span className="font-semibold">⚠ Sync error:</span> {fetchError} — data may be stale.
          </div>
        )}

        <section className="p-6 space-y-4">

          {/* Stats row */}
          <div className="grid grid-cols-6 gap-3">
            {[
              { label: "Total Accounts", value: stats.total,                        color: "text-zinc-900" },
              { label: "Healthy",        value: stats.green,                        color: "text-emerald-600" },
              { label: "Warning",        value: stats.yellow,                       color: "text-amber-600" },
              { label: "At Risk",        value: stats.red,                          color: "text-red-600" },
              { label: "Warning MRR",    value: formatInrShort(stats.warningMrr),   color: "text-amber-600", raw: true },
              { label: "Churn Risk MRR", value: formatInrShort(stats.churnMrr),     color: "text-red-600",   raw: true },
            ].map(({ label, value, color, raw }) => (
              <Card key={label} className="shadow-none">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-zinc-500 mb-1">{label}</div>
                  <div className={cn("text-2xl font-semibold", color)}>{raw ? value : value.toLocaleString()}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Search + filters bar */}
          <Card className="shadow-none">
            <CardContent className="pt-4 pb-4 space-y-3">

              {/* Row 1: search + dropdowns */}
              <div className="flex items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === "Escape" && setSearch("")}
                    placeholder="Search company or email…"
                    className="w-full h-9 rounded-lg border border-zinc-200 bg-white pl-9 pr-8 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 transition"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* KAM */}
                <select
                  value={kamFilter}
                  onChange={e => apply({ kam: e.target.value })}
                  className={cn(
                    "h-9 rounded-lg border bg-white px-3 text-sm outline-none focus:border-zinc-400 transition",
                    kamFilter ? "border-violet-300 text-violet-700 bg-violet-50" : "border-zinc-200 text-zinc-600"
                  )}
                >
                  <option value="">All KAMs</option>
                  {kamOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>

                {/* Industry */}
                <select
                  value={industryFilter}
                  onChange={e => apply({ ind: e.target.value })}
                  className={cn(
                    "h-9 rounded-lg border bg-white px-3 text-sm outline-none focus:border-zinc-400 transition",
                    industryFilter ? "border-violet-300 text-violet-700 bg-violet-50" : "border-zinc-200 text-zinc-600"
                  )}
                >
                  <option value="">All Industries</option>
                  {industryOptions.map(i => <option key={i} value={i}>{i}</option>)}
                </select>

                {/* Clear all — only shown when something is active */}
                {hasFilters && (
                  <button
                    onClick={clearAll}
                    className="h-9 px-3 rounded-lg border border-zinc-200 text-sm text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 flex items-center gap-1.5 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}

                {/* Result count */}
                <span className="ml-auto text-sm text-zinc-400 whitespace-nowrap">
                  {loading ? "Loading…" : `${totalItems.toLocaleString()} account${totalItems !== 1 ? "s" : ""}`}
                </span>
              </div>

              {/* Row 2: health tabs + active filter chips */}
              <div className="flex items-center gap-2 flex-wrap">
                {HEALTH_TABS.map(([key, label, cls]) => (
                  <button
                    key={key}
                    onClick={() => apply({ tab: key })}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-xs font-medium border transition",
                      activeTab === key
                        ? (cls || "bg-zinc-900 text-white border-zinc-900")
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                    )}
                  >
                    {label}
                    {key !== "all" && (
                      <span className="ml-1.5 opacity-70">
                        {key === "red" ? stats.red : key === "yellow" ? stats.yellow : key === "green" ? stats.green : stats.upsell}
                      </span>
                    )}
                  </button>
                ))}

                {/* Active filter chips */}
                {activeFilters.map(f => (
                  <span key={f.label} className="inline-flex items-center gap-1 rounded-full bg-violet-100 border border-violet-200 px-3 py-1 text-xs font-medium text-violet-700">
                    {f.label}
                    <button onClick={f.clear} className="hover:text-violet-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

            </CardContent>
          </Card>

          {/* Table */}
          <Card className="shadow-none">
            <CardContent className="pt-0 pb-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left">
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500 cursor-pointer select-none" onClick={() => toggleSort("company")}>
                        Account <SortIcon col="company" />
                      </th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500">Health</th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500 cursor-pointer select-none" onClick={() => toggleSort("churn_score")}>
                        Churn <SortIcon col="churn_score" />
                      </th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500 cursor-pointer select-none" onClick={() => toggleSort("upsell_score")}>
                        Upsell <SortIcon col="upsell_score" />
                      </th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500 cursor-pointer select-none" onClick={() => toggleSort("mrr")}>
                        MRR <SortIcon col="mrr" />
                      </th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500">KAM</th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500">Industry</th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500 cursor-pointer select-none" onClick={() => toggleSort("cb_created_at")}>
                        Age <SortIcon col="cb_created_at" />
                      </th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500 cursor-pointer select-none" onClick={() => toggleSort("convos_30d")}>
                        Convos 30d <SortIcon col="convos_30d" />
                      </th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500">Resolution</th>
                      <th className="py-3 pr-3 text-xs font-medium text-zinc-500">FRT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && accounts.length === 0 && (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-zinc-100">
                          {Array.from({ length: 10 }).map((_, j) => (
                            <td key={j} className="py-3 pr-3">
                              <div className="h-4 bg-zinc-100 rounded animate-pulse" style={{ width: j === 0 ? "140px" : "60px" }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                    {!loading && accounts.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-16 text-center text-zinc-400 text-sm">
                          No accounts match your filters.
                          {hasFilters && (
                            <button onClick={clearAll} className="ml-2 text-violet-600 hover:underline">Clear filters</button>
                          )}
                        </td>
                      </tr>
                    )}
                    {accounts.map((a) => (
                      <tr
                        key={a.id}
                        className={cn("border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer transition-colors", loading && "opacity-60")}
                        onClick={() => router.push(`/customer/${a.id}`)}
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-zinc-900">{a.company}</span>
                            {a.plan?.toLowerCase().includes("partner") && (
                              <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 border border-violet-200">PARTNER</span>
                            )}
                            {a.plan?.toLowerCase().includes("message-credits") && (
                              <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">CREDITS</span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">{a.email}</div>
                        </td>
                        <td className="py-3 pr-3">
                          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize", healthColor(a.health))}>
                            {a.health || "green"}
                          </span>
                        </td>
                        <td className="py-3 pr-3 tabular-nums font-medium">{a.churn_score ?? "—"}</td>
                        <td className="py-3 pr-3 tabular-nums">
                          {(a.upsell_score ?? 0) >= 40
                            ? <span className="text-indigo-600 font-medium">{a.upsell_score}</span>
                            : <span className="text-zinc-400">{a.upsell_score ?? "—"}</span>}
                        </td>
                        <td className="py-3 pr-3 tabular-nums">{formatMrr(a.mrr, a.currency || "INR")}</td>
                        <td className="py-3 pr-3 text-zinc-500 text-xs">{a.kam || <span className="text-zinc-300">—</span>}</td>
                        <td className="py-3 pr-3 text-zinc-500 text-xs">{a.industry || <span className="text-zinc-300">—</span>}</td>
                        <td className="py-3 pr-3">
                          {(() => {
                            const { label, stage } = accountAge(a.cb_created_at);
                            if (label === "—") return <span className="text-zinc-300">—</span>;
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="tabular-nums text-zinc-700 text-xs">{label}</span>
                                {stage === "new" && <span className="text-[10px] font-semibold px-1 rounded bg-sky-100 text-sky-700">NEW</span>}
                                {stage === "ramping" && <span className="text-[10px] font-semibold px-1 rounded bg-amber-100 text-amber-700">RAMP</span>}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 pr-3 tabular-nums">{(a.convos_30d ?? 0).toLocaleString()}</td>
                        <td className="py-3 pr-3">{a.resolution_rate ? `${Math.round(a.resolution_rate)}%` : <span className="text-zinc-300">—</span>}</td>
                        <td className="py-3 pr-3 text-zinc-500">{a.avg_frt_secs ? `${Math.round(a.avg_frt_secs / 60)}m` : <span className="text-zinc-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalItems > 0 && (
                <div className="flex items-center justify-between pt-4 border-t border-zinc-100 mt-2">
                  <span className="text-xs text-zinc-400">
                    Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, totalItems)} of {totalItems.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => apply({ pg: page - 1 })}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="px-3 text-sm text-zinc-600">{page} / {pages}</span>
                    <Button
                      variant="outline" size="sm"
                      disabled={page >= pages || loading}
                      onClick={() => apply({ pg: page + 1 })}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>

        </section>
      </main>
    </div>
  );
}
