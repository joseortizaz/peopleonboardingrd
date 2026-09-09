"use client";

type Stage = { key: string; label: string };

export function StageSelect({
  action,
  stage,
  stages,
}: {
  action: (formData: FormData) => void;
  stage: string;
  stages: Stage[];
}) {
  return (
    <form action={action} className="mt-2">
      <select
        name="stage"
        defaultValue={stage}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
      >
        {stages.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </form>
  );
}
