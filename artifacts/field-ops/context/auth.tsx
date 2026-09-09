import { customFetch, setAuthTokenGetter, setAuthTokenUpdater, setOnUnauthorized } from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
import * as Sentry from "@sentry/react-native";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const TOKEN_KEY = "pcc_auth_token";
const USER_KEY = "pcc_auth_user";

const secureGet = (key: string): Promise<string | null> =>
  Platform.OS === "web"
    ? Promise.resolve(localStorage.getItem(key))
    : SecureStore.getItemAsync(key);

const secureSet = (key: string, value: string): Promise<void> =>
  Platform.OS === "web"
    ? Promise.resolve(localStorage.setItem(key, value))
    : SecureStore.setItemAsync(key, value);

const secureDelete = (key: string): Promise<void> =>
  Platform.OS === "web"
    ? Promise.resolve(localStorage.removeItem(key))
    : SecureStore.deleteItemAsync(key);

export interface AuthUser {
  id: string;
  name: string;
  initials: string;
  role: string;
  teamId: string | null;
  pushNotificationsEnabled?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
}

let _currentToken: string | null = null;
let _logoutFn: (() => Promise<void>) | null = null;

setAuthTokenGetter(() => _currentToken);
setOnUnauthorized(() => { _logoutFn?.().catch(() => {}); });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("job-alerts", {
    name: "Job Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync("digest", {
    name: "Daily Digest",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
  });
}

async function registerPushToken(_authToken: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await ensureNotificationChannels();

    type PermResult = { granted: boolean; canAskAgain?: boolean };
    let perms = (await Notifications.getPermissionsAsync()) as unknown as PermResult;
    if (!perms.granted && perms.canAskAgain !== false) {
      perms = (await Notifications.requestPermissionsAsync()) as unknown as PermResult;
    }
    if (!perms.granted) return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    await customFetch("/api/users/me/push-token", {
      method: "PUT",
      body: JSON.stringify({ token: pushToken }),
    });
  } catch (err) {
    console.warn("[push] Failed to register push token:", err);
  }
}

async function clearPushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await customFetch("/api/users/me/push-token", {
      method: "PUT",
      body: JSON.stringify({ token: null }),
    });
  } catch {
  }
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  setNotificationsEnabled: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setAuthTokenUpdater(newToken => {
      _currentToken = newToken;
      setToken(newToken);
      secureSet(TOKEN_KEY, newToken).catch(() => {});
    });
    return () => setAuthTokenUpdater(null);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        // On web: check if the web app passed a one-time handoff code via URL.
        // The code is redeemed server-side so the bearer token never appears in the URL.
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const handoffCode = params.get("handoff");
          if (handoffCode) {
            // Strip the code from the URL immediately before any async work
            window.history.replaceState({}, "", window.location.pathname);
            try {
              const resp = await fetch("/api/auth/handoff/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: handoffCode }),
              });
              if (resp.ok) {
                const { accessToken: redeemedToken, user: redeemedUser } = await resp.json() as {
                  accessToken: string;
                  user: AuthUser;
                };
                _currentToken = redeemedToken;
                setToken(redeemedToken);
                setUser(redeemedUser);
                Sentry.setUser({ id: redeemedUser.id, username: redeemedUser.name });
                await Promise.all([
                  secureSet(TOKEN_KEY, redeemedToken),
                  secureSet(USER_KEY, JSON.stringify(redeemedUser)),
                ]);
                registerPushToken(redeemedToken).catch(() => {});
                return;
              }
            } catch {
              // fall through to stored token
            }
          }
        }

        const [storedToken, storedUser] = await Promise.all([
          secureGet(TOKEN_KEY),
          secureGet(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          _currentToken = storedToken;
          setToken(storedToken);
          const parsedUser = JSON.parse(storedUser) as AuthUser;
          setUser(parsedUser);
          Sentry.setUser({ id: parsedUser.id, username: parsedUser.name });
          // Re-register push token on app restart (token may have rotated)
          registerPushToken(storedToken).catch(() => {});
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const logout = async () => {
    await clearPushToken();
    _currentToken = null;
    _logoutFn = null;
    setToken(null);
    setUser(null);
    Sentry.setUser(null);
    await Promise.all([
      secureDelete(TOKEN_KEY),
      secureDelete(USER_KEY),
    ]);
  };

  // Register logout with the module-level callback so customFetch can trigger
  // it when a 401 cannot be recovered (e.g. expired token on native mobile).
  _logoutFn = logout;

  const login = async (newToken: string, newUser: AuthUser) => {
    // Set in-memory state immediately — this is what drives the UI.
    _currentToken = newToken;
    setToken(newToken);
    setUser(newUser);
    Sentry.setUser({ id: newUser.id, username: newUser.name });
    // Persist to storage in the background. Safari private mode / strict ITP
    // can throw from localStorage, so we never let storage failures propagate
    // back to the caller (which would incorrectly show "Invalid password").
    secureSet(TOKEN_KEY, newToken).catch(() => {});
    secureSet(USER_KEY, JSON.stringify(newUser)).catch(() => {});
    registerPushToken(newToken).catch(() => {});
  };

  const setNotificationsEnabled = async (enabled: boolean) => {
    try {
      await customFetch("/api/users/me/notifications", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      setUser(prev => prev ? { ...prev, pushNotificationsEnabled: enabled } : prev);
      const stored = await secureGet(USER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AuthUser;
        await secureSet(USER_KEY, JSON.stringify({ ...parsed, pushNotificationsEnabled: enabled }));
      }
    } catch (err) {
      console.warn("[push] Failed to update notification preference:", err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, setNotificationsEnabled }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
