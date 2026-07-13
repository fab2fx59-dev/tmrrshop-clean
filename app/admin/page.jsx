import { adminLogin, adminLogout, updateOrderManagement } from "./actions";
import { createAdminSupabaseClient, isAdminConfigured, isAdminSession } from "./utils";

export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  pending: "En attente",
  paid: "Payee",
  preparing: "A preparer",
  shipped: "Expediee",
  delivered: "Livree",
  cancelled: "Annulee",
  refunded: "Remboursee"
};

const STATUS_OPTIONS = [
  ["pending", "En attente"],
  ["paid", "Payee"],
  ["preparing", "A preparer"],
  ["shipped", "Expediee"],
  ["delivered", "Livree"],
  ["cancelled", "Annulee"],
  ["refunded", "Remboursee"]
];

function formatPrice(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} EUR`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getItems(order) {
  return order.order_items || [];
}

function getProductItems(order) {
  return getItems(order).filter((item) => item.product_category !== "shipping");
}

function getEntries(order) {
  return getItems(order).reduce((sum, item) => sum + Number(item.contest_entries || 0), 0);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function orderMatches(order, query) {
  if (!query) return true;
  const haystack = normalizeText([
    order.order_number,
    order.customer_email,
    order.profile?.full_name,
    order.profile?.first_name,
    order.profile?.last_name,
    order.profile?.phone,
    order.profile?.address,
    ...getItems(order).flatMap((item) => [item.product_name, item.variant_model, item.variant_size])
  ].filter(Boolean).join(" "));

  return haystack.includes(normalizeText(query));
}

async function fetchOrders() {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return { orders: [], configError: true };

  const itemSelect = "order_items(id, product_name, product_category, variant_model, variant_size, quantity, unit_price, contest_entries)";
  const extendedSelect = `id, order_number, user_id, customer_email, status, total_amount, currency, stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at, admin_notes, tracking_number, shipped_at, ${itemSelect}`;
  const baseSelect = `id, order_number, user_id, customer_email, status, total_amount, currency, stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at, ${itemSelect}`;

  let { data: orders, error } = await supabase
    .from("orders")
    .select(extendedSelect)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    const fallback = await supabase
      .from("orders")
      .select(baseSelect)
      .order("created_at", { ascending: false })
      .limit(200);
    orders = fallback.data || [];
    error = fallback.error;
  }

  if (error) return { orders: [], dataError: error.message };

  const userIds = [...new Set((orders || []).map((order) => order.user_id).filter(Boolean))];
  let profileById = new Map();

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, full_name, phone, address")
      .in("id", userIds);
    profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }

  return {
    orders: (orders || []).map((order) => ({
      ...order,
      profile: profileById.get(order.user_id) || null
    }))
  };
}

function LoginScreen({ error }) {
  return (
    <main className="admin-login-screen">
      <section className="admin-login-card">
        <div>
          <p className="admin-kicker">TMRR Admin</p>
          <h1>Acces CRM</h1>
          <p>Connecte-toi pour gerer les commandes, les clients, les factures et le concours.</p>
        </div>
        {!isAdminConfigured() && (
          <p className="admin-alert">Mot de passe admin non configure dans Vercel.</p>
        )}
        {error && <p className="admin-alert">Mot de passe incorrect.</p>}
        <form action={adminLogin} className="admin-login-form">
          <label>
            Mot de passe admin
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Entrer dans l'admin</button>
        </form>
      </section>
    </main>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function StatusBadge({ status }) {
  return <span className={`admin-status admin-status-${status || "pending"}`}>{STATUS_LABELS[status] || status || "En attente"}</span>;
}

function OrderRows({ orders, selectedId, searchParams }) {
  if (!orders.length) {
    return (
      <div className="admin-empty">
        <strong>Aucune commande</strong>
        <span>Aucun resultat pour ces filtres.</span>
      </div>
    );
  }

  return orders.map((order) => {
    const params = new URLSearchParams(searchParams);
    params.set("order", order.id);
    const products = getProductItems(order);
    const mainProduct = products[0]?.product_name || "Commande TMRR";

    return (
      <a className={`admin-order-row ${selectedId === order.id ? "is-selected" : ""}`} href={`/admin?${params.toString()}`} key={order.id}>
        <span>
          <strong>{order.order_number}</strong>
          <small>{formatDate(order.created_at)}</small>
        </span>
        <span>
          <strong>{order.customer_email}</strong>
          <small>{order.profile?.phone || "Telephone non renseigne"}</small>
        </span>
        <span>
          <strong>{mainProduct}</strong>
          <small>{products.length > 1 ? `${products.length} articles` : "1 article"}</small>
        </span>
        <span>{formatPrice(order.total_amount)}</span>
        <span><StatusBadge status={order.status} /></span>
        <span>{getEntries(order)} participation{getEntries(order) > 1 ? "s" : ""}</span>
      </a>
    );
  });
}

function OrderDetail({ order, currentPath }) {
  if (!order) {
    return (
      <aside className="admin-detail-panel">
        <div className="admin-empty">
          <strong>Selectionne une commande</strong>
          <span>Le detail apparaitra ici.</span>
        </div>
      </aside>
    );
  }

  const products = getProductItems(order);
  const shipping = getItems(order).find((item) => item.product_category === "shipping");
  const stripeUrl = order.stripe_checkout_session_id
    ? `https://dashboard.stripe.com/search?query=${encodeURIComponent(order.stripe_checkout_session_id)}`
    : "";

  return (
    <aside className="admin-detail-panel">
      <div className="admin-detail-head">
        <div>
          <p className="admin-kicker">Commande</p>
          <h2>{order.order_number}</h2>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <section className="admin-detail-section">
        <h3>Client</h3>
        <p><strong>{order.customer_email}</strong></p>
        <p>{order.profile?.phone || "Telephone non renseigne"}</p>
        <p>{order.profile?.address || "Adresse non renseignee"}</p>
      </section>

      <section className="admin-detail-section">
        <h3>Articles</h3>
        <div className="admin-detail-lines">
          {products.map((item) => (
            <div className="admin-detail-line" key={item.id || `${item.product_name}-${item.variant_size}`}>
              <span>
                <strong>{item.product_name}</strong>
                <small>
                  {[item.variant_size && `Taille ${item.variant_size}`, item.variant_model && `Modele ${item.variant_model}`].filter(Boolean).join(" - ") || "Sans variante"}
                </small>
                {Number(item.contest_entries || 0) > 0 && <small>{item.contest_entries} participation{Number(item.contest_entries) > 1 ? "s" : ""} concours</small>}
              </span>
              <span>
                <small>Quantite : {item.quantity}</small>
                <strong>{formatPrice(Number(item.unit_price || 0) * Number(item.quantity || 1))}</strong>
              </span>
            </div>
          ))}
        </div>
        <div className="admin-total-line">
          <span>Livraison</span>
          <strong>{shipping ? formatPrice(shipping.unit_price) : "Offerte"}</strong>
        </div>
        <div className="admin-total-line is-grand">
          <span>Total</span>
          <strong>{formatPrice(order.total_amount)}</strong>
        </div>
      </section>

      <section className="admin-detail-section">
        <h3>Paiement</h3>
        <p>{order.paid_at ? `Paye le ${formatDate(order.paid_at)}` : "Paiement en attente ou abandonne"}</p>
        {stripeUrl && <a className="admin-link" href={stripeUrl} target="_blank" rel="noreferrer">Ouvrir dans Stripe</a>}
      </section>

      <form className="admin-management-form" action={updateOrderManagement}>
        <input type="hidden" name="order_id" value={order.id} />
        <input type="hidden" name="redirect_to" value={currentPath} />
        <label>
          Statut de commande
          <select name="status" defaultValue={order.status || "pending"}>
            {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Numero de suivi
          <input name="tracking_number" defaultValue={order.tracking_number || ""} placeholder="Ex: 6A1234567890" />
        </label>
        <label>
          Notes internes
          <textarea name="admin_notes" defaultValue={order.admin_notes || ""} placeholder="Ajoute une note interne sur cette commande..." rows={4}></textarea>
        </label>
        <button className="admin-primary-button" type="submit">Enregistrer</button>
      </form>

      <div className="admin-detail-actions">
        <a className="admin-secondary-button" href={`/admin/invoices/${order.id}`} target="_blank" rel="noreferrer">Creer facture PDF</a>
        <a className="admin-secondary-button" href={`/admin?q=${encodeURIComponent(order.customer_email)}`}>Voir client</a>
      </div>
    </aside>
  );
}

export default async function AdminPage({ searchParams }) {
  const params = await searchParams;
  const logged = await isAdminSession();

  if (!logged) {
    return <LoginScreen error={params?.error === "1"} />;
  }

  const query = String(params?.q || "").trim();
  const status = String(params?.status || "all");
  const selectedId = String(params?.order || "");
  const { orders, configError, dataError } = await fetchOrders();
  const filteredOrders = orders.filter((order) => {
    const statusMatches = status === "all" || order.status === status;
    return statusMatches && orderMatches(order, query);
  });
  const selectedOrder = filteredOrders.find((order) => order.id === selectedId) || filteredOrders[0] || null;
  const paidOrders = orders.filter((order) => order.status === "paid" || order.paid_at);
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const preparing = orders.filter((order) => ["paid", "preparing"].includes(order.status)).length;
  const entries = orders.reduce((sum, order) => sum + getEntries(order), 0);
  const customerCount = new Set(orders.map((order) => order.customer_email).filter(Boolean)).size;
  const currentPath = `/admin?${new URLSearchParams({
    ...(query ? { q: query } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(selectedOrder ? { order: selectedOrder.id } : {})
  }).toString()}`;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <strong>TMRR</strong>
          <span>ADMIN</span>
        </div>
        <nav>
          <a className="is-active" href="/admin">Commandes</a>
          <a href="/admin#clients">Clients</a>
          <a href="/admin#factures">Factures</a>
          <a href="/admin#concours">Concours</a>
        </nav>
        <form action={adminLogout}>
          <button type="submit">Deconnexion</button>
        </form>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="admin-kicker">Gestion boutique TMRR</p>
            <h1>Commandes & clients</h1>
          </div>
          <a className="admin-secondary-button" href="/admin/export">Export CSV</a>
        </header>

        {(configError || dataError || params?.error) && (
          <p className="admin-alert">
            {configError ? "Configuration Supabase admin manquante." : dataError || "Une action n'a pas pu etre terminee."}
          </p>
        )}

        <form className="admin-filters" action="/admin">
          <input name="q" defaultValue={query} placeholder="Rechercher email, nom, commande..." />
          <select name="status" defaultValue={status}>
            <option value="all">Tous les statuts</option>
            {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <button type="submit">Filtrer</button>
        </form>

        <div className="admin-metrics">
          <MetricCard label="CA paye" value={formatPrice(revenue)} hint="Commandes payees" />
          <MetricCard label="Commandes" value={orders.length} hint={`${customerCount} client${customerCount > 1 ? "s" : ""}`} />
          <MetricCard label="A preparer" value={preparing} hint="Payees ou en preparation" />
          <MetricCard label="Participations" value={entries} hint="Concours total" />
        </div>

        <div className="admin-workspace">
          <section className="admin-table-card">
            <div className="admin-table-head">
              <span>Commande</span>
              <span>Client</span>
              <span>Articles</span>
              <span>Total</span>
              <span>Statut</span>
              <span>Concours</span>
            </div>
            <OrderRows orders={filteredOrders} selectedId={selectedOrder?.id} searchParams={params || {}} />
          </section>

          <OrderDetail order={selectedOrder} currentPath={currentPath} />
        </div>
      </section>
    </main>
  );
}
