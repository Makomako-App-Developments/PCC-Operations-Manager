import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, CheckCircle } from "lucide-react";
import { useState, useEffect } from "react";

type HealthReadyResponse = {
  status: "ready" | "not_ready";
  cbState: "CLOSED" | "OPEN" | "HALF_OPEN";
  openedAt?: string;
  timeSinceOpenMs?: number;
};

function useDbHealth() {
  return useQuery<HealthReadyResponse>({
    queryKey: ["db-health-ready"],
    queryFn: async () => {
      const res = await fetch("/api/health/ready", { credentials: "include" });
      // 200 or 503 — both return JSON we care about
      return res.json();
    },
    // Poll every 15 s — matches the CB recovery window so the banner
    // disappears promptly when the circuit closes.
    refetchInterval: 15_000,
    // Don't retry — we want to see the real state fast.
    retry: false,
    // Keep showing the last known value while re-fetching.
    placeholderData: (prev) => prev,
  });
}

/**
 * Renders a full-width banner at the top of the page when the database
 * circuit breaker is OPEN or HALF_OPEN. Auto-dismisses when the circuit
 * returns to CLOSED (polled every 15 s).
 *
 * Mount this once inside Layout so it is visible on every page.
 */
export function SystemStatusBanner() {
  const { data } = useDbHealth();
  // Separate "was open" flag so we can show a brief "back online" notice.
  const [wasOpen, setWasOpen] = useState(false);
  const [showRecovered, setShowRecovered] = useState(false);

  const cbState = data?.cbState;
  const isUnhealthy = cbState === "OPEN" || cbState === "HALF_OPEN";

  useEffect(() => {
    if (isUnhealthy) {
      setWasOpen(true);
      setShowRecovered(false);
      return undefined;
    }
    if (wasOpen && cbState === "CLOSED") {
      // Just recovered — flash a brief confirmation.
      setShowRecovered(true);
      setWasOpen(false);
      const t = setTimeout(() => setShowRecovered(false), 5_000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isUnhealthy, cbState, wasOpen]);

  if (!isUnhealthy && !showRecovered) return null;

  if (showRecovered) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium"
      >
        <CheckCircle className="w-4 h-4 flex-shrink-0" />
        <span>Database connection restored — the system is back to normal.</span>
      </div>
    );
  }

  const recoveringMsg =
    cbState === "HALF_OPEN" ? " Checking if the connection is back…" : "";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium"
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        The system is temporarily unavailable — a database connection issue has
        been detected. Some features may not respond correctly.
        {recoveringMsg}
      </span>
      <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 opacity-70 animate-spin" />
    </div>
  );
}
