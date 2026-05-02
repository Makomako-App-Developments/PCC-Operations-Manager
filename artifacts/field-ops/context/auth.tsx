import { setAuthTokenGetter } from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const TOKEN_KEY = "pcc_auth_token";
const USER_KEY = "pcc_auth_user";

export interface AuthUser {
  id: string;
  name: string;
  initials: string;
  role: string;
  teamId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
}

let _currentToken: string | null = null;

setAuthTokenGetter(() => _currentToken);

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          _currentToken = storedToken;
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as AuthUser);
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
  };

  const logout = async () => {
    _currentToken = null;
    setToken(null);
    setUser(null);
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
