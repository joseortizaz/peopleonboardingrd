/**
 * Reconoce enlaces de YouTube y Vimeo para incrustarlos como video; para
 * cualquier otro enlace de "material adjunto" (contenido propio del curso
 * en Capacitación), la UI simplemente muestra un enlace "Ver video".
 */
export function getVideoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const shortsMatch = u.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      return null;
    }

    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === "vimeo.com") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }

    return null;
  } catch {
    return null;
  }
}
