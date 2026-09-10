"use client";

import { useActionState } from "react";
import { enrollFactor, verifyFactor } from "./actions";

export function MfaEnroll() {
  const [enrollState, enrollFormAction, enrolling] = useActionState(enrollFactor, null);
  const [verifyState, verifyFormAction, verifying] = useActionState(verifyFactor, null);

  if (!enrollState?.factorId) {
    return (
      <div>
        <p className="text-sm text-gray-600">
          Añade una capa extra de seguridad: además de tu contraseña, se
          pedirá un código de 6 dígitos generado por una app de autenticación
          en tu teléfono (Google Authenticator, Authy, 1Password, etc.).
        </p>
        {enrollState?.error && (
          <p className="mt-2 text-sm text-red-600">{enrollState.error}</p>
        )}
        <form action={enrollFormAction} className="mt-4">
          <button
            type="submit"
            disabled={enrolling}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {enrolling ? "Generando..." : "Activar verificación en dos pasos"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-600">
        Escanea este código QR con tu app de autenticación:
      </p>
      <div
        className="mt-3 w-fit rounded-md border border-gray-200 p-2"
        // El SVG proviene directamente de la respuesta de Supabase Auth
        // (auth.mfa.enroll), no de contenido escrito por el usuario.
        dangerouslySetInnerHTML={{ __html: enrollState.qrCode }}
      />
      <p className="mt-3 text-xs text-gray-500">
        ¿No puedes escanear el código? Ingresa esta clave manualmente:{" "}
        <code className="rounded bg-gray-100 px-1.5 py-0.5">
          {enrollState.secret}
        </code>
      </p>

      <form action={verifyFormAction} className="mt-5 flex items-end gap-3">
        <input type="hidden" name="factorId" value={enrollState.factorId} />
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-gray-700">
            Código de 6 dígitos
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={verifying}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {verifying ? "Verificando..." : "Verificar y activar"}
        </button>
      </form>
      {verifyState?.error && (
        <p className="mt-2 text-sm text-red-600">{verifyState.error}</p>
      )}
    </div>
  );
}
