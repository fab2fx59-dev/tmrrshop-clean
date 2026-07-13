"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, ORDER_STATUSES, createAdminSupabaseClient, getAdminPassword, getAdminToken, isAdminSession } from "./utils";

export async function adminLogin(formData) {
  const password = String(formData.get("password") || "");
  const expected = getAdminPassword();

  if (!expected || password !== expected) {
    redirect("/admin?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, getAdminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/admin"
  });

  redirect("/admin");
}

export async function adminLogout() {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/admin"
  });
  redirect("/admin");
}

export async function updateOrderStatus(formData) {
  if (!(await isAdminSession())) {
    redirect("/admin?error=1");
  }

  const orderId = String(formData.get("order_id") || "");
  const status = String(formData.get("status") || "");
  const redirectTo = String(formData.get("redirect_to") || "/admin");

  if (!orderId || !ORDER_STATUSES.has(status)) {
    redirect(redirectTo);
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}error=config`);
  }

  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (error) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}error=update`);
  }

  revalidatePath("/admin");
  redirect(redirectTo);
}

export async function updateOrderManagement(formData) {
  if (!(await isAdminSession())) {
    redirect("/admin?error=1");
  }

  const orderId = String(formData.get("order_id") || "");
  const status = String(formData.get("status") || "");
  const trackingNumber = String(formData.get("tracking_number") || "").trim();
  const adminNotes = String(formData.get("admin_notes") || "").trim();
  const redirectTo = String(formData.get("redirect_to") || "/admin");

  if (!orderId || !ORDER_STATUSES.has(status)) {
    redirect(redirectTo);
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}error=config`);
  }

  const extendedUpdate = {
    status,
    tracking_number: trackingNumber || null,
    admin_notes: adminNotes || null
  };

  if (status === "shipped") {
    extendedUpdate.shipped_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("orders")
    .update(extendedUpdate)
    .eq("id", orderId);

  if (error) {
    await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId);
  }

  revalidatePath("/admin");
  redirect(redirectTo);
}
