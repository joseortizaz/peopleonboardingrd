"use client";

export default function GoalStatusSelect({
  action,
  defaultValue,
}: {
  action: (formData: FormData) => void;
  defaultValue: string;
}) {
  return (
    <form action={action}>
      <select
        name="status"
        defaultValue={defaultValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
      >
        <option value="pendiente">Pendiente</option>
        <option value="en_progreso">En progreso</option>
        <option value="completado">Completado</option>
      </select>
    </form>
  );
}
