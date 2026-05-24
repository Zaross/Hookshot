import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  User,
  Eye,
  EyeOff,
  X,
  Loader2,
  AlertTriangle,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usersApi } from "../lib/api";
import { formatDate } from "../lib/utils";
import { useAuthStore } from "../store/authStore";
import PasswordStrength from "../components/PasswordStrength";
import type { User as UserType } from "../types";

const createSchema = z.object({
  username: z.string().min(3),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
  role: z.enum(["admin", "user"]),
});

const editSchema = z.object({
  username: z.string().min(3).optional(),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6).optional().or(z.literal("")),
  role: z.enum(["admin", "user"]),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

function UserModal({
  user,
  onClose,
}: {
  user: UserType | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showPw, setShowPw] = useState(false);
  const isEdit = !!user;

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) =>
      usersApi.create({ ...data, email: data.email || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("users.createSuccess"));
      onClose();
    },
    onError: () => toast.error(t("common.error")),
  });

  const updateMutation = useMutation({
    mutationFn: (data: EditForm) =>
      usersApi.update(user!.id, {
        ...data,
        email: data.email || undefined,
        password: data.password || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("users.updateSuccess"));
      onClose();
    },
    onError: () => toast.error(t("common.error")),
  });

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "user" },
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      username: user?.username ?? "",
      email: user?.email ?? "",
      role: (user?.role as "admin" | "user") ?? "user",
      password: "",
    },
  });

  // Watch password for strength indicator
  const createPassword = useWatch({ control: createForm.control, name: "password" }) ?? "";
  const editPassword   = useWatch({ control: editForm.control,   name: "password" }) ?? "";

  const error = createMutation.error || updateMutation.error;
  const isBusy = createMutation.isPending || updateMutation.isPending;

  const formBody = isEdit ? (
    <form onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
      <div>
        <label className="label">{t("users.username")}</label>
        <input {...editForm.register("username")} className="input" placeholder={user?.username} />
      </div>
      <div>
        <label className="label">{t("users.email")}</label>
        <input {...editForm.register("email")} type="email" className="input" placeholder="user@example.com" />
      </div>
      <div>
        <label className="label">{t("users.password")} <span className="text-text-muted font-normal">— {t("users.passwordHint")}</span></label>
        <div className="relative">
          <input
            {...editForm.register("password")}
            type={showPw ? "text" : "password"}
            className="input pr-10"
            placeholder="••••••••"
          />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {editPassword && <PasswordStrength password={editPassword} />}
      </div>
      <div>
        <label className="label">{t("users.role")} *</label>
        <select {...editForm.register("role")} className="input">
          <option value="user">{t("users.roleUser")}</option>
          <option value="admin">{t("users.roleAdmin")}</option>
        </select>
      </div>
      {error && (
        <div className="text-xs text-accent-red flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {(error as { response?: { data?: { error?: string } } }).response?.data?.error ?? t("common.error")}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={onClose} type="button" className="btn-secondary flex-1 justify-center">{t("common.cancel")}</button>
        <button type="submit" disabled={isBusy} className="btn-primary flex-1 justify-center">
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t("common.save")}
        </button>
      </div>
    </form>
  ) : (
    <form onSubmit={createForm.handleSubmit((data) => createMutation.mutate({ ...data, email: data.email || undefined }))} className="space-y-4">
      <div>
        <label className="label">{t("users.username")} *</label>
        <input {...createForm.register("username")} className="input" placeholder="username" />
        {createForm.formState.errors.username && (
          <p className="text-xs text-accent-red mt-1">{t("users.passwordMin")}</p>
        )}
      </div>
      <div>
        <label className="label">{t("users.email")}</label>
        <input {...createForm.register("email")} type="email" className="input" placeholder="user@example.com" />
      </div>
      <div>
        <label className="label">{t("users.password")} *</label>
        <div className="relative">
          <input
            {...createForm.register("password")}
            type={showPw ? "text" : "password"}
            className="input pr-10"
            placeholder="••••••••"
          />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <PasswordStrength password={createPassword} />
        {createForm.formState.errors.password && (
          <p className="text-xs text-accent-red mt-1">{t("users.passwordMin")}</p>
        )}
      </div>
      <div>
        <label className="label">{t("users.role")} *</label>
        <select {...createForm.register("role")} className="input">
          <option value="user">{t("users.roleUser")}</option>
          <option value="admin">{t("users.roleAdmin")}</option>
        </select>
      </div>
      {error && (
        <div className="text-xs text-accent-red flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {(error as { response?: { data?: { error?: string } } }).response?.data?.error ?? t("common.error")}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={onClose} type="button" className="btn-secondary flex-1 justify-center">{t("common.cancel")}</button>
        <button type="submit" disabled={isBusy} className="btn-primary flex-1 justify-center">
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t("common.create")}
        </button>
      </div>
    </form>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="card p-6 max-w-md w-full shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-text-primary">
            {isEdit ? t("users.editUser") : t("users.createUser")}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {formBody}
      </motion.div>
    </motion.div>
  );
}

export default function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [modal, setModal] = useState<UserType | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<UserType | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("users.deleteSuccess"));
      setDeleteTarget(null);
    },
    onError: () => toast.error(t("common.error")),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t("users.title")}</h1>
            <p className="text-text-muted text-sm">{users.length} {t("users.count")}</p>
          </div>
        </motion.div>

        <button onClick={() => setModal("new")} className="btn-primary">
          <Plus className="w-4 h-4" />
          {t("users.addUser")}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-border">
            {users.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-4 px-5 py-4 hover:bg-bg-hover transition-colors group"
              >
                <div className="w-9 h-9 rounded-full bg-bg-card border border-border flex items-center justify-center shrink-0">
                  {u.role === "admin" ? (
                    <Shield className="w-4 h-4 text-primary" />
                  ) : (
                    <User className="w-4 h-4 text-text-secondary" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{u.username}</span>
                    {u.id === currentUser?.id && (
                      <span className="text-xs text-primary font-medium">({t("common.you")})</span>
                    )}
                    <span
                      className={
                        u.role === "admin"
                          ? "badge-success"
                          : "px-2 py-0.5 rounded-full text-xs font-medium bg-bg-hover text-text-secondary border border-border"
                      }
                    >
                      {u.role === "admin" ? t("users.roleAdmin") : t("users.roleUser")}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    {u.email ?? t("common.noEmail")} · {t("users.created")} {formatDate(u.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setModal(u)}
                    className="p-2 rounded-lg hover:bg-bg-card transition-colors"
                  >
                    <Pencil className="w-4 h-4 text-text-secondary" />
                  </button>
                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => setDeleteTarget(u)}
                      className="p-2 rounded-lg hover:bg-accent-red/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-accent-red" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <UserModal
            user={modal === "new" ? null : modal}
            onClose={() => setModal(null)}
          />
        )}
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card p-6 max-w-sm w-full"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent-red/10 border border-accent-red/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-accent-red" />
                </div>
                <p className="font-semibold text-text-primary">
                  <span className="text-accent-red">{deleteTarget.username}</span> {t("users.deleteConfirm")}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 justify-center">
                  {t("common.cancel")}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(deleteTarget.id)}
                  disabled={deleteMutation.isPending}
                  className="btn-danger flex-1 justify-center"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {t("common.delete")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
