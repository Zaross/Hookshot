import axios from "axios";
import type {
  LoginResponse,
  User,
  Repository,
  Setting,
  WebhookLog,
  EmbedTemplate,
  Stats,
  AuditLog,
  QueueItem,
} from "../types";

const client = axios.create({ baseURL: "/api" });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    client.post<LoginResponse | { needs_2fa: true; temp_token: string }>("/auth/login", { username, password }).then((r) => r.data),
  totpVerify: (temp_token: string, code: string) =>
    client.post<LoginResponse>("/auth/totp/verify", { temp_token, code }).then((r) => r.data),
  totpSetup: () =>
    client.post<{ secret: string; uri: string }>("/auth/totp/setup").then((r) => r.data),
  totpEnable: (code: string) =>
    client.post("/auth/totp/enable", { code }).then((r) => r.data),
  totpDisable: (password: string, code: string) =>
    client.post("/auth/totp/disable", { password, code }).then((r) => r.data),
  me: () => client.get<User>("/auth/me").then((r) => r.data),
  logout: () => client.post("/auth/logout").then((r) => r.data),
};

export const sessionsApi = {
  list: () =>
    client
      .get<{ sessions: { id: string; created_at: string; expires_at: string; user_agent?: string; is_current: boolean }[] }>("/sessions")
      .then((r) => r.data.sessions),
  revoke: (id: string) => client.delete(`/sessions/${id}`).then((r) => r.data),
  revokeOthers: () => client.post("/sessions/revoke-others").then((r) => r.data),
};

export const usersApi = {
  list: () => client.get<{ users: User[] }>("/users").then((r) => r.data.users),
  create: (data: { username: string; email?: string; password: string; role: string }) =>
    client.post<User>("/users", data).then((r) => r.data),
  update: (id: string, data: { username?: string; email?: string; password?: string; role?: string }) =>
    client.put<User>(`/users/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/users/${id}`).then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    client
      .put("/users/me/password", { current_password: currentPassword, new_password: newPassword })
      .then((r) => r.data),
};

export const reposApi = {
  list: () =>
    client.get<{ repositories: Repository[] }>("/repositories").then((r) => r.data.repositories),
  get: (id: string) => client.get<Repository>(`/repositories/${id}`).then((r) => r.data),
  create: (data: {
    full_name: string;
    platform: string;
    secret: string;
    discord_webhook_url: string;
    embed_template?: EmbedTemplate;
    active?: boolean;
    allowed_branches?: string[];
    commit_filter?: string[];
  }) => client.post<Repository>("/repositories", data).then((r) => r.data),
  update: (
    id: string,
    data: Partial<{
      full_name: string;
      platform: string;
      secret: string;
      discord_webhook_url: string;
      embed_template: EmbedTemplate;
      active: boolean;
      allowed_branches: string[];
      commit_filter: string[];
    }>
  ) => client.put<Repository>(`/repositories/${id}`, data).then((r) => r.data),
  delete: (id: string) => client.delete(`/repositories/${id}`).then((r) => r.data),
  test: (id: string) => client.post(`/repositories/${id}/test`).then((r) => r.data),
  regenerateToken: (id: string) =>
    client.post<{ webhook_token: string }>(`/repositories/${id}/regenerate-token`).then((r) => r.data),
  export: () =>
    client.get<{ repositories: Repository[]; exported_at: string }>("/repositories/export").then((r) => r.data),
  import: (repositories: Partial<Repository>[]) =>
    client.post<{ imported: number; skipped: number }>("/repositories/import", { repositories }).then((r) => r.data),
  bulk: (action: "activate" | "deactivate" | "delete", ids: string[]) =>
    client.post<{ affected: number }>("/repositories/bulk", { action, ids }).then((r) => r.data),
};

export const settingsApi = {
  list: () =>
    client.get<{ settings: Setting[] }>("/settings").then((r) => r.data.settings),
  updateBulk: (settings: { key: string; value: string }[]) =>
    client.put<{ settings: Setting[] }>("/settings", { settings }).then((r) => r.data.settings),
};

export const logsApi = {
  list: (params?: {
    limit?: number;
    offset?: number;
    repository_id?: string;
    status?: string;
    platform?: string;
  }) =>
    client
      .get<{ logs: WebhookLog[]; total: number }>("/logs", { params })
      .then((r) => r.data),
  retry: (id: string) => client.post(`/logs/${id}/retry`).then((r) => r.data),
};

export const statsApi = {
  get: () => client.get<Stats>("/stats").then((r) => r.data),
};

export const auditApi = {
  list: () => client.get<{ logs: AuditLog[] }>("/audit").then((r) => r.data.logs),
};

export const queueApi = {
  list: () =>
    client
      .get<{ items: QueueItem[]; pending: number; failed: number }>("/queue")
      .then((r) => r.data),
  retry: (id: string) => client.post(`/queue/${id}/retry`).then((r) => r.data),
  delete: (id: string) => client.delete(`/queue/${id}`).then((r) => r.data),
  purgeFailed: () => client.post("/queue/purge-failed").then((r) => r.data),
};
