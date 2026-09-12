"use client";

import { useState } from "react";

/**
 * Input de contraseña con botón para mostrar/ocultar el texto escrito.
 * Se duplica en /restablecer-password (mismo patrón ya usado en el
 * proyecto de clonar componentes pequeños en vez de compartir un util).
 */
export default function PasswordInput({
  id,
  name,
  required,
  minLength,
  autoComplete,
  placeholder,
}: {
  id: string;
  name: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-1">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
      >
        {visible ? (
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.29 10.29 0 003.196-4.213.75.75 0 000-.53C17.75 6.61 14.235 4 10 4a9.86 9.86 0 00-4.512 1.074L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.374l1.091 1.092a4 4 0 00-5.557-5.557z" />
            <path d="M2.25 10c1.348 2.664 4.259 5 7.75 5a9.86 9.86 0 003.512-.63l-1.213-1.213A4 4 0 016.843 8.156l-2.302-2.303A10.29 10.29 0 002.25 9.47a.75.75 0 000 .53z" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
            <path
              fillRule="evenodd"
              d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.147.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
