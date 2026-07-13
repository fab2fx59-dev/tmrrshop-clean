import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const ADMIN_COOKIE = "tmrr_admin_access";
export const ORDER_STATUSES = new Set(["pending", "paid", "preparing", "shipped", "delivered", "cancelled", "refunded"]);

export function getAdminPassword() {
  return String(process.env.ADMIN_DASHBOARD_PASSWORD || "").trim();
}

export function isAdminConfigured() {
  return Boolean(getAdminPassword());
}

export function getAdminToken() {
  const password = getAdminPassword();
  if (!password) return "";
  return crypto.createHash("sha256").update(`tmrr-admin:${password}`).digest("hex");
}

export async function isAdminSession() {
  const cookieStore = await cookies();
  return Boolean(getAdminToken() && cookieStore.get(ADMIN_COOKIE)?.value === getAdminToken());
}

export function createAdminSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
