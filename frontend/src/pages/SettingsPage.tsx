import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Save,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  Key,
  Lock,
  AlertCircle,
  ShieldCheck,
  ShieldOff,
  Copy,
  ExternalLink,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { settingsApi, usersApi, authApi } from "../lib/api";
import type { Setting } from "../types";
import { formatDate } from "../lib/utils";
import { useAuthStore } from "../store/authStore";
import PasswordStrength from "../components/PasswordStrength";

// Keys rendered in the "API Keys" card
const API_KEY_SETTINGS = ["steam_api_key", "api_key"];
// Keys rendered in the "Maintenance" card
const MAINTENANCE_SETTINGS = ["log_retention_days"];
// Keys that are numeric — rendered as <input type="number">
const NUMERIC_SETTINGS = ["log_retention_days"];

function SettingRow({
  setting,
  value,
  onChange,
}: {
  setting: Setting;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  const isSecret =
    setting.key.toLowerCase().includes("key") ||
    setting.key.toLowerCase().includes("secret");
  const isNumeric = NUMERIC_SETTINGS.includes(setting.key);

  // Human-readable label: prefer i18n, fall back to raw key
  const labelKey = `settings.keys.${setting.key}`;
  const label = t(labelKey, { defaultValue: setting.key });
  // Prefer inline i18n hint over DB description (both can coexist)
  const hintKey = `settings.keyHints.${setting.key}`;
  const hint = t(hintKey, { defaultValue: "" }) || setting.description;

  const icon = isNumeric
    ? <Clock className="w-3.5 h-3.5 text-primary" />
    : isSecret
    ? <Key className="w-3.5 h-3.5 text-accent-amber" />
    : <Settings className="w-3.5 h-3.5 text-text-secondary" />;

  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-lg bg-bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-sm font-medium text-text-primary">{label}</p>
            <p className="text-xs text-text-muted">{formatDate(setting.updated_at)}</p>
          </div>
          {hint && (
            <p className="text-xs text-text-muted mb-2">{hint}</p>
          )}
          {isNumeric ? (
            <input
              type="number"
              min={0}
              max={3650}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="input w-32"
            />
          ) : (
            <div className="relative">
              <input
                type={isSecret && !show ? "password" : "text"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="input pr-10 font-mono"
                placeholder={`${label}…`}
              />
              {isSecret && (
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const pwSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: "mismatch",
  path: ["confirm_password"],
});

type PwForm = z.infer<typeof pwSchema>;

function TwoFASection() {
  const { t } = useTranslation();
  const { user, setAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"idle" | "setup" | "enable" | "disable">("idle");
  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEnabled, setIsEnabled] = useState(user?.totp_enabled ?? false);

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
  });

  useEffect(() => {
    if (meData) setIsEnabled(meData.totp_enabled ?? false);
  }, [meData]);

  const setupMutation = useMutation({
    mutationFn: authApi.totpSetup,
    onSuccess: (data) => {
      setSetupData(data);
      setStep("enable");
    },
    onError: () => toast.error(t("common.error")),
  });

  const enableMutation = useMutation({
    mutationFn: (code: string) => authApi.totpEnable(code),
    onSuccess: () => {
      setIsEnabled(true);
      setStep("idle");
      setSetupData(null);
      setEnableCode("");
      queryClient.invalidateQueries({ queryKey: ["me"] });
      if (user) setAuth(localStorage.getItem("token")!, { ...user, totp_enabled: true });
      toast.success(t("settings.totp.statusActive"));
    },
    onError: () => {
      setError(t("settings.totp.invalidCode"));
      toast.error(t("settings.totp.invalidCode"));
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => authApi.totpDisable(disablePassword, disableCode),
    onSuccess: () => {
      setIsEnabled(false);
      setStep("idle");
      setDisablePassword("");
      setDisableCode("");
      queryClient.invalidateQueries({ queryKey: ["me"] });
      if (user) setAuth(localStorage.getItem("token")!, { ...user, totp_enabled: false });
      toast.success(t("settings.totp.statusInactive"));
    },
    onError: () => {
      setError(t("settings.totp.wrongPasswordOrCode"));
      toast.error(t("settings.totp.wrongPasswordOrCode"));
    },
  });

  const copySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      toast.success(t("common.copied"));
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="card p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="font-semibold text-text-primary text-sm">{t("settings.totp.title")}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isEnabled ? "badge-success" : "badge-skipped"}`}>
          {isEnabled ? t("settings.totp.statusActive") : t("settings.totp.statusInactive")}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-accent-red">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {step === "idle" && (
        <div>
          <p className="text-sm text-text-secondary mb-3">
            {isEnabled ? t("settings.totp.descriptionEnabled") : t("settings.totp.descriptionDisabled")}
          </p>
          {isEnabled ? (
            <button
              onClick={() => { setStep("disable"); setError(null); }}
              className="btn-danger text-sm"
            >
              <ShieldOff className="w-4 h-4" />
              {t("settings.totp.disable")}
            </button>
          ) : (
            <button
              onClick={() => { setError(null); setupMutation.mutate(); }}
              disabled={setupMutation.isPending}
              className="btn-primary text-sm"
            >
              {setupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {t("settings.totp.setup")}
            </button>
          )}
        </div>
      )}

      {step === "enable" && setupData && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {t("settings.totp.openAuthenticator")}
          </p>
          <div className="bg-bg-card border border-border rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">{t("settings.totp.secret")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-primary break-all">{setupData.secret}</code>
              <button type="button" onClick={copySecret} className="shrink-0 p-1.5 rounded hover:bg-bg-hover transition-colors">
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-text-muted" />}
              </button>
            </div>
          </div>
          <a
            href={setupData.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            {t("settings.totp.openAuthenticator")}
          </a>
          <div>
            <label className="label">{t("settings.totp.confirmCode")}</label>
            <input
              type="text"
              inputMode="numeric"
              value={enableCode}
              onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="input font-mono tracking-widest text-center"
              maxLength={6}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setStep("idle"); setSetupData(null); setError(null); }}
              className="btn-secondary flex-1 justify-center text-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); enableMutation.mutate(enableCode); }}
              disabled={enableCode.length !== 6 || enableMutation.isPending}
              className="btn-primary flex-1 justify-center text-sm"
            >
              {enableMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {t("settings.totp.enable")}
            </button>
          </div>
        </div>
      )}

      {step === "disable" && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">{t("settings.totp.descriptionEnabled")}</p>
          <div>
            <label className="label">{t("settings.totp.confirmDisablePassword")}</label>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="label">{t("settings.totp.confirmDisableCode")}</label>
            <input
              type="text"
              inputMode="numeric"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="input font-mono tracking-widest text-center"
              maxLength={6}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setStep("idle"); setError(null); }}
              className="btn-secondary flex-1 justify-center text-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); disableMutation.mutate(); }}
              disabled={!disablePassword || disableCode.length !== 6 || disableMutation.isPending}
              className="btn-danger flex-1 justify-center text-sm"
            >
              {disableMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
              {t("settings.totp.disableConfirm")}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.list,
  });

  useEffect(() => {
    const map: Record<string, string> = {};
    settings.forEach((s) => (map[s.key] = s.value));
    setValues(map);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsApi.updateBulk(
        Object.entries(values).map(([key, value]) => ({ key, value }))
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("common.saved"));
    },
    onError: () => toast.error(t("common.error")),
  });

  const pwForm = useForm<PwForm>({ resolver: zodResolver(pwSchema) });
  const newPwValue = useWatch({ control: pwForm.control, name: "new_password" }) ?? "";

  const pwMutation = useMutation({
    mutationFn: (data: PwForm) =>
      usersApi.changePassword(data.current_password, data.new_password),
    onSuccess: () => {
      pwForm.reset();
      toast.success(t("settings.password.success"));
    },
    onError: () => toast.error(t("settings.password.wrongCurrent")),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Settings className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t("settings.title")}</h1>
          <p className="text-text-muted text-sm">{t("settings.subtitle")}</p>
        </div>
      </motion.div>

      {/* ── API Keys card ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card"
      >
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Key className="w-4 h-4 text-primary" />
          <span className="font-semibold text-text-primary text-sm">{t("settings.apiKeys")}</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="px-5">
            {settings
              .filter((s) => API_KEY_SETTINGS.includes(s.key))
              .map((s) => (
                <SettingRow
                  key={s.key}
                  setting={s}
                  value={values[s.key] ?? ""}
                  onChange={(v) => setValues((prev) => ({ ...prev, [s.key]: v }))}
                />
              ))}
          </div>
        )}

        <div className="px-5 py-4 border-t border-border">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t("common.save")}
          </button>
        </div>
      </motion.div>

      {/* ── Maintenance card ────────────────────────────────────────────── */}
      {!isLoading && settings.some((s) => MAINTENANCE_SETTINGS.includes(s.key)) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card"
        >
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="font-semibold text-text-primary text-sm">{t("settings.maintenance")}</span>
          </div>

          <div className="px-5">
            {settings
              .filter((s) => MAINTENANCE_SETTINGS.includes(s.key))
              .map((s) => (
                <SettingRow
                  key={s.key}
                  setting={s}
                  value={values[s.key] ?? ""}
                  onChange={(v) => setValues((prev) => ({ ...prev, [s.key]: v }))}
                />
              ))}
          </div>

          <div className="px-5 py-4 border-t border-border">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-primary"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {t("common.save")}
            </button>
          </div>
        </motion.div>
      )}

      <TwoFASection />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-primary" />
          <span className="font-semibold text-text-primary text-sm">{t("settings.password.title")}</span>
        </div>

        <form
          onSubmit={pwForm.handleSubmit((d) => pwMutation.mutate(d))}
          className="space-y-3"
        >
          <div>
            <label className="label">{t("settings.password.current")}</label>
            <input
              {...pwForm.register("current_password")}
              type="password"
              className="input"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="label">{t("settings.password.new")}</label>
            <input
              {...pwForm.register("new_password")}
              type="password"
              className="input"
              placeholder={t("settings.password.newHint")}
            />
            <PasswordStrength password={newPwValue} />
            {pwForm.formState.errors.new_password && (
              <p className="text-xs text-accent-red mt-1">
                {t("settings.password.newHint")}
              </p>
            )}
          </div>
          <div>
            <label className="label">{t("settings.password.confirm")}</label>
            <input
              {...pwForm.register("confirm_password")}
              type="password"
              className="input"
              placeholder="••••••••"
            />
            {pwForm.formState.errors.confirm_password && (
              <p className="text-xs text-accent-red mt-1">
                {t("settings.password.mismatch")}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pwMutation.isPending}
            className="btn-primary"
          >
            {pwMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            {t("settings.password.submit")}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
