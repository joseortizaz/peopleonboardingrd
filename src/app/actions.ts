"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function sendContactMessage(formData: FormData) {
  const supabase = await createClient();

  const full_name = (formData.get("full_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const company = (formData.get("company") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const message = (formData.get("message") as string)?.trim();

  if (!full_name || !email || !message) {
    redirect(
      "/?contactoError=Nombre%2C+correo+y+mensaje+son+obligatorios#contacto"
    );
  }

  const { error } = await supabase.from("contact_messages").insert({
    full_name,
    email,
    company,
    phone,
    message,
  });

  if (error) {
    console.error("sendContactMessage error:", error.message);
    redirect(`/?contactoError=${encodeURIComponent(error.message)}#contacto`);
  }

  redirect("/?contactoOk=1#contacto");
}
