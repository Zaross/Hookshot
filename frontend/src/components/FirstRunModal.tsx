import { useState } from "react";
import { motion } from "framer-motion";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usersApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import PasswordStrength from "./PasswordStrength";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  });

type FormData = z.infer<typeof schema>;

export default function FirstRunModal() {
  const { t } = useTranslation();
  const { patchUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const newPasswordValue = useWatch({ control, name: "newPassword" }) ?? "";

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      await usersApi.changePassword(data.currentPassword, data.newPassword);
      patchUser({ must_change_password: false });
    } catch {
      setError(t("settings.password.wrongCurrent"));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="card p-8 max-w-md w-full shadow-2xl"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "rgba(34,232,220,0.08)",
              border: "1px solid rgba(34,232,220,0.25)",
              boxShadow: "0 0 24px rgba(34,232,220,0.12)",
            }}
          >
            <ShieldCheck className="w-8 h-8" style={{ color: "#22E8DC" }} />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">{t("firstRun.title")}</h2>
          <p className="text-text-secondary text-sm">{t("firstRun.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              {t("settings.password.current")}
            </label>
            <input
              type="password"
              autoComplete="current-password"
              {...register("currentPassword")}
              className="input w-full"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              {t("firstRun.newPassword")}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              {...register("newPassword")}
              className="input w-full"
              placeholder="••••••••"
            />
            <PasswordStrength password={newPasswordValue} />
            {errors.newPassword && (
              <p className="text-xs text-accent-red mt-1">{t("firstRun.minLength")}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              {t("firstRun.confirmPassword")}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              className="input w-full"
              placeholder="••••••••"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-accent-red mt-1">{t("firstRun.mismatch")}</p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full justify-center mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("firstRun.submitting")}
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                {t("firstRun.submit")}
              </>
            )}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
