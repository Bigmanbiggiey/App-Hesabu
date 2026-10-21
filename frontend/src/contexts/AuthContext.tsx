import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import api from "@/lib/api";
import { clearSessionData } from "@/lib/session";
import { unsubscribeOnLogout } from "@/lib/push";

export interface Organization {
  id: string;
  name: string;
  kra_pin: string;
  vat_registration_number: string;
  etims_device_serial: string;
  etims_branch_id: string;
  mpesa_paybill_number: string;
  mpesa_till_number: string;
  mpesa_account_reference: string;
  county: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  subscription_tier: string;
  subscription_status: string;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  invoice_prefix: string;
  default_vat_rate: string;
  default_payment_terms_days: number;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone_number: string;
  role: string;
  organization: Organization;
  language: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get<User>("/auth/me/");
      setUser(data);
    } catch {
      setUser(null);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("access_token")) {
      fetchMe();
    } else {
      setIsLoading(false);
    }
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login/", { email, password });
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    setUser(data.user);
  };

  const logout = useCallback(() => {
    unsubscribeOnLogout(localStorage.getItem("access_token"));
    const refresh = localStorage.getItem("refresh_token");
    if (refresh) api.post("/auth/logout/", { refresh }).catch(() => {});
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    clearSessionData();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
