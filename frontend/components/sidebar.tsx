"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Activity, Sparkles, Ticket, TrendingUp, Settings } from "lucide-react";

const NAV = [
  { icon: Activity,   href: "/app",     title: "Accounts" },
  { icon: Ticket,     href: "/tickets", title: "Tickets"  },
  { icon: TrendingUp, href: "/metrics", title: "Metrics"  },
  { icon: Settings,   href: "#",        title: "Settings" },
];

export default function Sidebar() {
  const router   = useRouter();
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-16 border-r border-zinc-200 bg-white flex flex-col items-center py-4">
      <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center mb-8 cursor-pointer"
        onClick={() => router.push("/app")}>
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <nav className="flex flex-col gap-2">
        {NAV.map(({ icon: Icon, href, title }) => {
          const active = pathname === href || (href !== "/app" && pathname.startsWith(href));
          return (
            <button
              key={href}
              onClick={() => href !== "#" && router.push(href)}
              title={title}
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                active
                  ? "bg-zinc-900 text-white"
                  : "hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
              )}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
