"use client";

export default function GoalEvidenceForm({
  action,
  defaultNote,
}: {
  action: (formData: FormData) => void;
  defaultNote: string | null;
}) {
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <div className="min-w-[160px] flex-1">
        <label className="block text-[11px] text-gray-500">Nota de evidencia</label>
        <input
          name="evidence_note"
          type="text"
          defaultValue={defaultNote ?? ""}
          placeholder="Comentario opcional"
          className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
        />
      </div>
      <div>
        <label className="block text-[11px] text-gray-500">Archivo</label>
        <input name="evidence_file" type="file" className="mt-0.5 text-xs" />
      </div>
      <button
        type="submit"
        className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
      >
        Guardar evidencia
      </button>
    </form>
  );
}
