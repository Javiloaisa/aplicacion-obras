import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { login as apiLogin } from "./api";
import { clearSession, getStoredUser, storeUser } from "./auth";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  updateUser: (changes: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await apiLogin(username, password);
    setUser(tokens.user);
    return tokens.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((changes: Partial<User>) => {
    setUser((current) => {
      if (!current) return current;
      const updated = { ...current, ...changes };
      storeUser(updated);
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
