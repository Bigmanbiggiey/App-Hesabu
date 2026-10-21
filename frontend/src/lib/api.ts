import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { clearSessionData } from "./session";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// A single in-flight refresh shared by every request that 401s concurrently,
// so we never spend a rotated refresh token twice (ROTATE_REFRESH_TOKENS +
// BLACKLIST_AFTER_ROTATION would otherwise log the user out on a race).
let refreshInFlight: Promise<string> | null = null;

function runRefresh(): Promise<string> {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return Promise.reject(new Error("no_refresh_token"));

  return axios
    .post("/api/v1/auth/token/refresh/", { refresh })
    .then(({ data }) => {
      localStorage.setItem("access_token", data.access);
      // simplejwt returns a new refresh token when rotation is enabled
      if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
      return data.access as string;
    });
}

function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function forceLogout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  clearSessionData();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;

    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;

    try {
      const access = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${access}`;
      return api(original);
    } catch {
      forceLogout();
      return Promise.reject(error);
    }
  }
);

export default api;
