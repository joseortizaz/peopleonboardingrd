import Link from "next/link";
import { sendContactMessage } from "./actions";
import WhatsAppFloatingButton from "./WhatsAppFloatingButton";

const WHATSAPP_URL =
  "https://wa.me/18293748878?text=" +
  encodeURIComponent("Hola, quisiera más información sobre People Onboarding RD.");
const CONTACT_EMAIL = "info@narniats.com";
const WHATSAPP_DISPLAY = "+1 (829) 374-8878";

type Dot = "indigo" | "emerald" | "amber" | "rose" | "sky" | "teal" | "violet";

// Mismos colores que usa el dashboard real (TopNav.tsx / app/app/page.tsx),
// para que la landing se sienta como una vitrina fiel del producto y no
// como una plantilla genérica. Clases escritas literalmente para que
// Tailwind las detecte en el build.
const DOT: Record<Dot, string> = {
  indigo: "bg-indigo-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  sky: "bg-sky-400",
  teal: "bg-teal-400",
  violet: "bg-violet-400",
};

const BORDER: Record<Dot, string> = {
  indigo: "border-t-indigo-400",
  emerald: "border-t-emerald-400",
  amber: "border-t-amber-400",
  rose: "border-t-rose-400",
  sky: "border-t-sky-400",
  teal: "border-t-teal-400",
  violet: "border-t-violet-400",
};

const MODULE_GROUPS: {
  title: string;
  accent: Dot;
  modules: { name: string; description: string }[];
}[] = [
  {
    title: "Talento y ciclo de vida",
    accent: "indigo",
    modules: [
      { name: "Reclutamiento (ATS)", description: "Vacantes, candidatos y pipeline de selección." },
      { name: "Incorporación", description: "Plan de incorporación 30-60-90 para cada nuevo ingreso." },
      { name: "Estructura organizacional", description: "Departamentos y jerarquía de tu empresa." },
      { name: "Empleados", description: "Registro base de colaboradores y autoservicio." },
      { name: "Bajas", description: "Checklist de salida y cálculo de referencia de liquidación." },
    ],
  },
  {
    title: "Nómina y compensación",
    accent: "emerald",
    modules: [
      { name: "Nómina", description: "Periodos de nómina con SFS, AFP, INFOTEP e ISR de referencia." },
      { name: "Beneficios", description: "Catálogo, asignación y auto-inscripción del empleado." },
      { name: "Asistencia", description: "Horarios, marcaje web y geolocalización con foto." },
      { name: "Permisos", description: "Solicitudes de vacaciones y permisos por aprobar." },
    ],
  },
  {
    title: "Desempeño y desarrollo",
    accent: "rose",
    modules: [
      { name: "Evaluación de desempeño", description: "Plantillas de competencias y evaluaciones 90°/180°/360°." },
      { name: "Capacitación", description: "Catálogo de cursos, inscripciones y horas INFOTEP." },
    ],
  },
  {
    title: "Cultura y analítica",
    accent: "sky",
    modules: [
      { name: "Comunicación", description: "Tablón de anuncios y reconocimientos entre compañeros." },
      { name: "Encuestas", description: "Clima laboral con respuestas anónimas." },
      { name: "People analytics", description: "Rotación de personal y costo de nómina por periodo." },
    ],
  },
  {
    title: "Documentos y multi-empresa",
    accent: "amber",
    modules: [
      { name: "Documentos", description: "Expediente digital con firma electrónica y vencimientos." },
      { name: "Portal del cliente", description: "Vista de solo lectura para tu cliente de outsourcing." },
      { name: "Facturación", description: "Plan activo, historial y estado de pago." },
    ],
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ contactoOk?: string; contactoError?: string }>;
}) {
  const query = await searchParams;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">
            People Onboarding RD
          </span>
          <nav className="hidden items-center gap-7 text-sm text-gray-600 md:flex">
            <a href="#areas" className="hover:text-gray-900">
              Áreas
            </a>
            <a href="#caracteristicas" className="hover:text-gray-900">
              Características
            </a>
            <Link href="/precios" className="hover:text-gray-900">
              Planes
            </Link>
            <a href="#contacto" className="hover:text-gray-900">
              Contacto
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/precios"
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Ver planes
            </Link>
          </div>
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="mx-auto max-w-6xl px-6 pt-14 pb-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              Hecho para empresas y firmas de outsourcing en RD
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
              Toda la gestión de RR.HH. de tu empresa, en un solo lugar
            </h1>
            <p className="mt-5 text-lg text-gray-500">
              Reclutamiento, nómina, asistencia, beneficios, desempeño y
              documentos legales — con las reglas de la legislación laboral
              dominicana (SFS, AFP, INFOTEP) ya incorporadas.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/precios"
                className="rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
              >
                Ver planes
              </Link>
              <a
                href="#contacto"
                className="rounded-md border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hablar con nosotros
              </a>
            </div>
            <p className="mt-6 text-sm text-gray-400">
              Sin tarjeta de crédito para empezar. Activa el pago desde tu
              panel una vez creada tu cuenta.
            </p>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-dashboard.jpg"
                alt="Panel de People Onboarding RD mostrando los módulos de gestión humana"
                width={1568}
                height={709}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== Características ===== */}
      <section id="caracteristicas" className="border-t border-gray-100 bg-gray-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Cumplimiento dominicano",
                description: "SFS, AFP, INFOTEP, ISR y cálculo de liquidación de referencia integrados.",
                accent: "emerald" as Dot,
              },
              {
                title: "Multi-empresa",
                description: "Una firma de outsourcing gestiona varios clientes desde una sola cuenta.",
                accent: "indigo" as Dot,
              },
              {
                title: "Autoservicio del empleado",
                description: "Marcaje, permisos, beneficios y evaluaciones desde \"Mi espacio\".",
                accent: "sky" as Dot,
              },
              {
                title: "Roles y permisos",
                description: "Acceso granular por rol: gestor, administrador, cliente o empleado.",
                accent: "rose" as Dot,
              },
            ].map((f) => (
              <div key={f.title}>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[f.accent]}`} />
                <h3 className="mt-3 font-medium text-gray-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-gray-500">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Para empresas / Para firmas de outsourcing ===== */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              Para empresas
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-gray-900">
              Gestiona tu propio equipo de principio a fin
            </h2>
            <p className="mt-3 text-gray-500">
              Centraliza reclutamiento, expedientes, nómina y desempeño de tu
              empresa, con autoservicio para que cada empleado gestione su
              propia información desde su cuenta.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-gray-600">
              {[
                "Un espacio por empresa, con tus propios departamentos y usuarios",
                "Autoservicio de marcaje, permisos y beneficios para empleados",
                "Alertas de documentos por vencer y firma electrónica",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-gray-200 p-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
              Para firmas de outsourcing de RR.HH.
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-gray-900">
              Administra varios clientes desde una sola cuenta
            </h2>
            <p className="mt-3 text-gray-500">
              Cada cliente vive en su propio espacio, con datos separados y
              seguros, mientras tu equipo opera todos los procesos desde un
              solo panel.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-gray-600">
              {[
                "Portal de solo lectura para que tu cliente vea el avance",
                "Datos de cada empresa aislados entre sí",
                "Un mismo equipo gestor para múltiples cuentas",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== Todas las áreas ===== */}
      <section id="areas" className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold text-gray-900">
              Todas las áreas de gestión humana
            </h2>
            <p className="mt-3 text-gray-500">
              Los mismos módulos que verás en tu panel desde el primer día.
            </p>
          </div>

          <div className="mt-12 space-y-10">
            {MODULE_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                  {group.title}
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.modules.map((m) => (
                    <div
                      key={m.name}
                      className={`rounded-xl border border-gray-200 border-t-4 bg-white p-5 shadow-sm ${BORDER[group.accent]}`}
                    >
                      <h4 className="font-medium text-gray-900">{m.name}</h4>
                      <p className="mt-1 text-sm text-gray-500">{m.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-2xl bg-gray-900 px-8 py-14 text-center sm:px-16">
          <h2 className="text-3xl font-semibold text-white">
            Empieza a digitalizar tu gestión de RR.HH. hoy
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-300">
            Crea tu cuenta, elige un plan y activa los módulos que tu empresa
            necesita.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/precios"
              className="rounded-md bg-white px-6 py-3 text-sm font-medium text-gray-900 hover:bg-gray-100"
            >
              Ver planes
            </Link>
            <a
              href="#contacto"
              className="rounded-md border border-gray-600 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              Hablar con nosotros
            </a>
          </div>
        </div>
      </section>

      {/* ===== Contacto ===== */}
      <section id="contacto" className="border-t border-gray-100 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold text-gray-900">Contáctanos</h2>
              <p className="mt-3 text-gray-500">
                Cuéntanos sobre tu empresa y te ayudamos a elegir el plan
                adecuado.
              </p>

              <div className="mt-8 space-y-4 text-sm">
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="flex items-center gap-3 text-gray-700 hover:text-gray-900"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
                    ✉️
                  </span>
                  {CONTACT_EMAIL}
                </a>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-gray-700 hover:text-gray-900"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
                    💬
                  </span>
                  WhatsApp: {WHATSAPP_DISPLAY}
                </a>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              {query.contactoOk ? (
                <p className="rounded-md bg-green-50 px-3 py-3 text-sm text-green-700">
                  ¡Gracias por escribirnos! Recibimos tu mensaje y te
                  responderemos lo antes posible.
                </p>
              ) : (
                <>
                  {query.contactoError && (
                    <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                      {query.contactoError}
                    </p>
                  )}
                  <form action={sendContactMessage} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        name="full_name"
                        type="text"
                        placeholder="Nombre completo"
                        required
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                      <input
                        name="email"
                        type="email"
                        placeholder="Correo"
                        required
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        name="company"
                        type="text"
                        placeholder="Empresa (opcional)"
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                      <input
                        name="phone"
                        type="tel"
                        placeholder="Teléfono (opcional)"
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <textarea
                      name="message"
                      placeholder="¿En qué podemos ayudarte?"
                      required
                      rows={4}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      Enviar mensaje
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-gray-100 bg-gray-50 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-gray-500 sm:flex-row">
          <span>© {new Date().getFullYear()} People Onboarding RD. Todos los derechos reservados.</span>
          <div className="flex items-center gap-5">
            <Link href="/precios" className="hover:text-gray-700">
              Planes
            </Link>
            <a href="#contacto" className="hover:text-gray-700">
              Contacto
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-gray-700">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </footer>

      <WhatsAppFloatingButton />
    </div>
  );
}
