"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles,
  Ticket,
} from "lucide-react";

const PB = "/api/pb";

type SortKey = "created_time" | "ticket_number" | "priority" | "status" | "category" | "company" | "thread_count";
type SortDir = "desc" | "asc";

type TicketRow = {
  id: string;
  ticket_id: string;
  ticket_number: string;
  subject: string;
  status: string;
  status_type: string;
  category: string;
  priority: string;
  is_escalated: boolean;
  is_churn_ticket: boolean;
  thread_count: number;
  created_time: string;
  web_url: string;
  account_id: string;
  // joined from accounts
  company: string;
  email: string;
  kam: string;
  lead_owner: string;
};

const PRIORITY_ORDER: Record<string, number> = {
  Urgent: 4, High: 3, Medium: 2, Low: 1, Cooling: 0,
};

const STATUS_COLOR: Record<string, string> = {
  Open: "text-blue-600 bg-blue-50 border-blue-200",
  "Assign to owner": "text-orange-600 bg-orange-50 border-orange-200",
  Pending: "text-amber-600 bg-amber-50 border-amber-200",
  "On Hold": "text-purple-600 bg-purple-50 border-purple-200",
  Resolved: "text-zinc-400 bg-zinc-50 border-zinc-200",
};

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "text-red-600 bg-red-50",
  High: "text-orange-600 bg-orange-50",
  Medium: "text-amber-600 bg-amber-50",
  Low: "text-zinc-500 bg-zinc-100",
  Cooling: "text-blue-500 bg-blue-50",
};

export default function TicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filtered, setFiltered] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState("active"); // active | all | open | on_hold | churn
  const [kamFilter, setKamFilter] = useState("");
  const [kamOptions, setKamOptions] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch active tickets (Open + On Hold)
      const filter = encodeURIComponent('status_type="Open"||status_type="On Hold"');
      const res = await fetch(
        `${PB}/collections/zoho_tickets/records?filter=${filter}&perPage=500&sort=-created_time`
      ).then(r => r.json()).catch(() => ({ items: [] }));

      const rawTickets = res.items || [];

      // Fetch account details for all unique account_ids
      const accountIds = [...new Set(rawTickets.map((t: any) => t.account_id))] as string[];
      const accountMap: Record<string, any> = {};

      // Batch fetch accounts (chunks of 50)
      for (let i = 0; i < accountIds.length; i += 50) {
        const chunk = accountIds.slice(i, i + 50);
        const f = chunk.map(id => `id="${id}"`).join("||");
        const aRes = await fetch(
          `${PB}/collections/accounts/records?filter=${encodeURIComponent(f)}&fields=id,company,email,kam,lead_owner&perPage=100`
        ).then(r => r.json()).catch(() => ({ items: [] }));
        for (const a of (aRes.items || [])) {
          accountMap[a.id] = a;
        }
      }

      const rows: TicketRow[] = rawTickets.map((t: any) => {
        const acct = accountMap[t.account_id] || {};
        return {
          id: t.id,
          ticket_id: t.ticket_id,
          ticket_number: t.ticket_number,
          subject: t.subject || "",
          status: t.status || "",
          status_type: t.status_type || "",
          category: t.category || "—",
          priority: t.priority || "Low",
          is_escalated: t.is_escalated,
          is_churn_ticket: t.is_churn_ticket,
          thread_count: t.thread_count || 0,
          created_time: t.created_time || "",
          web_url: t.web_url || "",
          account_id: t.account_id,
          company: acct.company || "Unknown",
          email: acct.email || "",
          kam: acct.kam || "—",
          lead_owner: acct.lead_owner || "—",
        };
      });

      setTickets(rows);

      // Derive filter options
      const kams = [...new Set(rows.map(r => r.kam).filter(k => k && k !== "—"))].sort() as string[];
      const cats = [...new Set(rows.map(r => r.category).filter(c => c && c !== "—"))].sort() as string[];
      setKamOptions(kams);
      setCategoryOptions(cats);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  // Apply filters + sort
  useEffect(() => {
    let rows = [...tickets];

    // Status filter
    if (statusFilter === "active") {
      rows = rows.filter(t => t.status_type === "Open" || t.status_type === "On Hold");
    } else if (statusFilter === "open") {
      rows = rows.filter(t => t.status_type === "Open");
    } else if (statusFilter === "on_hold") {
      rows = rows.filter(t => t.status_type === "On Hold");
    } else if (statusFilter === "churn") {
      rows = rows.filter(t => t.is_churn_ticket);
    } else if (statusFilter === "escalated") {
      rows = rows.filter(t => t.is_escalated);
    }

    // KAM filter
    if (kamFilter) rows = rows.filter(t => t.kam === kamFilter);

    // Category filter
    if (categoryFilter) rows = rows.filter(t => t.category === categoryFilter);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(t =>
        t.company.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.ticket_number.includes(q)
      );
    }

    // Sort
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "created_time":
          cmp = new Date(a.created_time).getTime() - new Date(b.created_time).getTime();
          break;
        case "ticket_number":
          cmp = parseInt(a.ticket_number) - parseInt(b.ticket_number);
          break;
        case "priority":
          cmp = (PRIORITY_ORDER[a.priority] || 0) - (PRIORITY_ORDER[b.priority] || 0);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "company":
          cmp = a.company.localeCompare(b.company);
          break;
        case "thread_count":
          cmp = a.thread_count - b.thread_count;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    setFiltered(rows);
  }, [tickets, statusFilter, kamFilter, categoryFilter, search, sortKey, sortDir]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 text-zinc-300 inline" />;
    return sortDir === "desc"
      ? <ArrowDown className="w-3 h-3 ml-1 text-zinc-700 inline" />
      : <ArrowUp className="w-3 h-3 ml-1 text-zinc-700 inline" />;
  };

  const cols: { key: SortKey; label: string; width: string }[] = [
    { key: "ticket_number", label: "#", width: "w-16" },
    { key: "created_time",  label: "Date", width: "w-28" },
    { key: "company",       label: "Account", width: "w-44" },
    { key: "category",      label: "Category", width: "w-36" },
    { key: "status",        label: "Status", width: "w-36" },
    { key: "priority",      label: "Priority", width: "w-24" },
    { key: "thread_count",  label: "Threads", width: "w-20" },
  ];

  const statusTabs = [
    { key: "active",    label: "Active", color: "bg-zinc-900 text-white" },
    { key: "open",      label: "Open", color: "bg-blue-600 text-white" },
    { key: "on_hold",   label: "On Hold", color: "bg-amber-500 text-white" },
    { key: "churn",     label: "Churn Signals", color: "bg-red-600 text-white" },
    { key: "escalated", label: "Escalated", color: "bg-orange-500 text-white" },
    { key: "all",       label: "All", color: "bg-zinc-700 text-white" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sidebar */}
      <Sidebar />

      <main className="pl-16">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">Support Tickets</h1>
              <p className="text-sm text-zinc-500">{filtered.length} active tickets across {[...new Set(filtered.map(t => t.account_id))].length} accounts</p>
            </div>
            <Button size="sm" onClick={fetchTickets} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>

        <div className="px-6 py-5 space-y-4">

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search account, subject, ticket #..."
                className="h-9 pl-9 pr-4 w-72 rounded-lg border border-zinc-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* KAM dropdown */}
            <select
              className="h-9 pl-3 pr-8 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={kamFilter}
              onChange={e => setKamFilter(e.target.value)}
            >
              <option value="">All KAMs</option>
              {kamOptions.map(k => <option key={k} value={k}>{k}</option>)}
            </select>

            {/* Category dropdown */}
            <select
              className="h-9 pl-3 pr-8 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Status tabs */}
            <div className="flex items-center gap-1 ml-auto">
              {statusTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    statusFilter === tab.key
                      ? tab.color
                      : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-zinc-400">
                  <Ticket className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No tickets match current filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-zinc-50/80">
                        {cols.map(col => (
                          <th
                            key={col.key}
                            className={cn(
                              "px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:text-zinc-900",
                              col.width
                            )}
                            onClick={() => handleSort(col.key)}
                          >
                            {col.label}
                            <SortIcon col={col.key} />
                          </th>
                        ))}
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Subject</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider w-32">KAM</th>
                        <th className="px-4 py-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {filtered.map(t => (
                        <tr
                          key={t.id}
                          className={cn(
                            "hover:bg-zinc-50 transition-colors cursor-pointer",
                            t.is_churn_ticket && "bg-red-50/30",
                            t.is_escalated && !t.is_churn_ticket && "bg-amber-50/30",
                          )}
                          onClick={() => router.push(`/customer/${t.account_id}`)}
                        >
                          {/* # */}
                          <td className="px-4 py-3">
                            <span className="text-xs text-zinc-400 font-mono">#{t.ticket_number}</span>
                          </td>

                          {/* Date */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs text-zinc-500">
                              {t.created_time
                                ? new Date(t.created_time).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })
                                : "—"}
                            </span>
                          </td>

                          {/* Account */}
                          <td className="px-4 py-3">
                            <p className="font-medium text-zinc-900 truncate max-w-[160px]">{t.company}</p>
                            <p className="text-xs text-zinc-400 truncate max-w-[160px]">{t.email}</p>
                          </td>

                          {/* Category */}
                          <td className="px-4 py-3">
                            <span className="text-xs text-zinc-600">{t.category}</span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "text-xs px-2 py-0.5 rounded-full border font-medium",
                                STATUS_COLOR[t.status] || "text-zinc-500 bg-zinc-50 border-zinc-200"
                              )}>
                                {t.status}
                              </span>
                              {t.is_churn_ticket && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">CHURN</span>
                              )}
                              {t.is_escalated && (
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                              )}
                            </div>
                          </td>

                          {/* Priority */}
                          <td className="px-4 py-3">
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded font-medium",
                              PRIORITY_COLOR[t.priority] || "text-zinc-500 bg-zinc-100"
                            )}>
                              {t.priority}
                            </span>
                          </td>

                          {/* Threads */}
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs text-zinc-500">{t.thread_count}</span>
                          </td>

                          {/* Subject */}
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-sm text-zinc-700 truncate">{t.subject}</p>
                          </td>

                          {/* KAM */}
                          <td className="px-4 py-3">
                            <span className="text-xs text-zinc-500 truncate max-w-[120px] block">{t.kam}</span>
                          </td>

                          {/* External link */}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            {t.web_url && (
                              <a href={t.web_url} target="_blank" rel="noopener noreferrer"
                                className="text-zinc-300 hover:text-zinc-600">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-zinc-400 text-center">
            Showing {filtered.length} tickets — click any row to open customer profile
          </p>
        </div>
      </main>
    </div>
  );
}
