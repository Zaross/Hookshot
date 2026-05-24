export interface User {
  id: string;
  username: string;
  email?: string;
  role: "admin" | "user";
  created_at: string;
  totp_enabled?: boolean;
  must_change_password?: boolean;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  username: string;
  action: string;
  target_type?: string;
  target_id?: string;
  details?: string;
  created_at: string;
}

export interface Repository {
  id: string;
  full_name: string;
  platform: "github" | "gitlab";
  secret: string;
  discord_webhook_url: string;
  embed_template: string;
  active: boolean;
  webhook_token: string;
  allowed_branches: string[];
  commit_filter: string[];
  created_at: string;
  updated_at: string;
}

export interface Stats {
  success_24h: number;
  failed_24h: number;
  skipped_24h: number;
  total_24h: number;
  total_all: number;
  success_rate: number;
  by_day: { date: string; success: number; failed: number; skipped: number }[];
  by_repo: { name: string; success: number; failed: number; total: number }[];
}

export interface EmbedTemplate {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  use_timestamp?: boolean;
  footer_text?: string;
  footer_icon_url?: string;
  thumbnail_url?: string;
  image_url?: string;
  author_name?: string;
  author_url?: string;
  author_icon_url?: string;
}

export interface Setting {
  key: string;
  value: string;
  description?: string;
  hidden: boolean;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  repository_id?: string;
  platform: string;
  event_type: string;
  payload: string;
  status: "success" | "failed" | "skipped";
  error_message?: string;
  created_at: string;
}

export interface QueueItem {
  id: string;
  repository_id?: string;
  discord_url: string;
  attempts: number;
  max_attempts: number;
  next_retry_at: string;
  created_at: string;
  status: "pending" | "failed";
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export const EMBED_VARIABLES = [
  { key: "{{repo_name}}", label: "Repo Name", desc: "Kurzer Repository-Name" },
  { key: "{{repo_full_name}}", label: "Repo Full Name", desc: "Voller Name (org/repo)" },
  { key: "{{repo_url}}", label: "Repo URL", desc: "Link zum Repository" },
  { key: "{{pusher_name}}", label: "Pusher Name", desc: "Benutzername des Pushers" },
  { key: "{{pusher_avatar}}", label: "Pusher Avatar", desc: "Avatar-URL des Pushers" },
  { key: "{{branch}}", label: "Branch", desc: "Branch-Name" },
  { key: "{{commit_count}}", label: "Commit Count", desc: "Anzahl Commits" },
  { key: "{{added_commits}}", label: "Added Commits", desc: "Commits mit hinzugefügten Dateien" },
  { key: "{{modified_commits}}", label: "Modified Commits", desc: "Commits mit bearbeiteten Dateien" },
  { key: "{{removed_commits}}", label: "Removed Commits", desc: "Commits mit entfernten Dateien" },
  { key: "{{all_commits}}", label: "All Commits", desc: "Alle Commits" },
  { key: "{{discord_timestamp_t}}", label: "Zeit (kurz)", desc: "Discord Zeit z.B. 16:20" },
  { key: "{{discord_timestamp_T}}", label: "Zeit (lang)", desc: "Discord Zeit z.B. 16:20:00" },
  { key: "{{discord_timestamp_d}}", label: "Datum (kurz)", desc: "Discord Datum z.B. 21.12.2021" },
  { key: "{{discord_timestamp_D}}", label: "Datum (lang)", desc: "Discord Datum ausgeschrieben" },
  { key: "{{discord_timestamp_f}}", label: "Datum+Zeit", desc: "Discord Datum und Zeit" },
  { key: "{{discord_timestamp_F}}", label: "Datum+Zeit (lang)", desc: "Discord vollständig" },
  { key: "{{discord_timestamp_R}}", label: "Relativ", desc: "Discord relativ (vor 2 Min.)" },
] as const;
