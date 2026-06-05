"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase/server";

export async function signUp(formData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const firstName = String(formData.get("first_name") || "").trim();
  const lastName = String(formData.get("last_name") || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const phone = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        phone,
        address
      }
    }
  });

  if (error) {
    redirect(`/compte?message=${encodeURIComponent(error.message)}`);
  }

  if (data.user) {
    await supabase.from("profiles").upsert({
      id: data.user.id,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      phone,
      address
    });
  }

  redirect("/compte?message=Compte cree. Tu peux maintenant te connecter.");
}

export async function signIn(formData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(`/compte?message=${encodeURIComponent(error.message)}`);
  }

  redirect("/compte");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
