/* @refresh reset */
import React, { createContext, useContext, ReactNode, useEffect, useRef } from "react";
import { useGetMe, useLogin, useLogout, LoginRequest, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

const FIELD_OPS_ROLES = ["field_worker", "manager", "supervisor", "administrator"];

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

function redirectToFieldOps(token: string, user: object) {
  const u = encodeURIComponent(JSON.stringify(user));
  window.location.href = `/field-ops/?token=${token}&user=${u}`;
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
        const role = data?.user?.role ?? "";
        const token = data?.accessToken ?? "";
        if (role === "field_worker" || (FIELD_OPS_ROLES.includes(role) && isMobile())) {
          redirectingRef.current = true;
          redirectToFieldOps(token, data?.user ?? {});
        } else {
          setLocation("/dashboard");
        }
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      }
    }
  });

  useEffect(() => {
    if (isLoading) return;
    if (!user && location !== "/login") {
      setLocation("/login");
    } else if (user && !redirectingRef.current) {
      // Already-authenticated session restore: send mobile privileged users to field-ops
      const role = (user as any).role ?? "";
      if (role === "field_worker" || (FIELD_OPS_ROLES.includes(role) && isMobile())) {
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
