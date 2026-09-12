"use client";

import { useEffect, useState } from "react";

const WHATSAPP_URL =
  "https://wa.me/18293748878?text=" +
  encodeURIComponent("Hola, quisiera más información sobre People Onboarding RD.");

export default function WhatsAppFloatingButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 250);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribir por WhatsApp"
      className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-all duration-300 hover:bg-[#20bd5a] ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <svg
        viewBox="0 0 32 32"
        width="28"
        height="28"
        fill="white"
        aria-hidden="true"
      >
        <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.386.699 4.61 1.902 6.481L4 29l7.72-1.868A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.818a9.77 9.77 0 0 1-4.98-1.362l-.357-.212-4.583 1.109 1.127-4.464-.233-.367A9.744 9.744 0 0 1 5.182 15c0-5.968 4.854-10.818 10.822-10.818S26.826 9.032 26.826 15 21.972 24.818 16.004 24.818Zm5.61-7.318c-.307-.154-1.816-.897-2.098-1-.281-.103-.486-.154-.69.154-.204.307-.792 1-.972 1.205-.179.204-.358.23-.665.077-.307-.154-1.296-.478-2.469-1.523-.913-.814-1.53-1.82-1.709-2.128-.179-.307-.019-.473.135-.626.138-.138.307-.358.46-.537.154-.18.204-.307.307-.512.102-.204.051-.384-.026-.537-.077-.154-.69-1.663-.945-2.278-.249-.598-.502-.517-.69-.527l-.588-.01c-.204 0-.537.077-.818.384-.281.307-1.073 1.05-1.073 2.559 0 1.51 1.098 2.968 1.251 3.172.154.204 2.163 3.303 5.24 4.632.732.316 1.303.505 1.749.646.735.234 1.404.201 1.933.122.59-.088 1.816-.743 2.072-1.46.256-.717.256-1.332.179-1.46-.077-.128-.281-.205-.588-.36Z" />
      </svg>
    </a>
  );
}
