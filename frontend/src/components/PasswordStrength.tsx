import { useTranslation } from "react-i18next";

function calcScore(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s; // 0–5
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#22E8DC"];
const LABELS = ["veryWeak", "weak", "fair", "good", "strong"] as const;
const SEGMENTS = 5;

export default function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();
  const score = calcScore(password);
  if (!password) return null;

  const color = COLORS[Math.max(0, score - 1)];
  const label = LABELS[Math.max(0, score - 1)];

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < score ? color : "var(--border)" }}
          />
        ))}
      </div>
      <p className="text-xs transition-colors" style={{ color }}>
        {t(`common.passwordStrength.${label}`)}
      </p>
    </div>
  );
}
