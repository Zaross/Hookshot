import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { authApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";

function AppLogoLarge({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer container */}
      <rect width="120" height="120" rx="26" fill="rgba(34,232,220,0.07)" />
      <rect x="1.5" y="1.5" width="117" height="117" rx="24.5" fill="none" stroke="rgba(34,232,220,0.25)" strokeWidth="1.5" />
      {/* H left vertical */}
      <rect x="22" y="28" width="10" height="58" rx="4" fill="#22E8DC" />
      {/* H crossbar (left half) */}
      <rect x="22" y="51" width="36" height="10" rx="4" fill="#22E8DC" />
      {/* Hook: top half of right H-leg */}
      <path d="M58 28 L58 56 L88 56 L88 28" stroke="#22E8DC" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Arrow from hook corner */}
      <path d="M88 56 L96 56 L96 64" stroke="#22E8DC" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="81" y1="73" x2="95" y2="57" stroke="#22E8DC" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

function LangToggle() {
  const { i18n } = useTranslation();
  const isDE = i18n.language === "de";
  return (
    <button
      onClick={() => i18n.changeLanguage(isDE ? "en" : "de")}
      className="text-xs font-semibold text-text-muted hover:text-text-secondary transition-colors px-2 py-1 rounded border border-border hover:border-border-light"
    >
      {isDE ? "EN" : "DE"}
    </button>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempToken, setTempToken] = useState<string | null>(null);

  const loginSchema = z.object({
    username: z.string().min(1, t("common.required")),
    password: z.string().min(1, t("common.required")),
  });
  const totpSchema = z.object({
    code: z.string().length(6, "6-stellig"),
  });

  const loginForm = useForm({ resolver: zodResolver(loginSchema) });
  const totpForm = useForm({ resolver: zodResolver(totpSchema) });

  const onLogin = async (data: { username: string; password: string } | any) => {
    setError(null);
    try {
      const res = await authApi.login(data.username, data.password);
      if ("needs_2fa" in res && res.needs_2fa) {
        setTempToken(res.temp_token);
      } else if ("token" in res) {
        setAuth(res.token, res.user);
        navigate("/dashboard");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (msg.toLowerCase().includes("locked")) {
        setError(t("login.accountLocked"));
      } else {
        setError(t("login.invalidCredentials"));
      }
    }
  };

  const onTotp = async (data: { code: string } | any) => {
    if (!tempToken) return;
    setError(null);
    try {
      const res = await authApi.totpVerify(tempToken, data.code);
      setAuth(res.token, res.user);
      navigate("/dashboard");
    } catch {
      setError(t("login.totp.invalid"));
    }
  };

  const cardContent = tempToken ? (
    <form onSubmit={totpForm.handleSubmit(onTotp)} className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(34,232,220,0.1)", border: "1px solid rgba(34,232,220,0.2)" }}
        >
          <ShieldCheck className="w-5 h-5" style={{ color: "#22E8DC" }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{t("login.totp.title")}</p>
          <p className="text-xs text-text-muted">{t("login.totp.subtitle")}</p>
        </div>
      </div>

      <div>
        <label className="label">{t("login.totp.codeLabel")}</label>
        <input
          {...totpForm.register("code")}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="input text-center text-xl tracking-widest font-mono"
          placeholder={t("login.totp.codePlaceholder")}
          maxLength={6}
          autoFocus
        />
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </motion.div>
      )}

      <button
        type="submit"
        disabled={totpForm.formState.isSubmitting}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #22E8DC 0%, #1ACFC4 100%)", color: "#0D0F14", boxShadow: "0 4px 16px rgba(34,232,220,0.3)" }}
      >
        {totpForm.formState.isSubmitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" />{t("login.totp.submitting")}</>
        ) : t("login.totp.submit")}
      </button>

      <button
        type="button"
        onClick={() => { setTempToken(null); setError(null); loginForm.reset(); }}
        className="w-full text-xs text-text-muted hover:text-text-secondary transition-colors py-1"
      >
        {t("login.totp.backToLogin")}
      </button>
    </form>
  ) : (
    <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
      <div>
        <label className="label">{t("login.username")}</label>
        <input
          {...loginForm.register("username")}
          type="text"
          autoComplete="username"
          className="input"
          placeholder={t("login.usernamePlaceholder")}
        />
        {loginForm.formState.errors.username && (
          <p className="text-xs text-accent-red mt-1">{loginForm.formState.errors.username.message as string}</p>
        )}
      </div>

      <div>
        <label className="label">{t("login.password")}</label>
        <div className="relative">
          <input
            {...loginForm.register("password")}
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            className="input pr-10"
            placeholder={t("login.passwordPlaceholder")}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-text-muted"
          >
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {loginForm.formState.errors.password && (
          <p className="text-xs text-accent-red mt-1">{loginForm.formState.errors.password.message as string}</p>
        )}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-sm"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </motion.div>
      )}

      <button
        type="submit"
        disabled={loginForm.formState.isSubmitting}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
        style={{
          background: loginForm.formState.isSubmitting ? "rgba(34,232,220,0.6)" : "linear-gradient(135deg, #22E8DC 0%, #1ACFC4 100%)",
          color: "#0D0F14",
          boxShadow: loginForm.formState.isSubmitting ? "none" : "0 4px 16px rgba(34,232,220,0.3)",
        }}
      >
        {loginForm.formState.isSubmitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" />{t("login.submitting")}</>
        ) : t("login.submit")}
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(rgba(34,232,220,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34,232,220,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(34,232,220,0.08) 0%, transparent 70%)" }}
      />

      <div className="absolute top-4 right-4 z-10">
        <LangToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center justify-center mb-5"
            style={{ filter: "drop-shadow(0 0 24px rgba(34,232,220,0.35))" }}
          >
            <AppLogoLarge size={72} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">{t("app.tagline")}</h1>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card p-6 shadow-2xl"
          style={{ boxShadow: "0 0 0 1px rgba(34,232,220,0.08), 0 24px 48px rgba(0,0,0,0.5)" }}
        >
          {cardContent}
        </motion.div>

        <p className="text-center text-xs mt-5 text-text-muted">{t("app.version")}</p>
      </motion.div>
    </div>
  );
}
