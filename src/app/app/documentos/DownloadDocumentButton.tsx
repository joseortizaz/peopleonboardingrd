"use client";

import { useState } from "react";

export default function DownloadDocumentButton({
  documentId,
  label = "Descargar",
}: {
  documentId: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documentos/${documentId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `No se pudo descargar (HTTP ${res.status})`);
      }
      const fileRes = await fetch(data.url);
      if (!fileRes.ok) {
        throw new Error("No se pudo descargar el archivo");
      }
      const blob = await fileRes.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descargar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="text-xs text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
      >
        {loading ? "Descargando..." : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
