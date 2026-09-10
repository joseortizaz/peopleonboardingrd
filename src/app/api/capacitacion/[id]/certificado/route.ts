import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Certificado de capacitacion v1: se genera al vuelo (sin PDF
// almacenado) a partir de una inscripcion ya completada. No requiere
// tabla ni migracion nueva -- solo lee training_enrollments, cuya RLS
// (0018_capacitacion.sql) ya permite ver la inscripcion tanto a la
// gestion del tenant como al propio empleado dueno, igual que el
// patron de /api/documentos/[id]. El "codigo de verificacion" es un
// hash corto y determinista (id + fecha de finalizacion), no un
// registro nuevo -- suficiente para v1 sin depender de un proveedor
// externo de firma/certificacion.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("training_enrollments")
    .select(
      "id, status, completed_at, tenant_id, employees(full_name), training_courses(name, category, duration_hours, counts_toward_infotep)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!enrollment) {
    return NextResponse.json(
      { error: "Inscripción no encontrada" },
      { status: 404 }
    );
  }

  if (enrollment.status !== "completada" || !enrollment.completed_at) {
    return NextResponse.json(
      { error: "Este curso todavía no ha sido completado" },
      { status: 400 }
    );
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", enrollment.tenant_id)
    .maybeSingle();

  const employee = enrollment.employees as unknown as {
    full_name: string;
  } | null;
  const course = enrollment.training_courses as unknown as {
    name: string;
    category: string | null;
    duration_hours: number;
    counts_toward_infotep: boolean;
  } | null;

  const completedDate = new Date(enrollment.completed_at).toLocaleDateString(
    "es-DO",
    { year: "numeric", month: "long", day: "numeric" }
  );

  const verificationCode = createHash("sha256")
    .update(`${enrollment.id}|${enrollment.completed_at}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([841.89, 595.28]); // A4 horizontal
  const { width, height } = page.getSize();

  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: rgb(0.09, 0.09, 0.09),
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 34,
    y: 34,
    width: width - 68,
    height: height - 68,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  });

  function centerText(
    text: string,
    y: number,
    font = fontRegular,
    size = 12,
    color = rgb(0.2, 0.2, 0.2)
  ) {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
  }

  centerText(
    (tenant?.name ?? "").toUpperCase(),
    height - 90,
    fontBold,
    13,
    rgb(0.45, 0.45, 0.45)
  );
  centerText(
    "CERTIFICADO DE CAPACITACIÓN",
    height - 150,
    fontBold,
    28,
    rgb(0.05, 0.05, 0.05)
  );
  centerText("Se otorga el presente certificado a", height - 200, fontRegular, 13);
  centerText(
    employee?.full_name ?? "—",
    height - 240,
    fontBold,
    24,
    rgb(0.05, 0.05, 0.05)
  );
  centerText(
    "por haber completado satisfactoriamente el curso",
    height - 278,
    fontRegular,
    13
  );
  centerText(`"${course?.name ?? "—"}"`, height - 310, fontBold, 18);

  const detailsLine = [
    course?.category ?? null,
    course?.duration_hours ? `${course.duration_hours} hora(s)` : null,
    course?.counts_toward_infotep ? "cuenta para INFOTEP" : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (detailsLine) {
    centerText(detailsLine, height - 335, fontRegular, 11, rgb(0.4, 0.4, 0.4));
  }

  centerText(`Fecha de finalización: ${completedDate}`, height - 372, fontRegular, 12);

  centerText(
    "Certificado generado electrónicamente por el sistema de gestión de RR.HH. — no reemplaza",
    92,
    fontItalic,
    9,
    rgb(0.5, 0.5, 0.5)
  );
  centerText(
    "una certificación de INFOTEP ni de un proveedor externo de capacitación.",
    78,
    fontItalic,
    9,
    rgb(0.5, 0.5, 0.5)
  );
  centerText(
    `Código de verificación: ${verificationCode}`,
    58,
    fontRegular,
    9,
    rgb(0.5, 0.5, 0.5)
  );

  const bytes = await pdf.save();
  const safeCourseName = (course?.name ?? "curso").replace(/[^a-zA-Z0-9-_]+/g, "_");

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificado-${safeCourseName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
