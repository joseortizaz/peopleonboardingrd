import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <h1 className="text-3xl font-semibold text-gray-900">
        People Onboarding RD
      </h1>
      <p className="mt-3 max-w-md text-gray-500">
        Suite de gestión humana para empresas dominicanas y firmas de
        outsourcing de RR.HH.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Link
          href="/login"
          className="rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
        >
          Acceso
        </Link>
        <Link
          href="/precios"
          className="rounded-md border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Ver planes
        </Link>
      </div>
    </div>
  );
}
