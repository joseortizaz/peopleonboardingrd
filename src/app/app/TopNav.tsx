"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MemberRole } from "@/lib/supabase/tenant";

type NavLinkItem = { href: string; label: string };
type NavColor = keyof typeof COLOR_STYLES;
type NavGroupDef = {
  key: string;
  label: string;
  color: NavColor;
  links: NavLinkItem[];
};

// Clases de Tailwind escritas de forma literal (no interpoladas) a propósito:
// el escaneo de contenido de Tailwind busca el texto tal cual en el archivo,
// así que construir el nombre de la clase con un template string (`bg-${color}-500`)
// haría que Tailwind no las incluya en el CSS final.
const COLOR_STYLES = {
  indigo: {
    dot: "bg-indigo-500",
    text: "text-indigo-700",
    hoverText: "hover:text-indigo-700",
    activeBg: "bg-indigo-50",
    itemHover: "hover:bg-indigo-50 hover:text-indigo-700",
  },
  emerald: {
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    hoverText: "hover:text-emerald-700",
    activeBg: "bg-emerald-50",
    itemHover: "hover:bg-emerald-50 hover:text-emerald-700",
  },
  amber: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    hoverText: "hover:text-amber-700",
    activeBg: "bg-amber-50",
    itemHover: "hover:bg-amber-50 hover:text-amber-700",
  },
  rose: {
    dot: "bg-rose-500",
    text: "text-rose-700",
    hoverText: "hover:text-rose-700",
    activeBg: "bg-rose-50",
    itemHover: "hover:bg-rose-50 hover:text-rose-700",
  },
  sky: {
    dot: "bg-sky-500",
    text: "text-sky-700",
    hoverText: "hover:text-sky-700",
    activeBg: "bg-sky-50",
    itemHover: "hover:bg-sky-50 hover:text-sky-700",
  },
  teal: {
    dot: "bg-teal-500",
    text: "text-teal-700",
    hoverText: "hover:text-teal-700",
    activeBg: "bg-teal-50",
    itemHover: "hover:bg-teal-50 hover:text-teal-700",
  },
  violet: {
    dot: "bg-violet-500",
    text: "text-violet-700",
    hoverText: "hover:text-violet-700",
    activeBg: "bg-violet-50",
    itemHover: "hover:bg-violet-50 hover:text-violet-700",
  },
} as const;

// Agrupación pensada para reducir ~19 enlaces sueltos a unos pocos menús con
// significado propio. Cada grupo tiene un color fijo que también se usa en
// las tarjetas del dashboard (ver app/page.tsx) para que la asociación
// visual sea consistente en toda la app.
const GROUPS: NavGroupDef[] = [
  {
    key: "personas",
    label: "Personas",
    color: "indigo",
    links: [
      { href: "/app/organizacion", label: "Estructura organizacional" },
      { href: "/app/ats", label: "Reclutamiento" },
      { href: "/app/empleados", label: "Empleados" },
      { href: "/app/incorporacion", label: "Incorporación" },
      { href: "/app/bajas", label: "Bajas" },
    ],
  },
  {
    key: "nomina",
    label: "Nómina y beneficios",
    color: "emerald",
    links: [
      { href: "/app/nomina", label: "Nómina" },
      { href: "/app/beneficios", label: "Beneficios" },
      { href: "/app/asistencia", label: "Asistencia" },
      { href: "/app/permisos", label: "Permisos" },
    ],
  },
  {
    key: "desempeno",
    label: "Desempeño",
    color: "rose",
    links: [
      { href: "/app/evaluaciones", label: "Evaluaciones" },
      { href: "/app/capacitacion", label: "Capacitación" },
    ],
  },
  {
    key: "comunicacion",
    label: "Comunicación",
    color: "sky",
    links: [
      { href: "/app/comunicacion", label: "Comunicación" },
      { href: "/app/encuestas", label: "Encuestas" },
      { href: "/app/analytics", label: "Analytics" },
    ],
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function NavDropdown({
  group,
  openKey,
  setOpenKey,
}: {
  group: NavGroupDef;
  openKey: string | null;
  setOpenKey: (key: string | null) => void;
}) {
  const styles = COLOR_STYLES[group.color];
  const isOpen = openKey === group.key;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpenKey(isOpen ? null : group.key)}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors ${styles.hoverText} ${
          isOpen ? `${styles.activeBg} ${styles.text}` : ""
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
        {group.label}
        <ChevronIcon open={isOpen} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg">
          {group.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpenKey(null)}
              className={`block px-3 py-2 text-sm text-gray-700 ${styles.itemHover}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NavSingle({ href, label, color }: { href: string; label: string; color: NavColor }) {
  const styles = COLOR_STYLES[color];
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors ${styles.hoverText}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
      {label}
    </Link>
  );
}

function PlainLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
    >
      {label}
    </Link>
  );
}

export function TopNav({
  isManager,
  isPureSuperAdmin,
  isSuperAdmin,
  myRole,
}: {
  isManager: boolean;
  isPureSuperAdmin: boolean;
  isSuperAdmin: boolean;
  myRole: MemberRole | null;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenKey(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showFallbackComms =
    !!myRole && myRole !== "client" && !isManager && !isPureSuperAdmin;

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1">
      <Link href="/app" className="mr-2 shrink-0 text-sm font-semibold text-gray-900">
        People Onboarding RD
      </Link>

      {isManager && (
        <>
          {GROUPS.map((group) => (
            <NavDropdown key={group.key} group={group} openKey={openKey} setOpenKey={setOpenKey} />
          ))}
          <NavSingle href="/app/documentos" label="Documentos" color="amber" />
          <NavSingle href="/app/portal-cliente/gestionar" label="Portal del cliente" color="teal" />
        </>
      )}

      {isManager && <div className="mx-1 h-5 w-px shrink-0 bg-gray-200" aria-hidden="true" />}

      {myRole === "account_admin" && (
        <NavSingle href="/app/facturacion" label="Facturación" color="violet" />
      )}

      {isSuperAdmin && <PlainLink href="/app/superadmin" label="Super Admin" />}

      {showFallbackComms && (
        <>
          <PlainLink href="/app/comunicacion" label="Comunicación" />
          <PlainLink href="/app/encuestas" label="Encuestas" />
        </>
      )}

      {!isPureSuperAdmin &&
        (myRole === "client" ? (
          <PlainLink href="/app/portal-cliente" label="Portal del cliente" />
        ) : (
          <PlainLink href="/app/mi-espacio" label="Mi espacio" />
        ))}

      <PlainLink href="/app/seguridad" label="Seguridad" />
    </div>
  );
}
