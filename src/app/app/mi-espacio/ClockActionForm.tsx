"use client";

import { useEffect, useState } from "react";

export default function ClockActionForm({
  action,
  label,
}: {
  action: (formData: FormData) => void;
  label: string;
}) {
  const [coords, setCoords] = useState<{ lat: string; lng: string }>({
    lat: "",
    lng: "",
  });

  // La geolocalizacion es solo de referencia -- si el navegador la
  // deniega, no tiene soporte, o tarda demasiado, el marcaje se envia
  // igual sin coordenadas. Nunca bloquea el envio del formulario.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
        });
      },
      () => {
        // Denegado o no disponible: se deja en blanco, sin bloquear.
      },
      { timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="lat" value={coords.lat} />
      <input type="hidden" name="lng" value={coords.lng} />
      <div className="flex items-center gap-2">
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="user"
          required
          className="max-w-[160px] text-xs text-gray-600 file:mr-2 file:rounded-md file:border-0 file:bg-gray-100 file:px-2 file:py-1 file:text-xs"
        />
        <button
          type="submit"
          className="whitespace-nowrap rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {label}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">Toma una foto para marcar.</p>
    </form>
  );
}
