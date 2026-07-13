import { redirect } from "next/navigation";
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

function getClientName(profile) {
  return profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
}

async function getOrders(ids) {
  const supabase = createAdminSupabaseClient();
  if (!supabase || !ids.length) return [];

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, user_id, customer_email, status, total_amount, currency, created_at, paid_at, stripe_checkout_session_id, order_items(product_name, product_category, variant_model, variant_size, quantity, unit_price, contest_entries)")
    .in("id", ids);

  const userIds = [...new Set((orders || []).map((order) => order.user_id).filter(Boolean))];
  let profileById = new Map();

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, full_name, phone, address")
      .in("id", userIds);
    profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }

  return ids
    .map((id) => (orders || []).find((order) => order.id === id))
    .filter(Boolean)
    .map((order) => ({ ...order, profile: profileById.get(order.user_id) || null }));
}

function InvoiceSheet({ order }) {
  const items = order.order_items || [];
  const products = items.filter((item) => item.product_category !== "shipping");
  const shipping = items.find((item) => item.product_category === "shipping");
  const subtotal = products.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 1), 0);
  const invoiceNumber = `FAC-${order.order_number}`;

  return (
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
          {getClientName(order.profile) && <p>{getClientName(order.profile)}</p>}
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
  );
}

export default async function BatchInvoicePage({ searchParams }) {
  if (!(await isAdminSession())) {
    redirect("/admin?error=1");
  }

  const params = await searchParams;
  const ids = String(params?.ids || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);
  const orders = await getOrders(ids);

  return (
    <main className="invoice-page">
      <div className="invoice-toolbar">
        <a href="/admin?view=invoices">Retour factures</a>
        <PrintButton />
      </div>
      {orders.length ? orders.map((order) => (
        <InvoiceSheet order={order} key={order.id} />
      )) : (
        <section className="invoice-sheet">
          <h1>Aucune facture selectionnee</h1>
        </section>
      )}
    </main>
  );
}
