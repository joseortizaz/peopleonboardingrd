"use client";

import { useState } from "react";

export default function ExportBenefitReportButton({
  benefitTypeId,
  fileName,
}: {
  benefitTypeId: string;
  fileName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/beneficios/${benefitTypeId}/reporte`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`No se pudo generar el reporte (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar el reporte");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="shrink-0 text-xs text-gray-600 hover:underline disabled:opacity-50"
      >
        {loading ? "Exportando..." : "Exportar reporte"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
