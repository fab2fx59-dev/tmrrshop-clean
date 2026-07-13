import { notFound, redirect } from "next/navigation";
import { createAdminSupabaseClient, isAdminSession } from "../../utils";
import PrintButton from "../print-button";

export const dynamic = "force-dynamic";

function formatPrice(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} EUR`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

async function getOrder(id) {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("orders")
    .select("id, order_number, user_id, customer_email, status, total_amount, currency, created_at, paid_at, stripe_checkout_session_id, order_items(product_name, product_category, variant_model, variant_size, quantity, unit_price, contest_entries)")
    .eq("id", id)
    .maybeSingle();

  if (!data?.user_id) return data || null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, full_name, phone, address")
    .eq("id", data.user_id)
    .maybeSingle();

  return { ...data, profile: profile || null };
}

export default async function InvoicePage({ params }) {
  if (!(await isAdminSession())) {
    redirect("/admin?error=1");
  }

  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const items = order.order_items || [];
  const products = items.filter((item) => item.product_category !== "shipping");
  const shipping = items.find((item) => item.product_category === "shipping");
  const subtotal = products.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 1), 0);
  const invoiceNumber = `FAC-${order.order_number}`;

  return (
    <main className="invoice-page">
      <div className="invoice-toolbar">
        <a href={`/admin?order=${order.id}`}>Retour admin</a>
        <PrintButton />
      </div>

      <section className="invoice-sheet">
        <header className="invoice-header">
          <div>
            <strong>TMRR</strong>
            <span>No Rules. Just Ride.</span>
          </div>
          <div>
            <h1>Facture</h1>
            <p>{invoiceNumber}</p>
          </div>
        </header>

        <div className="invoice-grid">
          <section>
            <h2>Vendeur</h2>
            <p>TMRR</p>
            <p>29 Rue Tronchet</p>
            <p>75008 Paris, France</p>
          </section>
          <section>
            <h2>Client</h2>
            {(order.profile?.full_name || order.profile?.first_name || order.profile?.last_name) && (
              <p>{order.profile?.full_name || `${order.profile?.first_name || ""} ${order.profile?.last_name || ""}`.trim()}</p>
            )}
            <p>{order.customer_email}</p>
            {order.profile?.phone && <p>{order.profile.phone}</p>}
            {order.profile?.address && <p>{order.profile.address}</p>}
            <p>Commande {order.order_number}</p>
            <p>Date : {formatDate(order.paid_at || order.created_at)}</p>
          </section>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Article</th>
              <th>Variante</th>
              <th>Quantite</th>
              <th>PU</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {products.map((item, index) => (
              <tr key={`${item.product_name}-${index}`}>
                <td>{item.product_name}</td>
                <td>{[item.variant_size && `Taille ${item.variant_size}`, item.variant_model && `Modele ${item.variant_model}`].filter(Boolean).join(" - ") || "-"}</td>
                <td>{item.quantity}</td>
                <td>{formatPrice(item.unit_price)}</td>
                <td>{formatPrice(Number(item.unit_price || 0) * Number(item.quantity || 1))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-totals">
          <p><span>Sous-total</span><strong>{formatPrice(subtotal)}</strong></p>
          <p><span>Livraison</span><strong>{shipping ? formatPrice(shipping.unit_price) : "Offerte"}</strong></p>
          <p className="invoice-grand-total"><span>Total</span><strong>{formatPrice(order.total_amount)}</strong></p>
        </div>

        <footer className="invoice-footer">
          <p>Paiement securise par Stripe. Facture generee depuis l'admin TMRR.</p>
          <p>{order.stripe_checkout_session_id || ""}</p>
        </footer>
      </section>
    </main>
  );
}
