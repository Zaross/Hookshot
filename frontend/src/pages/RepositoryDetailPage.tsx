import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch,
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Send,
  X,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { reposApi } from "../lib/api";
import type { EmbedTemplate } from "../types";
import EmbedBuilder from "../components/EmbedBuilder";

const schema = z.object({
  full_name: z.string().min(1),
  platform: z.enum(["github", "gitlab"]),
  secret: z.string().min(1),
  discord_webhook_url: z.string().url(),
  active: z.boolean(),
});

type FormData = z.infer<typeof schema>;

const DEFAULT_TEMPLATE: EmbedTemplate = {
  title: "{{repo_name}}",
  description:
    "**\u{1F680} Added:**\n{{added_commits}}\n\n**\u{1F4E6} Modified:**\n{{modified_commits}}\n\n**\u{26D4} Removed:**\n{{removed_commits}}",
  color: 1752220,
  url: "{{repo_url}}",
  use_timestamp: true,
  footer_text: "{{pusher_name}}",
  footer_icon_url: "{{pusher_avatar}}",
};

function generateSecret(len = 48): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  arr.forEach((v) => (result += chars[v % chars.length]));
  return result;
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  const remove = (tag: string) => onChange(values.filter((v) => v !== tag));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="input flex-1"
        />
        <button type="button" onClick={add} className="btn-secondary px-3 shrink-0">
          {t("common.create")}
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-mono"
            >
              {tag}
              <button type="button" onClick={() => remove(tag)} className="hover:text-accent-red transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RepositoryDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === "new";

  const [template, setTemplate] = useState<EmbedTemplate>(DEFAULT_TEMPLATE);
  const [copied, setCopied] = useState(false);
  const [allowedBranches, setAllowedBranches] = useState<string[]>([]);
  const [commitFilter, setCommitFilter] = useState<string[]>([]);
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const { data: repo, isLoading } = useQuery({
    queryKey: ["repositories", id],
    queryFn: () => reposApi.get(id!),
    enabled: !isNew,
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { platform: "github", active: true },
  });

  useEffect(() => {
    if (repo) {
      setValue("full_name", repo.full_name);
      setValue("platform", repo.platform as "github" | "gitlab");
      setValue("secret", repo.secret);
      setValue("discord_webhook_url", repo.discord_webhook_url);
      setValue("active", repo.active);
      setAllowedBranches(repo.allowed_branches ?? []);
      setCommitFilter(repo.commit_filter ?? []);
      try {
        setTemplate(JSON.parse(repo.embed_template));
      } catch {
        setTemplate(DEFAULT_TEMPLATE);
      }
    }
  }, [repo, setValue]);

  const createMutation = useMutation({
    mutationFn: (data: FormData & { embed_template: EmbedTemplate; allowed_branches: string[]; commit_filter: string[] }) =>
      reposApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success(t("common.success"));
      navigate("/repositories");
    },
    onError: () => toast.error(t("common.error")),
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData & { embed_template: EmbedTemplate; allowed_branches: string[]; commit_filter: string[] }) =>
      reposApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success(t("repoDetail.saved"));
    },
    onError: () => toast.error(t("common.error")),
  });

  const onSubmit = (data: FormData) => {
    const payload = { ...data, embed_template: template, allowed_branches: allowedBranches, commit_filter: commitFilter };
    if (isNew) createMutation.mutate(payload);
    else updateMutation.mutate(payload);
  };

  const handleTest = async () => {
    if (!id || isNew) return;
    setTestStatus("loading");
    try {
      await reposApi.test(id);
      setTestStatus("success");
      toast.success(t("repoDetail.testSent"));
    } catch {
      setTestStatus("error");
      toast.error(t("repoDetail.testError"));
    } finally {
      setTimeout(() => setTestStatus("idle"), 3000);
    }
  };

  const copyWebhookUrl = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/webhook/${token}`);
    setCopied(true);
    toast.success(t("common.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    if (!confirm(t("repoDetail.regenerateConfirm"))) return;
    reposApi
      .regenerateToken(repo!.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["repositories", id] });
        toast.success(t("repoDetail.regenerateToken"));
      })
      .catch(() => toast.error(t("common.error")));
  };

  const error = createMutation.error || updateMutation.error;
  const isBusy = isSubmitting || createMutation.isPending || updateMutation.isPending;

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <Link
          to="/repositories"
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {isNew ? t("repoDetail.new") : t("repoDetail.edit")}
          </h1>
          {repo && <p className="text-text-muted text-sm">{repo.full_name}</p>}
        </div>
      </motion.div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Configuration */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-text-primary">{t("repoDetail.configuration")}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t("repoDetail.displayName")} *</label>
              <input
                {...register("full_name")}
                className="input"
                placeholder={t("repoDetail.displayNamePlaceholder")}
              />
              <p className="text-xs text-text-muted mt-1">{t("repoDetail.displayNameHint")}</p>
              {errors.full_name && (
                <p className="text-xs text-accent-red mt-1">{t("common.required")}</p>
              )}
            </div>
            <div>
              <label className="label">{t("repoDetail.platform")} *</label>
              <select {...register("platform")} className="input">
                <option value="github">{t("repoDetail.platformGithub")}</option>
                <option value="gitlab">{t("repoDetail.platformGitlab")}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">{t("repoDetail.webhookSecret")} *</label>
            <div className="flex gap-2">
              <input
                {...register("secret")}
                className="input font-mono flex-1"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setValue("secret", generateSecret())}
                className="btn-secondary px-3 shrink-0"
                title={t("repoDetail.webhookSecretGenerate")}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {errors.secret && (
              <p className="text-xs text-accent-red mt-1">{t("common.required")}</p>
            )}
          </div>

          <div>
            <label className="label">{t("repoDetail.discordUrl")} *</label>
            <input
              {...register("discord_webhook_url")}
              className="input font-mono"
              placeholder={t("repoDetail.discordUrlPlaceholder")}
            />
            {errors.discord_webhook_url && (
              <p className="text-xs text-accent-red mt-1">{t("common.required")}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              {...register("active")}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="active" className="text-sm text-text-secondary cursor-pointer">
              {t("repoDetail.status")} ({t("common.active")})
            </label>
          </div>
        </motion.div>

        {/* Webhook URL */}
        {repo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="card p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">{t("repoDetail.webhookUrl")}</h2>
              <button
                type="button"
                onClick={handleTest}
                disabled={testStatus === "loading"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  testStatus === "success"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : testStatus === "error"
                    ? "bg-accent-red/10 text-accent-red border-accent-red/20"
                    : "bg-bg-hover text-text-secondary border-border hover:border-primary hover:text-primary"
                }`}
              >
                {testStatus === "loading" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : testStatus === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : testStatus === "error" ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {testStatus === "success"
                  ? t("repoDetail.testSent")
                  : testStatus === "error"
                  ? t("repoDetail.testError")
                  : t("repoDetail.testSend")}
              </button>
            </div>
            <p className="text-xs text-text-muted">{t("repoDetail.webhookUrlHint")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary truncate">
                {`${window.location.origin}/webhook/${repo.webhook_token}`}
              </code>
              <button
                type="button"
                onClick={() => copyWebhookUrl(repo.webhook_token)}
                className="shrink-0 p-2 rounded-lg border border-border bg-bg-hover hover:bg-border transition-colors text-text-secondary hover:text-text-primary"
                title={t("common.copy")}
              >
                {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                className="shrink-0 p-2 rounded-lg border border-border bg-bg-hover hover:bg-accent-amber/10 hover:border-accent-amber/30 transition-colors text-text-secondary hover:text-accent-amber"
                title={t("repoDetail.regenerateToken")}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="card p-5 space-y-5"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">{t("repoDetail.filter")}</h2>
          </div>

          <div>
            <label className="label">{t("repoDetail.branchFilter")}</label>
            <p className="text-xs text-text-muted mb-2">{t("repoDetail.branchFilterHint")}</p>
            <TagInput
              values={allowedBranches}
              onChange={setAllowedBranches}
              placeholder={t("repoDetail.branchFilterPlaceholder")}
            />
          </div>

          <div>
            <label className="label">{t("repoDetail.commitFilter")}</label>
            <p className="text-xs text-text-muted mb-2">{t("repoDetail.commitFilterHint")}</p>
            <TagInput
              values={commitFilter}
              onChange={setCommitFilter}
              placeholder={t("repoDetail.commitFilterPlaceholder")}
            />
          </div>
        </motion.div>

        {/* Embed Builder */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="card p-5"
        >
          <EmbedBuilder value={template} onChange={setTemplate} />
        </motion.div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {(error as { response?: { data?: { error?: string } } }).response?.data?.error ?? t("common.error")}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={isBusy} className="btn-primary">
            {isBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isNew
              ? (isBusy ? t("repoDetail.creating") : t("common.create"))
              : (isBusy ? t("repoDetail.saving") : t("common.save"))}
          </button>
          <Link to="/repositories" className="btn-secondary">
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
