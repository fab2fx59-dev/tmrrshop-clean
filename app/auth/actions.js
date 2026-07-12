"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../lib/supabase/server";

async function getSafeRedirect(formData) {
  const directRedirect = String(formData.get("redirect_to") || "").trim();
  let refererRedirect = "";

  try {
    const referer = (await headers()).get("referer");
    if (referer) {
      refererRedirect = new URL(referer).searchParams.get("redirect") || "";
    }
  } catch {
    refererRedirect = "";
  }

  const redirectTo = refererRedirect || directRedirect || "/compte";

  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/compte";
  }

  return redirectTo;
}

function addMessage(path, message) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}message=${encodeURIComponent(message)}`;
}

function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function signUp(formData) {
  const supabase = await createSupabaseServerClient();
  const redirectTo = await getSafeRedirect(formData);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const firstName = String(formData.get("first_name") || "").trim();
  const lastName = String(formData.get("last_name") || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const phone = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim();

  const profile = {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    phone,
    address
  };
  const adminSupabase = createAdminClient();

  if (adminSupabase) {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: profile
    });

    if (error) {
      const message = error.message?.toLowerCase().includes("already")
        ? "Ce compte existe deja. Connecte-toi avec ton e-mail et ton mot de passe."
        : error.message;

      redirect(addMessage(`/compte?redirect=${encodeURIComponent(redirectTo)}`, message));
    }

    if (data.user) {
      await adminSupabase.from("profiles").upsert({
        id: data.user.id,
        ...profile
      });

      await adminSupabase.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
        user_metadata: profile
      });

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (!signInError) {
        redirect(redirectTo);
      }

      redirect(addMessage(`/compte?redirect=${encodeURIComponent(redirectTo)}`, signInError.message));
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: profile
    }
  });

  if (error) {
    redirect(addMessage(`/compte?redirect=${encodeURIComponent(redirectTo)}`, error.message));
  }

  if (data.user) {
    await supabase.from("profiles").upsert({
      id: data.user.id,
      ...profile
    });
  }

  if (data.session) {
    redirect(redirectTo);
  }

  redirect(addMessage(
    `/compte?redirect=${encodeURIComponent(redirectTo)}`,
    "Compte cree. Si la connexion ne passe pas encore, verifie l'e-mail de confirmation."
  ));
}

export async function signIn(formData) {
  const supabase = await createSupabaseServerClient();
  const redirectTo = await getSafeRedirect(formData);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(addMessage(`/compte?redirect=${encodeURIComponent(redirectTo)}`, error.message));
  }

  redirect(redirectTo);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
