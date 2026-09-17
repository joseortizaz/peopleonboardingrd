"use client";

import { useState } from "react";

export default function ViewEvidenceLink({ goalId }: { goalId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleView() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/desarrollo/evidencia/${goalId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `No se pudo abrir la evidencia (HTTP ${res.status})`);
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la evidencia");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleView}
        disabled={loading}
        className="text-xs text-gray-600 underline hover:text-gray-900 disabled:opacity-50"
      >
        {loading ? "Abriendo..." : "Ver evidencia"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
