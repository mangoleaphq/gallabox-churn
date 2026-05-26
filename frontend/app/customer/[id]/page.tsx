"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { cn, accountAge, formatMrr } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bot,
  ChevronLeft,
  Clock,
  ExternalLink,
  Hash,
  Layers,
  Mail,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Ticket,
  Users,
  Zap,
} from "lucide-react";

const PB = process.env.NEXT_PUBLIC_PB_BASE || "http://127.0.0.1:8090";

type Account = {
  id: string;
  amplitude_id?: string;
  company: string;
  email: string;
  plan: string;
  mrr: number;
  mrr_inr: number;
  currency: string;
  status: string;
  lead_owner?: string;
  lead_owner_email?: string;
  kam?: string;
  industry?: string;
  churn_score?: number;
  upsell_score?: number;
  health?: string;
  explanation?: string;
  churn_reasons?: string[];
  upsell_reasons?: string[];
  convos_7d?: number;
  convos_30d?: number;
  convos_90d?: number;
  wow_delta?: number;
  new_contacts_7d?: number;
  new_contacts_30d?: number;
  new_contacts_90d?: number;
  total_contacts?: number;
  messages_7d?: number;
  avg_msgs_per_convo?: number;
  bot_ratio?: number;
  resolution_rate?: number;
  avg_frt_secs?: number;
  active_agents?: number;
  active_bots?: number;
  total_channels?: number;
  trend_consistency?: number;
  open_backlog_pct?: number;
  contact_initiated_pct?: number;
  marketing_msgs_30d?: number;
  utility_msgs_30d?: number;
  service_msgs_30d?: number;
  template_sends_30d?: number;
  broadcasts_30d?: number;
  sequences_active?: number;
  total_msgs_30d?: number;
  proactive_msgs_30d?: number;
  cb_created_at?: string;
  scored_at?: string;
};

type Note = { id: string; author: string; body: string; created: string };

type SubAccount = {
  id: string;
  name: string;
  status: string;
  channel_provider: string | Record<string, unknown>;
  created_at: string;
};

type ZohoTicket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  status_type: string;
  category: string;
  sub_category: string;
  priority: string;
  is_escalated: boolean;
  is_overdue: boolean;
  is_churn_ticket: boolean;
  thread_count: number;
  created_time: string;
  closed_time: string;
  web_url: string;
};


export default function CustomerPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [account, setAccount] = useState<Account | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tickets, setTickets] = useState<ZohoTicket[]>([]);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [subAccountsLoaded, setSubAccountsLoaded] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [author, setAuthor] = useState("CSM");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"activity" | "ai" | "tickets" | "mongo" | "amplitude" | "sub-accounts">("activity");

  // Amplitude tab state
  const [amplitudeLoaded, setAmplitudeLoaded] = useState(false);
  const [amplitudeLoading, setAmplitudeLoading] = useState(false);
  const [amplitudeError, setAmplitudeError] = useState<string | null>(null);
  const [amplitudeDaily, setAmplitudeDaily] = useState<{ date: string; users: number }[]>([]);
  const [amplitudeWau, setAmplitudeWau] = useState<{ week: string; users: number }[]>([]);
  const [amplitudeMaxDau, setAmplitudeMaxDau] = useState<number>(0);
  const [amplitudeActiveDays, setAmplitudeActiveDays] = useState<number>(0);
  const [amplitudeLastDate, setAmplitudeLastDate] = useState<string | null>(null);
  const [amplitudeSessions, setAmplitudeSessions] = useState<number>(0);
  const [amplitudeFeatures, setAmplitudeFeatures] = useState<{ name: string; count: number; used: boolean }[]>([]);
  const [amplitudeIsFiltered, setAmplitudeIsFiltered] = useState(false);

  const fetchAmplitudeData = async (amplitudeId: string) => {
    if (amplitudeLoaded || amplitudeLoading) return;
    setAmplitudeLoading(true);
    setAmplitudeError(null);
    try {
      const res = await fetch(`/api/amplitude?amplitude_id=${encodeURIComponent(amplitudeId)}`);
      const data = await res.json();
      if (!res.ok) {
        setAmplitudeError(data.detail ? `${data.error} — ${data.detail}` : (data.error || "Failed to load Amplitude data"));
      } else {
        setAmplitudeDaily(data.daily || []);
        setAmplitudeWau(data.wau || []);
        setAmplitudeMaxDau(data.max_dau || 0);
        setAmplitudeActiveDays(data.active_days_30d || 0);
        setAmplitudeLastDate(data.last_active_date || null);
        setAmplitudeSessions(data.sessions_30d || 0);
        setAmplitudeFeatures(data.features || []);
        setAmplitudeIsFiltered(data.is_filtered || false);
        setAmplitudeLoaded(true);
      }
    } catch (e: any) {
      setAmplitudeError(e?.message || "Failed to load Amplitude data");
    }
    setAmplitudeLoading(false);
  };

  // Mongo Data tab state
  const [mongoLoaded, setMongoLoaded] = useState(false);
  const [mongoLoading, setMongoLoading] = useState(false);
  const [mongoError, setMongoError] = useState<string | null>(null);
  const [mongoBotflows, setMongoBotflows] = useState<{ total: number; useCases: Record<string, number>; names: string[] } | null>(null);
  const [mongoBotSessions, setMongoBotSessions] = useState<{ sessions: number; completed: number } | null>(null);
  const [mongoIg, setMongoIg] = useState<{ channels: any[]; automations: any[]; commentCount: number } | null>(null);
  const [mongoSub, setMongoSub] = useState<{ status: string; isTrial: boolean; planId: string; expiresAt: string } | null>(null);

  const fetchMongoData = async (amplitudeId: string) => {
    if (mongoLoaded || mongoLoading) return;
    setMongoLoading(true);
    try {
      const [bfRes, sessRes, igRes, subRes] = await Promise.all([
        fetch("/api/mongo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "botflow_analysis", accountIds: [amplitudeId] }) }).then(r => r.json()),
        fetch("/api/mongo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "botflow_sessions", accountId: amplitudeId }) }).then(r => r.json()),
        fetch("/api/mongo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "instagram_data", accountId: amplitudeId }) }).then(r => r.json()),
        fetch("/api/mongo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscription", accountId: amplitudeId }) }).then(r => r.json()),
      ]);
      setMongoBotflows(bfRes.results?.[amplitudeId] || null);
      setMongoBotSessions({ sessions: sessRes.sessions || 0, completed: sessRes.completed || 0 });
      setMongoIg(igRes);
      setMongoSub(subRes.subscription || null);
      setMongoLoaded(true);
    } catch (e: any) {
      setMongoError(e?.message || "Failed to load MongoDB data");
    }
    setMongoLoading(false);
  };

  const fetchAccount = async () => {
    setLoading(true);
    // Find the churn_score record that expands the account
    const res = await fetch(
      `${PB}/api/collections/churn_scores/records?filter=account_id="${id}"&expand=account_id&perPage=1`
    ).then((r) => r.json()).catch(() => ({ items: [] }));

    const s = res.items?.[0];
    if (!s) {
      setLoading(false);
      return;
    }

    const pbAccountId = s.expand?.account_id?.id || s.account_id;
    const ampId = s.expand?.account_id?.amplitude_id || "";
    fetchTickets(pbAccountId);
    setAccount({
      id: pbAccountId,
      amplitude_id: ampId,
      company: s.expand?.account_id?.company || "Unknown",
      email: s.expand?.account_id?.email || "",
      plan: s.expand?.account_id?.plan || "",
      mrr: s.expand?.account_id?.mrr || 0,
      mrr_inr: s.expand?.account_id?.mrr_inr || 0,
      currency: s.expand?.account_id?.currency || "INR",
      status: s.expand?.account_id?.status || "",
      lead_owner: s.expand?.account_id?.lead_owner || "",
      lead_owner_email: s.expand?.account_id?.lead_owner_email || "",
      kam: s.expand?.account_id?.kam || "",
      industry: s.expand?.account_id?.industry || "",
      churn_score: s.churn_score,
      upsell_score: s.upsell_score,
      health: s.health,
      explanation: s.explanation,
      churn_reasons: Array.isArray(s.churn_reasons) ? s.churn_reasons : [],
      upsell_reasons: Array.isArray(s.upsell_reasons) ? s.upsell_reasons : [],
      convos_7d: s.convos_7d || 0,
      convos_30d: s.convos_30d || 0,
      convos_90d: s.convos_90d || 0,
      wow_delta: s.wow_delta || 0,
      new_contacts_7d: s.new_contacts_7d || 0,
      new_contacts_30d: s.new_contacts_30d || 0,
      new_contacts_90d: s.new_contacts_90d || 0,
      total_contacts: s.total_contacts || 0,
      messages_7d: s.messages_7d || 0,
      avg_msgs_per_convo: s.avg_msgs_per_convo || 0,
      bot_ratio: s.bot_ratio || 0,
      resolution_rate: s.resolution_rate || 0,
      avg_frt_secs: s.avg_frt_secs || 0,
      active_agents: s.active_agents || 0,
      active_bots: s.active_bots || 0,
      total_channels: s.total_channels || 0,
      trend_consistency: s.trend_consistency || 0,
      open_backlog_pct: s.open_backlog_pct || 0,
      contact_initiated_pct: s.contact_initiated_pct || 0,
      marketing_msgs_30d: s.marketing_msgs_30d || 0,
      utility_msgs_30d: s.utility_msgs_30d || 0,
      service_msgs_30d: s.service_msgs_30d || 0,
      template_sends_30d: s.template_sends_30d || 0,
      broadcasts_30d: s.broadcasts_30d || 0,
      sequences_active: s.sequences_active || 0,
      total_msgs_30d: s.total_msgs_30d || 0,
      proactive_msgs_30d: s.proactive_msgs_30d || 0,
      cb_created_at: s.expand?.account_id?.cb_created_at || "",
      scored_at: s.scored_at,
    });
    setLoading(false);
  };

  const fetchNotes = async () => {
    const res = await fetch(
      `${PB}/api/collections/notes/records?filter=account_id="${id}"&sort=-created`
    ).then((r) => r.json()).catch(() => ({ items: [] }));
    setNotes((res.items || []).map((n: any) => ({ id: n.id, author: n.author, body: n.body, created: n.created })));
  };

  const fetchTickets = async (pbAccountId: string) => {
    const res = await fetch(`/api/zoho-tickets?account_id=${pbAccountId}`)
      .then((r) => r.json())
      .catch(() => ({ tickets: [] }));
    setTickets(res.tickets || []);
  };

  const fetchSubAccounts = async (amplitudeId: string) => {
    if (!amplitudeId || subAccountsLoaded) return;
    const res = await fetch(`/api/partner-accounts?partner_id=${amplitudeId}`)
      .then((r) => r.json())
      .catch(() => ({ sub_accounts: [] }));
    setSubAccounts(res.sub_accounts || []);
    setSubAccountsLoaded(true);
  };

  const addNote = async () => {
    if (!noteBody.trim()) return;
    await fetch(`${PB}/api/collections/notes/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: id, author, body: noteBody }),
    });
    setNoteBody("");
    fetchNotes();
  };

  useEffect(() => {
    fetchAccount();
    fetchNotes();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 pl-16 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-zinc-50 pl-16 flex flex-col items-center justify-center gap-4">
        <p className="text-zinc-500">Customer not found.</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sidebar */}
      <Sidebar />

      <main className="pl-16">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.back()}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-3 h-3 rounded-full",
                  account.health === "green" ? "bg-emerald-500" :
                  account.health === "yellow" ? "bg-amber-500" : "bg-red-500"
                )} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">{account.company}</h1>
                    {account.plan?.toLowerCase().includes("partner") && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 border border-violet-200">PARTNER</span>
                    )}
                    {account.plan?.toLowerCase().includes("message-credits") && (
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200">CREDITS</span>
                    )}
                    {account.plan && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                        {account.plan}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500">{account.email}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={account.health === "green" ? "success" : account.health === "yellow" ? "warning" : "destructive"}>
                {account.health === "green" ? "Stable" : account.health === "yellow" ? "At Risk" : "Churn Risk"}
              </Badge>
              <Badge variant="outline" className="capitalize">{account.status}</Badge>
            </div>
          </div>
        </header>

        <div className="px-6 py-6 max-w-6xl mx-auto">
          {/* Top level metrics */}
          <div className="grid grid-cols-12 gap-6 mb-8">
            {/* Churn Risk */}
            <div className="col-span-4">
              <Card className="border-red-100 bg-red-50/60">
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-xs font-medium text-red-600 uppercase tracking-[0.18em]">Churn Risk</span>
                  </div>
                  <p className="text-6xl font-bold text-red-600 tracking-tighter">{account.churn_score || 0}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Upsell Potential */}
            <div className="col-span-4">
              <Card className="border-indigo-100 bg-indigo-50/60">
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowUpRight className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-medium text-indigo-600 uppercase tracking-[0.18em]">Upsell Potential</span>
                  </div>
                  <p className="text-6xl font-bold text-indigo-600 tracking-tighter">{account.upsell_score || 0}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Ownership */}
            <div className="col-span-4">
              <Card>
                <CardContent className="pt-6 pb-6">
                  <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-4">Ownership</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">KAM / CS</span>
                      <span className="font-medium text-zinc-900">{account.kam || account.lead_owner || "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Plan</span>
                      <span className="font-medium text-zinc-900">{account.plan || "—"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">MRR</span>
                      <span className="font-medium text-zinc-900">{formatMrr(account.mrr, account.currency)}</span>
                    </div>
                    {(() => {
                      const { label, dateStr, stage } = accountAge(account.cb_created_at);
                      if (dateStr === "—") return null;
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Created</span>
                            <span className="font-medium text-zinc-900">{dateStr}</span>
                          </div>
                          <div className="flex justify-between text-sm items-center">
                            <span className="text-zinc-500">Account Age</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-zinc-900">{label}</span>
                              {stage === "new" && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">NEW</span>
                              )}
                              {stage === "ramping" && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">RAMPING</span>
                              )}
                              {stage === "mature" && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">MATURE</span>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-zinc-200 mb-6">
            <button
              onClick={() => setActiveTab("activity")}
              className={cn(
                "px-8 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === "activity"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              )}
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab("ai")}
              className={cn(
                "px-8 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === "ai"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              )}
            >
              AI Analysis
            </button>
            <button
              onClick={() => setActiveTab("tickets")}
              className={cn(
                "px-8 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === "tickets"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              )}
            >
              Support Tickets
              {tickets.length > 0 && <span className="ml-2 text-xs bg-zinc-200 px-1.5 rounded-full">{tickets.length}</span>}
            </button>
            <button
              onClick={() => {
                setActiveTab("mongo");
                if (account.amplitude_id) fetchMongoData(account.amplitude_id);
              }}
              className={cn(
                "px-8 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === "mongo"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              )}
            >
              Mongo Data
            </button>
            {account.amplitude_id && (
              <button
                onClick={() => {
                  setActiveTab("amplitude");
                  fetchAmplitudeData(account.amplitude_id!);
                }}
                className={cn(
                  "px-8 py-3 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "amplitude"
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-700"
                )}
              >
                Product Activity
              </button>
            )}
            {account.plan?.toLowerCase().includes("partner") && (
              <button
                onClick={() => {
                  setActiveTab("sub-accounts");
                  if (account.amplitude_id) fetchSubAccounts(account.amplitude_id);
                }}
                className={cn(
                  "px-8 py-3 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "sub-accounts"
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-zinc-500 hover:text-zinc-700"
                )}
              >
                Sub-Accounts
                {subAccountsLoaded && (
                  <span className="ml-2 text-xs bg-violet-100 text-violet-700 px-1.5 rounded-full">{subAccounts.length}</span>
                )}
              </button>
            )}
          </div>

          {/* Tab Content */}
          {activeTab === "activity" && (
            <div className="space-y-4">

              {/* Row 1 — 5 stat tiles */}
              <div className="grid grid-cols-5 gap-4">
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <div className="text-xs text-zinc-400 mb-1">Conversations (30d)</div>
                    <div className="text-3xl font-semibold text-zinc-900">{(account.convos_30d || 0).toLocaleString()}</div>
                    <div className="text-xs text-zinc-400 mt-1">7d: {(account.convos_7d || 0).toLocaleString()} · 90d: {(account.convos_90d || 0).toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <div className="text-xs text-zinc-400 mb-1">Total Messages (30d)</div>
                    <div className="text-3xl font-semibold text-zinc-900">{(account.total_msgs_30d || 0).toLocaleString()}</div>
                    <div className="text-xs text-zinc-400 mt-1">Avg {account.avg_msgs_per_convo || 0} msgs / convo</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <div className="text-xs text-zinc-400 mb-1">Total Contacts</div>
                    <div className="text-3xl font-semibold text-zinc-900">{(account.total_contacts || 0).toLocaleString()}</div>
                    <div className="text-xs text-zinc-400 mt-1">+{(account.new_contacts_30d || 0).toLocaleString()} in 30d · +{(account.new_contacts_7d || 0).toLocaleString()} in 7d</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <div className="text-xs text-zinc-400 mb-1">Week over Week</div>
                    <div className={cn("text-3xl font-semibold", (account.wow_delta || 0) >= 0 ? "text-emerald-600" : "text-red-500")}>
                      {(account.wow_delta || 0) >= 0 ? "+" : ""}{account.wow_delta || 0}%
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">conversation volume trend</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-5">
                    <div className="text-xs text-zinc-400 mb-1">Avg First Response</div>
                    <div className="text-3xl font-semibold text-zinc-900">
                      {(account.avg_frt_secs || 0) > 0 ? `${Math.round((account.avg_frt_secs || 0) / 60)} min` : "—"}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">first response time</div>
                  </CardContent>
                </Card>
              </div>

              {/* Row 2 — Engagement left, Message Mix + Outbound right */}
              <div className="grid grid-cols-2 gap-4">

                {/* Left — Engagement + Contacts */}
                <Card>
                  <CardContent className="pt-6 pb-6">
                    <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-6">Engagement Health</h3>

                    {/* 3 big % stats */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                      <div className="text-center">
                        <div className="text-xs text-zinc-400 mb-2">UNRESOLVED</div>
                        <div className="text-4xl font-semibold text-zinc-900">{account.open_backlog_pct || 0}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-zinc-400 mb-2">INBOUND</div>
                        <div className="text-4xl font-semibold text-emerald-600">{account.contact_initiated_pct || 0}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-zinc-400 mb-2">RESOLUTION</div>
                        <div className={cn("text-4xl font-semibold", (account.resolution_rate || 0) > 60 ? "text-emerald-600" : "text-amber-500")}>
                          {account.resolution_rate || 0}%
                        </div>
                      </div>
                    </div>

                    {/* Divider + secondary metrics */}
                    <div className="border-t pt-5 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Avg msgs per conversation</span>
                        <span className="font-medium text-zinc-900">{account.avg_msgs_per_convo || "—"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Active agents</span>
                        <span className="font-medium text-zinc-900">{account.active_agents || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Active bots</span>
                        <span className="font-medium text-zinc-900">{account.active_bots || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Bot usage</span>
                        <span className={cn("font-medium", (account.bot_ratio || 0) > 50 ? "text-emerald-600" : "text-zinc-900")}>
                          {account.bot_ratio || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Active sequences</span>
                        <span className="font-medium text-zinc-900">{account.sequences_active || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">New contacts (7d)</span>
                        <span className="font-medium text-zinc-900">{(account.new_contacts_7d || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">New contacts (30d)</span>
                        <span className="font-medium text-zinc-900">{(account.new_contacts_30d || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Right — Message Mix + Outbound */}
                <Card>
                  <CardContent className="pt-6 pb-6">
                    <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-6">Message Breakdown</h3>

                    {/* Message mix */}
                    {(() => {
                      const rows = [
                        { label: "Marketing", value: account.marketing_msgs_30d || 0, color: "bg-indigo-500" },
                        { label: "Utility", value: account.utility_msgs_30d || 0, color: "bg-blue-500" },
                        { label: "Service", value: account.service_msgs_30d || 0, color: "bg-emerald-500" },
                      ].filter(r => r.value > 0);
                      const sum = rows.reduce((a, r) => a + r.value, 0);
                      const total = Math.max(account.total_msgs_30d || 0, sum, 1);
                      if (rows.length === 0) return <p className="text-sm text-zinc-400 italic mb-6">No message data</p>;
                      return (
                        <div className="space-y-4 mb-8">
                          {rows.map(row => {
                            const pct = Math.round((row.value / total) * 100);
                            return (
                              <div key={row.label}>
                                <div className="flex items-center gap-3 text-sm mb-1.5">
                                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${row.color}`} />
                                  <span className="flex-1 text-zinc-600">{row.label}</span>
                                  <span className="font-mono text-zinc-800 tabular-nums">{row.value.toLocaleString()}</span>
                                  <span className="text-zinc-400 w-9 text-right tabular-nums">{pct}%</span>
                                </div>
                                <div className="ml-5 h-1.5 rounded-full bg-zinc-100">
                                  <div className={`h-full rounded-full ${row.color} opacity-60`} style={{ width: `${Math.max(pct, 1)}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Outbound */}
                    <div className="border-t pt-5">
                      <div className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-4">Outbound Activity</div>
                      <div className="flex justify-between text-sm mb-3">
                        <span className="text-zinc-500">Broadcasts sent (30d)</span>
                        <span className="font-medium text-zinc-900">{(account.broadcasts_30d || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Active sequences</span>
                        <span className="font-medium text-zinc-900">{account.sequences_active || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-7 pb-7">
                  <h3 className="flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-[0.18em] mb-4">
                    <Sparkles className="w-3.5 h-3.5" /> AI SUMMARY
                  </h3>
                  <p className="text-zinc-600 leading-relaxed text-[15px]">{account.explanation || "No summary available."}</p>
                </CardContent>
              </Card>

              {account.churn_reasons && account.churn_reasons.length > 0 && (
                <Card className="border-red-100">
                  <CardContent className="pt-6">
                    <h3 className="flex items-center gap-2 mb-4 text-red-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="uppercase text-xs font-medium tracking-widest">Churn Prediction Reasons</span>
                    </h3>
                    <ul className="space-y-3">
                      {account.churn_reasons.map((reason, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="text-red-400 text-xl leading-none mt-0.5">•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {account.upsell_reasons && account.upsell_reasons.length > 0 && (
                <Card className="border-indigo-100">
                  <CardContent className="pt-6">
                    <h3 className="flex items-center gap-2 mb-4 text-indigo-600">
                      <ArrowUpRight className="w-4 h-4" />
                      <span className="uppercase text-xs font-medium tracking-widest">Upsell Opportunities</span>
                    </h3>
                    <ul className="space-y-3">
                      {account.upsell_reasons.map((reason, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="text-indigo-400 text-xl leading-none mt-0.5">•</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === "tickets" && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-5">
                  <Ticket className="w-4 h-4" />
                  Active Support Tickets
                  {tickets.length > 0 && <span className="ml-2 text-xs bg-zinc-100 px-2 py-px rounded">{tickets.length}</span>}
                </h3>

                {tickets.length === 0 ? (
                  <p className="text-zinc-400 py-12 text-center">No tickets found for this account.</p>
                ) : (
                  <div className="space-y-3">
                    {tickets.map((t) => (
                      <div key={t.id} className={cn(
                        "border rounded-2xl p-5 hover:border-zinc-300 transition-colors",
                        t.is_churn_ticket ? "border-red-200 bg-red-50/40" : ""
                      )}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono text-xs text-zinc-400">#{t.ticket_number}</span>
                              {t.is_churn_ticket && <Badge variant="destructive" className="text-xs">CHURN</Badge>}
                              {t.is_escalated && <Badge variant="warning" className="text-xs">ESCALATED</Badge>}
                            </div>
                            <p className="font-medium text-zinc-800">{t.subject}</p>
                            <div className="flex gap-4 text-xs text-zinc-500 mt-3">
                              <span>{t.category}</span>
                              <span>{t.status}</span>
                              <span>{t.created_time ? new Date(t.created_time).toLocaleDateString() : ""}</span>
                            </div>
                          </div>
                          {t.web_url && (
                            <a href={t.web_url} target="_blank" className="text-zinc-300 hover:text-zinc-500">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "mongo" && (
            <div className="space-y-4">
              {mongoLoading && (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-5 h-5 animate-spin text-zinc-400 mr-2" />
                  <span className="text-sm text-zinc-400">Fetching from MongoDB…</span>
                </div>
              )}

              {!mongoLoading && mongoError && (
                <div className="flex items-center gap-2 py-12 justify-center text-red-500">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">{mongoError}</span>
                </div>
              )}

              {!mongoLoading && !mongoError && mongoLoaded && (
                <>
                  {/* Subscription */}
                  {mongoSub && (
                    <Card>
                      <CardContent className="pt-6">
                        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-4">Subscription</h3>
                        <div className="space-y-2">
                          {[
                            ["Status", mongoSub.status || "—"],
                            ["Plan ID", mongoSub.planId || "—"],
                            ["Trial", mongoSub.isTrial ? "Yes" : "No"],
                            ["Expires At", mongoSub.expiresAt ? new Date(mongoSub.expiresAt).toLocaleDateString("en-IN") : "—"],
                          ].map(([label, value]) => (
                            <div key={label} className="flex justify-between text-sm">
                              <span className="text-zinc-500">{label}</span>
                              <span className="font-medium text-zinc-900">{value}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Botflows */}
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-4">Botflows</h3>
                      {!mongoBotflows || mongoBotflows.total === 0 ? (
                        <p className="text-sm text-zinc-400">No botflows found.</p>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-indigo-50 rounded-lg p-4 text-center">
                              <p className="text-3xl font-bold text-indigo-600">{mongoBotflows.total}</p>
                              <p className="text-xs text-indigo-500 mt-1">Total Flows</p>
                            </div>
                            <div className="bg-emerald-50 rounded-lg p-4 text-center">
                              <p className="text-3xl font-bold text-emerald-600">{mongoBotSessions?.sessions || 0}</p>
                              <p className="text-xs text-emerald-500 mt-1">Total Sessions</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-4 text-center">
                              <p className="text-3xl font-bold text-amber-600">{mongoBotSessions?.completed || 0}</p>
                              <p className="text-xs text-amber-500 mt-1">Completed</p>
                            </div>
                          </div>

                          {Object.keys(mongoBotflows.useCases).length > 0 && (
                            <div>
                              <p className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">Use Cases</p>
                              <div className="space-y-1.5">
                                {Object.entries(mongoBotflows.useCases)
                                  .sort(([, a], [, b]) => b - a)
                                  .map(([uc, count]) => (
                                    <div key={uc} className="flex justify-between text-sm bg-zinc-50 rounded px-3 py-2">
                                      <span className="text-zinc-700">{uc}</span>
                                      <span className="font-medium text-zinc-900">{count} flow{count !== 1 ? "s" : ""}</span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {mongoBotflows.names.length > 0 && (
                            <div>
                              <p className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">Flow Names</p>
                              <div className="flex flex-wrap gap-1.5">
                                {mongoBotflows.names.map((name, i) => (
                                  <span key={i} className="bg-zinc-100 text-zinc-700 rounded-full px-2.5 py-1 text-xs font-mono">{name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Instagram */}
                  {mongoIg && mongoIg.channels.length > 0 && (
                    <Card>
                      <CardContent className="pt-6">
                        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-4">Instagram</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">IG Channels</span>
                            <span className="font-medium text-zinc-900">{mongoIg.channels.length}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Comment Automations</span>
                            <span className="font-medium text-zinc-900">{mongoIg.automations.length}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Total Comments</span>
                            <span className="font-medium text-zinc-900">{mongoIg.commentCount.toLocaleString()}</span>
                          </div>
                          {mongoIg.automations.length > 0 && (
                            <div className="pt-2">
                              <p className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">Automations</p>
                              <div className="space-y-1.5">
                                {mongoIg.automations.map((a: any, i: number) => (
                                  <div key={i} className="flex justify-between text-sm bg-zinc-50 rounded px-3 py-2">
                                    <span className="text-zinc-700">{a.name || "Unnamed"}</span>
                                    <span className="text-xs text-zinc-400">{a.status}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "amplitude" && (
            <div className="space-y-4">
              {amplitudeLoading && (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-5 h-5 animate-spin text-zinc-400 mr-2" />
                  <span className="text-sm text-zinc-400">Fetching from Amplitude…</span>
                </div>
              )}

              {!amplitudeLoading && amplitudeError && (
                <div className="flex items-center gap-2 py-12 justify-center text-red-500">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">{amplitudeError}</span>
                </div>
              )}

              {!amplitudeLoading && !amplitudeError && amplitudeLoaded && (
                <>
                  {!amplitudeIsFiltered && (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      Showing project-wide data — set <code className="font-mono text-xs bg-amber-100 px-1 rounded">AMPLITUDE_ACCOUNT_PROP</code> in <code className="font-mono text-xs bg-amber-100 px-1 rounded">.env.local</code> to filter by account
                    </div>
                  )}
                  {/* Summary stats */}
                  <div className="grid grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-5 pb-5">
                        <div className="text-xs text-zinc-400 mb-1">Peak DAU (30d)</div>
                        <div className="text-3xl font-semibold text-zinc-900">{amplitudeMaxDau.toLocaleString()}</div>
                        <div className="text-xs text-zinc-400 mt-1">max daily active users</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-5 pb-5">
                        <div className="text-xs text-zinc-400 mb-1">Sessions (30d)</div>
                        <div className="text-3xl font-semibold text-zinc-900">{amplitudeSessions.toLocaleString()}</div>
                        <div className="text-xs text-zinc-400 mt-1">total sessions</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-5 pb-5">
                        <div className="text-xs text-zinc-400 mb-1">Active Days (30d)</div>
                        <div className="text-3xl font-semibold text-zinc-900">{amplitudeActiveDays}</div>
                        <div className="text-xs text-zinc-400 mt-1">days with any activity</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-5 pb-5">
                        <div className="text-xs text-zinc-400 mb-1">Last Active</div>
                        <div className="text-xl font-semibold text-zinc-900 mt-2">
                          {amplitudeLastDate
                            ? new Date(amplitudeLastDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                            : "—"}
                        </div>
                        <div className="text-xs text-zinc-400 mt-1">last day with activity</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Feature adoption */}
                  {amplitudeFeatures.length > 0 && (
                    <Card>
                      <CardContent className="pt-6 pb-6">
                        <div className="flex items-center justify-between mb-5">
                          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em]">Feature Adoption — Last 30 Days</h3>
                          <span className="text-xs text-zinc-400">
                            {amplitudeFeatures.filter(f => f.used).length}/{amplitudeFeatures.length} features used
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[...amplitudeFeatures].sort((a, b) => b.count - a.count).map(f => (
                            <div key={f.name} className={cn(
                              "rounded-xl px-4 py-3 flex items-center justify-between",
                              f.used ? "bg-emerald-50 border border-emerald-200" : "bg-zinc-50 border border-zinc-200"
                            )}>
                              <span className={cn("text-sm font-medium", f.used ? "text-emerald-800" : "text-zinc-400")}>
                                {f.name}
                              </span>
                              <span className={cn("text-sm font-semibold tabular-nums", f.used ? "text-emerald-700" : "text-zinc-300")}>
                                {f.used ? f.count.toLocaleString() : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Daily active users bar chart */}
                  <Card>
                    <CardContent className="pt-6 pb-6">
                      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-[0.18em] mb-6">Daily Active Users — Last 30 Days</h3>
                      {amplitudeDaily.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-8">No activity data available.</p>
                      ) : (() => {
                        const maxUsers = Math.max(...amplitudeDaily.map(d => d.users), 1);
                        return (
                          <div className="flex items-end gap-0.5 h-36">
                            {amplitudeDaily.map((d, i) => {
                              const heightPct = d.users > 0 ? Math.max((d.users / maxUsers) * 100, 3) : 0;
                              const isWeekEnd = i > 0 && (i % 7 === 0);
                              return (
                                <div key={d.date || i} title={`${d.date}: ${d.users} users`}
                                  className={cn("flex flex-col items-center flex-1", isWeekEnd && "ml-1")}>
                                  <div className="w-full flex items-end" style={{ height: "88px" }}>
                                    <div
                                      className={cn(
                                        "w-full rounded-sm transition-all",
                                        d.users > 0 ? "bg-zinc-800" : "bg-zinc-100"
                                      )}
                                      style={{ height: `${heightPct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                      {/* Week labels */}
                      <div className="flex gap-0.5 mt-2">
                        {amplitudeWau.map((w, i) => (
                          <div key={w.week || i} className="flex-1 text-[9px] text-zinc-400 text-center leading-tight">
                            {w.week ? new Date(w.week).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : `W${i + 1}`}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {activeTab === "sub-accounts" && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="flex items-center gap-2 text-xs font-medium text-violet-600 uppercase tracking-[0.18em] mb-5">
                  <Users className="w-4 h-4" />
                  Sub-Accounts managed by this partner
                  {subAccountsLoaded && (
                    <span className="ml-2 text-xs bg-violet-100 px-2 py-px rounded text-violet-700">{subAccounts.length}</span>
                  )}
                </h3>

                {!subAccountsLoaded ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
                  </div>
                ) : subAccounts.length === 0 ? (
                  <p className="text-zinc-400 py-12 text-center">No sub-accounts found for this partner.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-zinc-400 text-xs uppercase tracking-wide">
                          <th className="pb-3 pr-4">Account Name</th>
                          <th className="pb-3 pr-4">Status</th>
                          <th className="pb-3 pr-4">Channel Provider</th>
                          <th className="pb-3">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subAccounts.map((sub) => (
                          <tr key={sub.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                            <td className="py-3 pr-4 font-medium text-zinc-900">{sub.name}</td>
                            <td className="py-3 pr-4">
                              <span className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                                sub.status === "active" ? "bg-emerald-100 text-emerald-700" :
                                sub.status === "disconnected" ? "bg-zinc-100 text-zinc-500" :
                                sub.status === "suspended" ? "bg-red-100 text-red-600" :
                                "bg-zinc-100 text-zinc-500"
                              )}>
                                {sub.status}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-zinc-500">
                              {!sub.channel_provider
                                ? "—"
                                : typeof sub.channel_provider === "string"
                                ? sub.channel_provider || "—"
                                : Object.keys(sub.channel_provider as Record<string, unknown>).join(", ") || "—"}
                            </td>
                            <td className="py-3 text-zinc-400 text-xs">
                              {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
