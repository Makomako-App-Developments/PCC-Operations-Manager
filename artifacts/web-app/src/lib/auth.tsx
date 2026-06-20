/* @refresh reset */
import React, { createContext, useContext, ReactNode, useEffect, useRef } from "react";
import { useGetMe, useLogin, useLogout, LoginRequest, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Sentry } from "@/lib/sentry";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const FIELD_OPS_ROLES = ["field_worker", "manager", "supervisor", "administrator"];

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  // iPad in "Request Desktop Site" mode reports as MacIntel but has touch
  if (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.userAgent)) return true;
  return false;
}

async function redirectToFieldOps() {
  // Exchange the current authenticated session for a short-lived one-time
  // handoff code. The bearer token is never placed in the URL.
  const res = await fetch("/api/auth/handoff/create", { method: "POST" });
  if (!res.ok) throw new Error("Failed to create handoff code");
  const { code } = await res.json();
  window.location.href = `/field-ops/?handoff=${encodeURIComponent(code)}`;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  // Prevent useEffect from overwriting a redirect already triggered by onSuccess
  const redirectingRef = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: user, isLoading } = useGetMe({ query: { retry: false, staleTime: Infinity } as any });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        Sentry.setUser({ id: data?.user?.id, email: data?.user?.email });
        const role = data?.user?.role ?? "";
        if (role === "field_worker" || (FIELD_OPS_ROLES.includes(role) && isMobileDevice())) {
          redirectingRef.current = true;
          redirectToFieldOps().catch(() => {
            // If handoff creation fails, fall back to the web dashboard
            redirectingRef.current = false;
            setLocation("/dashboard");
          });
        } else {
          setLocation("/dashboard");
        }
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        Sentry.setUser(null);
        queryClient.clear();
        setLocation("/login");
      }
    }
  });

  // ── Idle timeout ──────────────────────────────────────────────────────────
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref to the logout fn so the timer callback never goes stale
  const logoutRef = useRef<() => void>(() => {});
  useEffect(() => {
    logoutRef.current = () => {
      sessionStorage.setItem("loggedOutReason", "inactivity");
      logoutMutation.mutateAsync().catch(() => {
        queryClient.clear();
        setLocation("/login");
      });
    };
  });

  useEffect(() => {
    if (!user) return;

    const reset = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => logoutRef.current(), IDLE_TIMEOUT_MS);
    };

    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"] as const;
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset(); // start the clock

    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [user]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isLoading) return;
    if (!user && location !== "/login") {
      Sentry.setUser(null);
      setLocation("/login");
    } else if (user && !redirectingRef.current) {
      Sentry.setUser({ id: (user as any).id, email: (user as any).email });
      // Already-authenticated session restore: send mobile privileged users to field-ops
      const role = (user as any).role ?? "";
      if (role === "field_worker" || (FIELD_OPS_ROLES.includes(role) && isMobileDevice())) {
        window.location.href = "/field-ops/";
      }
    }
  }, [isLoading, user, location, setLocation]);

  const login = async (data: LoginRequest) => {
    await loginMutation.mutateAsync({ data });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
