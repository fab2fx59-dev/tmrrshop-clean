import { NextResponse } from "next/server";
import { createAdminSupabaseClient, isAdminSession } from "../utils";

export const dynamic = "force-dynamic";

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.redirect(new URL("/admin?error=1", process.env.NEXT_PUBLIC_SITE_URL || "https://tmrr.shop"));
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return new NextResponse("Configuration Supabase admin manquante.", { status: 500 });
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select("order_number, customer_email, status, total_amount, currency, created_at, paid_at, stripe_checkout_session_id, order_items(product_name, product_category, variant_model, variant_size, quantity, unit_price, contest_entries)")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  const rows = [
    ["Commande", "Email", "Statut", "Total", "Devise", "Date", "Payee le", "Articles", "Participations", "Stripe session"]
  ];

  for (const order of orders || []) {
    const items = order.order_items || [];
    const articleSummary = items
      .filter((item) => item.product_category !== "shipping")
      .map((item) => `${item.quantity}x ${item.product_name}${item.variant_size ? ` taille ${item.variant_size}` : ""}${item.variant_model ? ` modele ${item.variant_model}` : ""}`)
      .join(" | ");
    const entries = items.reduce((sum, item) => sum + Number(item.contest_entries || 0), 0);

    rows.push([
      order.order_number,
      order.customer_email,
      order.status,
      Number(order.total_amount || 0).toFixed(2),
      order.currency || "EUR",
      order.created_at,
      order.paid_at || "",
      articleSummary,
      String(entries),
      order.stripe_checkout_session_id || ""
    ]);
  }

  const csv = rows.map((row) => row.map(csvValue).join(";")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tmrr-commandes-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
