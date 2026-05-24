import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center max-w-md"
      >
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <FileQuestion className="w-10 h-10 text-primary" />
          </div>
        </div>

        <h1 className="text-6xl font-bold text-text-primary mb-3">404</h1>
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          {t("notFound.title")}
        </h2>
        <p className="text-text-muted mb-8">{t("notFound.subtitle")}</p>

        <Link
          to="/dashboard"
          className="btn-primary inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("notFound.back")}
        </Link>
      </motion.div>
    </div>
  );
}
