/**
 * Checkbox de consentimiento para el tratamiento de datos personales,
 * pensado para reutilizarse en cualquier formulario público del sistema
 * (Ley 172-13 de Protección de Datos Personales, República Dominicana).
 *
 * Primer uso: /apply/[slug] (formulario público de aplicación a
 * vacantes). Deliberadamente genérico -- no menciona "candidato" ni
 * "vacante" -- para poder reutilizarse en un futuro formulario público
 * distinto sin cambiar el componente.
 */
export default function DataConsentCheckbox({
  name = "data_consent",
}: {
  name?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-gray-600">
      <input
        name={name}
        type="checkbox"
        required
        className="mt-0.5 rounded border-gray-300"
      />
      <span>
        Autorizo el tratamiento de mis datos personales conforme a la Ley
        172-13 de Protección de Datos Personales de República Dominicana,
        con el único fin de evaluar mi postulación.{" "}
        <span className="text-red-500">*</span>
      </span>
    </label>
  );
}
