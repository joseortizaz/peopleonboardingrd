"use client";

import { useState } from "react";

export default function ExportCsvButton({
  periodId,
  fileName,
}: {
  periodId: string;
  fileName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nomina/${periodId}`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`No se pudo generar el CSV (HTTP ${res.status})`);
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
      setError(e instanceof Error ? e.message : "No se pudo exportar el CSV");
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
        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        {loading ? "Exportando..." : "Exportar CSV"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
