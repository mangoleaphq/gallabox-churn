import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
      <DashboardClient />
    </Suspense>
  );
}
