"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp,
  Bell, Bot, Radio, ChevronLeft, Link2, Mail,
  MessageSquare, RefreshCw, TrendingUp, Users, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type MonthRow = {
  month: string;
  label?: string;
  is_partial?: boolean;
  new_contacts_anomaly?: boolean;
  total_conversations: number;
  resolved_conversations: number;
  resolution_rate_pct: number;
  new_contact_convos: number;
  avg_frt_mins: number;
  avg_ttr_mins: number;
  whatsapp_convos: number;
  web_convos: number;
  instagram_convos: number;
  active_accounts: number;
  active_agents: number;
  active_bots: number;
  bot_conversations: number;
  new_contacts: number;
  bot: number;
  broadcast: number;
  sequence: number;
  api: number;
  inbox: number;
  integration: number;
  system: number;
  bot_accounts: number;
  broadcast_accounts: number;
  sequence_accounts: number;
  whatsapp_channels: number;
  web_channels: number;
  instagram_channels: number;
  accounts_with_channels: number;
  zoho_accounts: number;
  hubspot_accounts: number;
  pipedrive_accounts: number;
  zoho_bulk: number;
  hubspot_workflow: number;
  pipedrive_widget: number;
  // computed
  convos_mom: number;
  accounts_mom: number;
  frt_mom: number;
  bot_mom: number;
  broadcast_mom: number;
  sequence_mom: number;
  new_contacts_mom: number;
  broadcast_pct: number;
  bot_pct: number;
  api_pct: number;
  inbox_pct: number;
  sequence_pct: number;
  integration_pct: number;
  [key: string]: any;
};

function fmtNum(n: any): string {
  if (n == null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : Number(n);
  if (isNaN(num)) return "—";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}k`;
  return String(Math.round(num));
}

function fmtMins(mins: number): string {
  if (!mins || mins === 0) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function MoM({ val, inverse = false }: { val?: number | null; inverse?: boolean }) {
  if (!val) return <span className="text-xs text-zinc-400">—</span>;
  const positive = inverse ? val < 0 : val > 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-medium", positive ? "text-emerald-600" : "text-red-500")}>
      {val > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(val)}%
    </span>
  );
}

function StatCard({ title, value, sub, mom, momInverse = false, icon: Icon, color, warn }: {
  title: string; value: string; sub?: string; mom?: number | null;
  momInverse?: boolean; icon: any; color: string; warn?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", color)}>
            <Icon className="w-4 h-4" />
          </div>
          <MoM val={mom} inverse={momInverse} />
        </div>
        <p className="text-2xl font-bold text-zinc-900 leading-none mb-1">{value}</p>
        <p className="text-xs text-zinc-500">{title}</p>
        {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
        {warn && <p className="text-xs text-amber-600 mt-1 font-medium">⚠ {warn}</p>}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-2">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function CustomTooltip({ active, payload, label, unit = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-zinc-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-zinc-500">{p.name}:</span>
          <span className="font-medium text-zinc-900">{typeof p.value === "number" ? fmtNum(p.value) : p.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

const C = {
  whatsapp: "#25D366", web: "#6366f1", instagram: "#e1306c",
  resolved: "#10b981", total: "#6366f1", accounts: "#0ea5e9",
  agents: "#f59e0b", bots: "#8b5cf6", frt: "#ef4444", ttr: "#f97316",
  rate: "#10b981", newContacts: "#06b6d4", broadcast: "#7c3aed",
  bot: "#2563eb", api: "#0891b2", inbox: "#059669", sequence: "#d97706",
  integration: "#9333ea", zoho: "#e31937", hubspot: "#ff7a59",
};

export default function MetricsPage() {
  const router = useRouter();
  const [data, setData] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/metrics");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const normalized: MonthRow[] = json.data.map((r: any) => ({
        ...r,
        label: new Date(r.month + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      }));
      setData(normalized);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Separate complete months from partial current month
  const completeData = data.filter(r => !r.is_partial);
  const partialMonth = data.find(r => r.is_partial);

  // "Latest" = last complete month for KPI cards
  const latest = completeData[completeData.length - 1];
  const prev   = completeData[completeData.length - 2];

  // Chart data uses all months but dims the partial one
  const chartData = data;

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 pl-16 flex items-center justify-center">
      <div className="text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-zinc-400 mx-auto mb-3" />
        <p className="text-sm text-zinc-500">Loading metrics from PocketBase…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-zinc-50 pl-16 flex items-center justify-center">
      <div className="text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-600 font-medium mb-4">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />
      <main className="pl-16">
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.push("/app")}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Dashboard
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-zinc-900">Product Metrics</h1>
                <p className="text-sm text-zinc-500">Month-on-month platform performance · {completeData.length} complete months</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && <span className="text-xs text-zinc-400">Updated {lastUpdated}</span>}
              <Button size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </header>

        <div className="px-6 py-6 space-y-8">

          {/* Partial month banner */}
          {partialMonth && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-amber-800">
                <strong>{partialMonth.label}</strong> is the current month (in progress).
                All KPI cards below show <strong>{latest?.label}</strong> (last complete month) for accuracy.
              </span>
            </div>
          )}

          {/* ── KPI CARDS ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
                {latest?.label} — Last Complete Month
              </h2>
              <span className="text-xs text-zinc-400">vs {prev?.label}</span>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-3">
              <StatCard
                title="Conversations"
                value={fmtNum(latest?.total_conversations)}
                sub={`${fmtNum(latest?.resolved_conversations)} resolved`}
                mom={latest?.convos_mom}
                icon={MessageSquare}
                color="bg-indigo-100 text-indigo-600"
              />
              <StatCard
                title="Resolution Rate"
                value={`${latest?.resolution_rate_pct}%`}
                sub={`prev: ${prev?.resolution_rate_pct}%`}
                mom={prev ? mom_pct(latest?.resolution_rate_pct, prev.resolution_rate_pct) : undefined}
                icon={Activity}
                color="bg-emerald-100 text-emerald-600"
              />
              <StatCard
                title="Avg First Response Time"
                value={fmtMins(latest?.avg_frt_mins)}
                sub={`prev: ${fmtMins(prev?.avg_frt_mins)}`}
                mom={latest?.frt_mom}
                momInverse
                icon={Zap}
                color="bg-amber-100 text-amber-600"
              />
              <StatCard
                title="Avg Time to Resolve"
                value={fmtMins(latest?.avg_ttr_mins)}
                sub={`prev: ${fmtMins(prev?.avg_ttr_mins)}`}
                mom={prev ? mom_pct(latest?.avg_ttr_mins, prev.avg_ttr_mins) : undefined}
                momInverse
                icon={AlertTriangle}
                color="bg-orange-100 text-orange-600"
              />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <StatCard title="Active Accounts" value={fmtNum(latest?.active_accounts)} mom={latest?.accounts_mom} icon={Users} color="bg-sky-100 text-sky-600" />
              <StatCard title="Active Agents" value={fmtNum(latest?.active_agents)} mom={prev ? mom_pct(latest?.active_agents, prev.active_agents) : undefined} icon={Users} color="bg-violet-100 text-violet-600" />
              <StatCard title="Active Bots" value={fmtNum(latest?.active_bots)} mom={prev ? mom_pct(latest?.active_bots, prev.active_bots) : undefined} icon={Bot} color="bg-fuchsia-100 text-fuchsia-600" />
              <StatCard
                title="New Contacts"
                value={latest?.new_contacts_anomaly ? "—" : fmtNum(latest?.new_contacts)}
                sub="first-time conversations"
                mom={latest?.new_contacts_anomaly ? undefined : latest?.new_contacts_mom}
                icon={Users}
                color="bg-cyan-100 text-cyan-600"
                warn={latest?.new_contacts_anomaly ? "Data anomaly detected" : undefined}
              />
            </div>
          </div>

          {/* ── CHARTS ROW 1 ── */}
          <div className="grid grid-cols-2 gap-6">
            <ChartCard title="Conversations Volume" sub="Total created vs resolved per month (partial month shown lighter)">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.total} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={C.total} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.resolved} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={C.resolved} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="total_conversations" name="Created" stroke={C.total} fill="url(#gTotal)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="resolved_conversations" name="Resolved" stroke={C.resolved} fill="url(#gResolved)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Channel Mix" sub="WhatsApp · Web · Instagram conversations">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="whatsapp_convos" name="WhatsApp" stackId="a" fill={C.whatsapp} />
                  <Bar dataKey="instagram_convos" name="Instagram" stackId="a" fill={C.instagram} />
                  <Bar dataKey="web_convos" name="Web" stackId="a" fill={C.web} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── CHARTS ROW 2 ── */}
          <div className="grid grid-cols-2 gap-6">
            <ChartCard title="Response & Resolution Time" sub="Avg FRT and time-to-resolve in minutes (lower = better)">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={v => `${fmtNum(v)}m`} tick={{ fontSize: 11, fill: "#9ca3af" }} width={48} />
                  <Tooltip content={<CustomTooltip unit="m" />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="avg_frt_mins" name="Avg FRT" stroke={C.frt} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="avg_ttr_mins" name="Avg TTR" stroke={C.ttr} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Resolution Rate %" sub="% of conversations resolved each month">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.rate} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.rate} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} width={40} />
                  <Tooltip content={<CustomTooltip unit="%" />} />
                  <Area type="monotone" dataKey="resolution_rate_pct" name="Resolution %" stroke={C.rate} fill="url(#gRate)" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── ACTIVE ACCOUNTS & TEAM ── */}
          <div className="grid grid-cols-2 gap-6">
            <ChartCard title="Active Accounts" sub="Distinct accounts with at least 1 conversation">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gAccounts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.accounts} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.accounts} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="active_accounts" name="Active Accounts" stroke={C.accounts} fill="url(#gAccounts)" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Team & Bot Engagement" sub="Active agents and bots per month">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="active_agents" name="Active Agents" stroke={C.agents} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="active_bots" name="Active Bots" stroke={C.bots} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── BOT / AUTOMATION ── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-5 bg-blue-600 rounded-full" />
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Bot / Automation Usage</h2>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <StatCard
                title="Bot Conversations"
                value={fmtNum(latest?.bot_conversations)}
                sub={`${fmtNum(latest?.bot_accounts)} accounts using bots`}
                mom={prev ? mom_pct(latest?.bot_conversations, prev.bot_conversations) : undefined}
                icon={Bot}
                color="bg-blue-100 text-blue-600"
              />
              <StatCard
                title="Bot % of Conversations"
                value={latest?.total_conversations > 0
                  ? `${Math.round((latest.bot_conversations / latest.total_conversations) * 100)}%`
                  : "—"}
                sub="bot convos / total convos"
                icon={Zap}
                color="bg-indigo-100 text-indigo-600"
              />
              <StatCard
                title="Bot Messages"
                value={fmtNum(latest?.bot)}
                sub="raw bot message count"
                mom={latest?.bot_mom}
                icon={Bot}
                color="bg-violet-100 text-violet-600"
              />
              <StatCard
                title="Sequence Messages"
                value={fmtNum(latest?.sequence)}
                sub={`${fmtNum(latest?.sequence_accounts)} accounts`}
                mom={latest?.sequence_mom}
                icon={TrendingUp}
                color="bg-amber-100 text-amber-600"
              />
            </div>
            <ChartCard title="Bot Conversations Over Time" sub="Monthly bot conversation volume (not message count)">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gBot" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.bot} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.bot} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={48} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="bot_conversations" name="Bot Conversations" stroke={C.bot} fill="url(#gBot)" strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── FEATURE ADOPTION ── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-5 bg-violet-600 rounded-full" />
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Feature Adoption by Message Medium</h2>
            </div>
            <div className="grid grid-cols-5 gap-4 mb-4">
              <StatCard title="Broadcast" value={fmtNum(latest?.broadcast)} sub={`${fmtNum(latest?.broadcast_accounts)} accounts`} mom={latest?.broadcast_mom} icon={Radio} color="bg-violet-100 text-violet-600" />
              <StatCard title="Bot Messages" value={fmtNum(latest?.bot)} sub="automation" mom={latest?.bot_mom} icon={Bot} color="bg-blue-100 text-blue-600" />
              <StatCard title="API Messages" value={fmtNum(latest?.api)} sub="api messages" icon={Link2} color="bg-cyan-100 text-cyan-600" />
              <StatCard title="Inbox Messages" value={fmtNum(latest?.inbox)} sub="team inbox" icon={Mail} color="bg-emerald-100 text-emerald-600" />
              <StatCard title="Sequences" value={fmtNum(latest?.sequence)} sub="outbound seqs" mom={latest?.sequence_mom} icon={TrendingUp} color="bg-amber-100 text-amber-600" />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <ChartCard title="Message Volume by Medium" sub="Absolute message count per channel per month">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={48} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="broadcast" name="Broadcast" stackId="a" fill={C.broadcast} />
                    <Bar dataKey="bot" name="Bot" stackId="a" fill={C.bot} />
                    <Bar dataKey="api" name="API" stackId="a" fill={C.api} />
                    <Bar dataKey="inbox" name="Inbox" stackId="a" fill={C.inbox} />
                    <Bar dataKey="sequence" name="Sequence" stackId="a" fill={C.sequence} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="% Share by Medium" sub="Each channel's share of total messages (computed from actual counts)">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#9ca3af" }} width={40} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip unit="%" />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="broadcast_pct" name="Broadcast" stackId="a" fill={C.broadcast} />
                    <Bar dataKey="bot_pct" name="Bot" stackId="a" fill={C.bot} />
                    <Bar dataKey="api_pct" name="API" stackId="a" fill={C.api} />
                    <Bar dataKey="inbox_pct" name="Inbox" stackId="a" fill={C.inbox} />
                    <Bar dataKey="sequence_pct" name="Sequence" stackId="a" fill={C.sequence} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>

          {/* ── CRM INTEGRATIONS ── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-5 bg-red-600 rounded-full" />
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">CRM Integrations</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <StatCard title="Zoho Accounts" value={fmtNum(latest?.zoho_accounts)} sub="using Zoho bulk" icon={Users} color="bg-red-100 text-red-600" />
              <StatCard title="HubSpot Accounts" value={fmtNum(latest?.hubspot_accounts)} sub="using HubSpot workflow" icon={Users} color="bg-orange-100 text-orange-600" />
              <StatCard title="Pipedrive Accounts" value={fmtNum(latest?.pipedrive_accounts)} sub="using Pipedrive" icon={Users} color="bg-zinc-100 text-zinc-600" />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <ChartCard title="CRM Integration Messages" sub="Message volume per CRM integration per month">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={48} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="zoho_bulk" name="Zoho Bulk" fill={C.zoho} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="hubspot_workflow" name="HubSpot Workflow" fill={C.hubspot} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Accounts Using Each CRM" sub="Distinct accounts per CRM integration">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gZoho" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.zoho} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={C.zoho} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gHubspot" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.hubspot} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={C.hubspot} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                    <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={40} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="zoho_accounts" name="Zoho" stroke={C.zoho} fill="url(#gZoho)" strokeWidth={2} dot={{ r: 3 }} />
                    <Area type="monotone" dataKey="hubspot_accounts" name="HubSpot" stroke={C.hubspot} fill="url(#gHubspot)" strokeWidth={2} dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>

          {/* ── SEQUENCES & BROADCASTS ── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-5 bg-amber-600 rounded-full" />
              <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Sequences & Broadcasts</h2>
            </div>
            <ChartCard title="Sequences & Broadcasts Over Time" sub="Monthly outbound sequence and bulk broadcast message volume">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis tickFormatter={fmtNum} tick={{ fontSize: 11, fill: "#9ca3af" }} width={48} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="sequence" name="Sequences" stroke={C.sequence} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="broadcast" name="Broadcast" stroke={C.broadcast} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── RAW DATA TABLE ── */}
          <Card>
            <CardContent className="pt-5 pb-2">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Monthly Data Table</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      {["Month", "Convos", "Resolved", "Res %", "FRT", "TTR", "Bot Convos", "Accounts", "Agents", "Bots", "WA", "Instagram", "Web"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-zinc-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {[...chartData].reverse().map((r) => (
                      <tr key={r.month} className={cn("hover:bg-zinc-50/50", r.is_partial && "opacity-60 italic")}>
                        <td className="px-3 py-2 font-medium text-zinc-800 whitespace-nowrap">
                          {r.label}{r.is_partial && <span className="ml-1 text-amber-500 text-[10px] not-italic">(partial)</span>}
                        </td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.total_conversations)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.resolved_conversations)}</td>
                        <td className="px-3 py-2 font-medium text-emerald-700">{r.resolution_rate_pct}%</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtMins(r.avg_frt_mins)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtMins(r.avg_ttr_mins)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.bot_conversations)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.active_accounts)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.active_agents)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.active_bots)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.whatsapp_convos)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.instagram_convos)}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtNum(r.web_convos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}

// helper used inline
function mom_pct(curr: number, prev: number): number {
  if (!prev || prev === 0) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}
