import { customFetch, setAuthTokenGetter } from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
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

setAuthTokenGetter(() => _currentToken);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerPushToken(_authToken: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
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
    async function init() {
      try {
        // On web: check if the web app passed a token via URL params (single sign-on)
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const urlToken = params.get("token");
          const urlUser = params.get("user");
          if (urlToken && urlUser) {
            try {
              const parsedUser = JSON.parse(decodeURIComponent(urlUser)) as AuthUser;
              _currentToken = urlToken;
              setToken(urlToken);
              setUser(parsedUser);
              await Promise.all([
                SecureStore.setItemAsync(TOKEN_KEY, urlToken),
                SecureStore.setItemAsync(USER_KEY, JSON.stringify(parsedUser)),
              ]);
              // Remove the token from the URL so it isn't exposed in history
              window.history.replaceState({}, "", window.location.pathname);
              registerPushToken(urlToken).catch(() => {});
              return;
            } catch {
              // fall through to stored token
            }
          }
        }

        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          _currentToken = storedToken;
          setToken(storedToken);
          const parsedUser = JSON.parse(storedUser) as AuthUser;
          setUser(parsedUser);
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

  const login = async (newToken: string, newUser: AuthUser) => {
    _currentToken = newToken;
    setToken(newToken);
    setUser(newUser);
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, newToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(newUser)),
    ]);
    registerPushToken(newToken).catch(() => {});
  };

  const logout = async () => {
    await clearPushToken();
    _currentToken = null;
    setToken(null);
    setUser(null);
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  };

  const setNotificationsEnabled = async (enabled: boolean) => {
    try {
      await customFetch("/api/users/me/notifications", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      setUser(prev => prev ? { ...prev, pushNotificationsEnabled: enabled } : prev);
      const stored = await SecureStore.getItemAsync(USER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AuthUser;
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify({ ...parsed, pushNotificationsEnabled: enabled }));
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
