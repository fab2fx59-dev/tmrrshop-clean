import { adminLogin, adminLogout, bulkOrderAction, deleteContestParticipations, updateOrderManagement } from "./actions";
import { createAdminSupabaseClient, isAdminConfigured, isAdminSession } from "./utils";

export const dynamic = "force-dynamic";

const VIEWS = new Set(["orders", "clients", "invoices", "contest", "archives"]);

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

function fullName(profile) {
  if (!profile) return "";
  return profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
}

function adminUrl(values = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "" && value !== "all" && value !== "orders") {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return `/admin${query ? `?${query}` : ""}`;
}

function orderMatches(order, query) {
  if (!query) return true;
  const haystack = normalizeText([
    order.order_number,
    order.customer_email,
    fullName(order.profile),
    order.profile?.phone,
    order.profile?.address,
    order.tracking_number,
    ...getItems(order).flatMap((item) => [item.product_name, item.variant_model, item.variant_size])
  ].filter(Boolean).join(" "));

  return haystack.includes(normalizeText(query));
}

async function fetchOrders() {
  const supabase = createAdminSupabaseClient();
  if (!supabase) return { orders: [], configError: true };

  const itemSelect = "order_items(id, product_name, product_category, variant_model, variant_size, quantity, unit_price, contest_entries)";
  const extendedSelect = `id, order_number, user_id, customer_email, status, total_amount, currency, stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at, admin_notes, tracking_number, shipped_at, archived_at, ${itemSelect}`;
  const baseSelect = `id, order_number, user_id, customer_email, status, total_amount, currency, stripe_checkout_session_id, stripe_payment_intent_id, created_at, paid_at, ${itemSelect}`;

  let { data: orders, error } = await supabase
    .from("orders")
    .select(extendedSelect)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    const fallback = await supabase
      .from("orders")
      .select(baseSelect)
      .order("created_at", { ascending: false })
      .limit(500);
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
      archived_at: order.archived_at || null,
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

function AdminNav({ view }) {
  const items = [
    ["orders", "Commandes", "/admin"],
    ["clients", "Clients", "/admin?view=clients"],
    ["invoices", "Factures", "/admin?view=invoices"],
    ["contest", "Concours", "/admin?view=contest"],
    ["archives", "Archives", "/admin?view=archives"]
  ];

  return (
    <nav>
      {items.map(([key, label, href]) => (
        <a className={view === key ? "is-active" : ""} href={href} key={key}>{label}</a>
      ))}
    </nav>
  );
}

function BulkOrderActions({ mode = "active" }) {
  return (
    <div className="admin-bulk-actions">
      <span>Actions selection</span>
      <select name="bulk_status" defaultValue="preparing" aria-label="Nouveau statut">
        {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select>
      <button type="submit" name="bulk_action" value="status">Changer statut</button>
      <button type="submit" name="bulk_action" value="invoice">Imprimer facture</button>
      {mode === "archives" ? (
        <button type="submit" name="bulk_action" value="restore">Restaurer</button>
      ) : (
        <button type="submit" name="bulk_action" value="archive">Archiver</button>
      )}
      <button className="is-danger" type="submit" name="bulk_action" value="delete">Supprimer</button>
    </div>
  );
}

function OrdersTable({ orders, selectedId, searchParams, currentPath, mode = "active" }) {
  if (!orders.length) {
    return (
      <div className="admin-empty">
        <strong>Aucune commande</strong>
        <span>Aucun resultat pour ces filtres.</span>
      </div>
    );
  }

  return (
    <form action={bulkOrderAction} className="admin-bulk-form">
      <input type="hidden" name="redirect_to" value={currentPath} />
      <BulkOrderActions mode={mode} />
      <div className="admin-table-head admin-orders-grid">
        <span></span>
        <span>Commande</span>
        <span>Client</span>
        <span>Articles</span>
        <span>Total</span>
        <span>Statut</span>
        <span>Concours</span>
        <span></span>
      </div>
      {orders.map((order) => {
        const params = new URLSearchParams(searchParams);
        params.set("order", order.id);
        if (mode === "archives") params.set("view", "archives");
        const products = getProductItems(order);
        const mainProduct = products[0]?.product_name || "Commande TMRR";

        return (
          <div className={`admin-order-row admin-orders-grid ${selectedId === order.id ? "is-selected" : ""}`} key={order.id}>
            <label className="admin-check-cell" aria-label={`Selectionner ${order.order_number}`}>
              <input type="checkbox" name="order_ids" value={order.id} />
            </label>
            <span>
              <strong>{order.order_number}</strong>
              <small>{mode === "archives" ? `Archivee le ${formatDate(order.archived_at)}` : formatDate(order.created_at)}</small>
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
            <span><a className="admin-row-link" href={`/admin?${params.toString()}`}>Voir</a></span>
          </div>
        );
      })}
    </form>
  );
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
        {fullName(order.profile) && <p>{fullName(order.profile)}</p>}
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
        <a className="admin-secondary-button" href={`/admin/invoices/${order.id}`}>Creer facture PDF</a>
        <a className="admin-secondary-button" href={`/admin?view=clients&q=${encodeURIComponent(order.customer_email)}`}>Voir client</a>
      </div>
    </aside>
  );
}

function OrdersView({ orders, query, status, selectedId, params, mode = "active" }) {
  const filteredOrders = orders.filter((order) => {
    const statusMatches = status === "all" || order.status === status;
    return statusMatches && orderMatches(order, query);
  });
  const selectedOrder = filteredOrders.find((order) => order.id === selectedId) || filteredOrders[0] || null;
  const view = mode === "archives" ? "archives" : "orders";
  const currentPath = adminUrl({
    view,
    q: query,
    status,
    order: selectedOrder?.id
  });

  return (
    <>
      <form className="admin-filters" action="/admin">
        {view !== "orders" && <input type="hidden" name="view" value={view} />}
        <input name="q" defaultValue={query} placeholder="Rechercher email, nom, commande..." />
        <select name="status" defaultValue={status}>
          <option value="all">Tous les statuts</option>
          {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <button type="submit">Filtrer</button>
      </form>

      <div className="admin-workspace">
        <section className="admin-table-card">
          <OrdersTable orders={filteredOrders} selectedId={selectedOrder?.id} searchParams={params || {}} currentPath={currentPath} mode={mode} />
        </section>

        <OrderDetail order={selectedOrder} currentPath={currentPath} />
      </div>
    </>
  );
}

function buildClients(orders) {
  const map = new Map();

  for (const order of orders) {
    const key = order.customer_email || order.user_id || "client";
    const current = map.get(key) || {
      key,
      email: order.customer_email,
      name: fullName(order.profile),
      phone: order.profile?.phone || "",
      address: order.profile?.address || "",
      orders: 0,
      paidOrders: 0,
      total: 0,
      entries: 0,
      lastOrderAt: ""
    };

    current.orders += 1;
    current.entries += getEntries(order);
    if (order.status === "paid" || order.paid_at) {
      current.paidOrders += 1;
      current.total += Number(order.total_amount || 0);
    }
    if (!current.lastOrderAt || new Date(order.created_at) > new Date(current.lastOrderAt)) {
      current.lastOrderAt = order.created_at;
    }
    if (!current.name) current.name = fullName(order.profile);
    if (!current.phone) current.phone = order.profile?.phone || "";
    if (!current.address) current.address = order.profile?.address || "";
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => new Date(b.lastOrderAt) - new Date(a.lastOrderAt));
}

function ClientsView({ orders, query }) {
  const clients = buildClients(orders).filter((client) => {
    if (!query) return true;
    return normalizeText([client.email, client.name, client.phone, client.address].filter(Boolean).join(" ")).includes(normalizeText(query));
  });

  return (
    <>
      <form className="admin-filters admin-filters-compact" action="/admin">
        <input type="hidden" name="view" value="clients" />
        <input name="q" defaultValue={query} placeholder="Rechercher client, email, telephone..." />
        <button type="submit">Filtrer</button>
      </form>

      <section className="admin-table-card admin-wide-card">
        <div className="admin-table-head admin-clients-grid">
          <span>Client</span>
          <span>Contact</span>
          <span>Commandes</span>
          <span>Total paye</span>
          <span>Concours</span>
          <span></span>
        </div>
        {clients.length ? clients.map((client) => (
          <div className="admin-order-row admin-clients-grid" key={client.key}>
            <span>
              <strong>{client.name || "Client sans nom"}</strong>
              <small>{client.email}</small>
            </span>
            <span>
              <strong>{client.phone || "Telephone non renseigne"}</strong>
              <small>{client.address || "Adresse non renseignee"}</small>
            </span>
            <span>{client.orders} commande{client.orders > 1 ? "s" : ""}</span>
            <span>{formatPrice(client.total)}</span>
            <span>{client.entries} participation{client.entries > 1 ? "s" : ""}</span>
            <span><a className="admin-row-link" href={`/admin?q=${encodeURIComponent(client.email || "")}`}>Commandes</a></span>
          </div>
        )) : (
          <div className="admin-empty">
            <strong>Aucun client</strong>
            <span>Aucun resultat pour cette recherche.</span>
          </div>
        )}
      </section>
    </>
  );
}

function InvoicesView({ orders, query, params }) {
  const invoiceOrders = orders
    .filter((order) => order.status === "paid" || order.paid_at)
    .filter((order) => orderMatches(order, query));
  const currentPath = adminUrl({ view: "invoices", q: query });

  return (
    <>
      <form className="admin-filters admin-filters-compact" action="/admin">
        <input type="hidden" name="view" value="invoices" />
        <input name="q" defaultValue={query} placeholder="Rechercher facture, email, commande..." />
        <button type="submit">Filtrer</button>
      </form>

      <section className="admin-table-card admin-wide-card">
        <form action={bulkOrderAction} className="admin-bulk-form">
          <input type="hidden" name="redirect_to" value={currentPath} />
          <BulkOrderActions />
          <div className="admin-table-head admin-invoices-grid">
            <span></span>
            <span>Facture</span>
            <span>Client</span>
            <span>Date</span>
            <span>Total</span>
            <span></span>
          </div>
          {invoiceOrders.length ? invoiceOrders.map((order) => (
            <div className="admin-order-row admin-invoices-grid" key={order.id}>
              <label className="admin-check-cell" aria-label={`Selectionner ${order.order_number}`}>
                <input type="checkbox" name="order_ids" value={order.id} />
              </label>
              <span>
                <strong>FAC-{order.order_number}</strong>
                <small>{order.order_number}</small>
              </span>
              <span>
                <strong>{order.customer_email}</strong>
                <small>{fullName(order.profile) || "Client sans nom"}</small>
              </span>
              <span>{formatDate(order.paid_at || order.created_at)}</span>
              <span>{formatPrice(order.total_amount)}</span>
              <span><a className="admin-row-link" href={`/admin/invoices/${order.id}`}>Voir facture</a></span>
            </div>
          )) : (
            <div className="admin-empty">
              <strong>Aucune facture</strong>
              <span>Les commandes payees apparaitront ici.</span>
            </div>
          )}
        </form>
      </section>
    </>
  );
}

function buildContestRows(orders) {
  return orders.flatMap((order) => (
    getProductItems(order)
      .filter((item) => Number(item.contest_entries || 0) > 0)
      .map((item) => ({
        id: item.id,
        orderId: order.id,
        orderNumber: order.order_number,
        email: order.customer_email,
        product: item.product_name,
        variant: [item.variant_size && `Taille ${item.variant_size}`, item.variant_model && `Modele ${item.variant_model}`].filter(Boolean).join(" - "),
        entries: Number(item.contest_entries || 0),
        createdAt: order.paid_at || order.created_at
      }))
  ));
}

function ContestView({ orders, query }) {
  const rows = buildContestRows(orders).filter((row) => {
    if (!query) return true;
    return normalizeText([row.orderNumber, row.email, row.product, row.variant].filter(Boolean).join(" ")).includes(normalizeText(query));
  });
  const currentPath = adminUrl({ view: "contest", q: query });
  const totalEntries = rows.reduce((sum, row) => sum + row.entries, 0);

  return (
    <>
      <form className="admin-filters admin-filters-compact" action="/admin">
        <input type="hidden" name="view" value="contest" />
        <input name="q" defaultValue={query} placeholder="Rechercher participation, commande, client..." />
        <button type="submit">Filtrer</button>
      </form>

      <section className="admin-table-card admin-wide-card">
        <form action={deleteContestParticipations} className="admin-bulk-form">
          <input type="hidden" name="redirect_to" value={currentPath} />
          <div className="admin-bulk-actions">
            <span>{totalEntries} participation{totalEntries > 1 ? "s" : ""}</span>
            <button className="is-danger" type="submit">Supprimer participations selectionnees</button>
          </div>
          <div className="admin-table-head admin-contest-grid">
            <span></span>
            <span>Commande</span>
            <span>Client</span>
            <span>Article</span>
            <span>Participations</span>
            <span></span>
          </div>
          {rows.length ? rows.map((row) => (
            <div className="admin-order-row admin-contest-grid" key={row.id}>
              <label className="admin-check-cell" aria-label={`Selectionner ${row.orderNumber}`}>
                <input type="checkbox" name="contest_item_ids" value={row.id} />
              </label>
              <span>
                <strong>{row.orderNumber}</strong>
                <small>{formatDate(row.createdAt)}</small>
              </span>
              <span>
                <strong>{row.email}</strong>
                <small>Participation achat</small>
              </span>
              <span>
                <strong>{row.product}</strong>
                <small>{row.variant || "Sans variante"}</small>
              </span>
              <span>{row.entries}</span>
              <span><a className="admin-row-link" href={`/admin?order=${row.orderId}`}>Commande</a></span>
            </div>
          )) : (
            <div className="admin-empty">
              <strong>Aucune participation</strong>
              <span>Les participations de concours apparaitront ici.</span>
            </div>
          )}
        </form>
      </section>
    </>
  );
}

export default async function AdminPage({ searchParams }) {
  const params = await searchParams;
  const logged = await isAdminSession();

  if (!logged) {
    return <LoginScreen error={params?.error === "1"} />;
  }

  const requestedView = String(params?.view || "orders");
  const view = VIEWS.has(requestedView) ? requestedView : "orders";
  const query = String(params?.q || "").trim();
  const status = String(params?.status || "all");
  const selectedId = String(params?.order || "");
  const { orders, configError, dataError } = await fetchOrders();
  const activeOrders = orders.filter((order) => !order.archived_at);
  const archivedOrders = orders.filter((order) => order.archived_at);
  const paidOrders = activeOrders.filter((order) => order.status === "paid" || order.paid_at);
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const preparing = activeOrders.filter((order) => ["paid", "preparing"].includes(order.status)).length;
  const entries = activeOrders.reduce((sum, order) => sum + getEntries(order), 0);
  const customerCount = new Set(activeOrders.map((order) => order.customer_email).filter(Boolean)).size;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <strong>TMRR</strong>
          <span>ADMIN</span>
        </div>
        <AdminNav view={view} />
        <form action={adminLogout}>
          <button type="submit">Deconnexion</button>
        </form>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="admin-kicker">Gestion boutique TMRR</p>
            <h1>{view === "archives" ? "Commandes archivees" : view === "clients" ? "Clients" : view === "invoices" ? "Factures" : view === "contest" ? "Concours" : "Commandes & clients"}</h1>
          </div>
          <a className="admin-secondary-button" href="/admin/export">Export CSV</a>
        </header>

        {(configError || dataError || params?.error) && (
          <p className="admin-alert">
            {configError ? "Configuration Supabase admin manquante." : dataError || "Une action n'a pas pu etre terminee."}
          </p>
        )}

        <div className="admin-metrics">
          <MetricCard label="CA paye" value={formatPrice(revenue)} hint="Commandes payees actives" />
          <MetricCard label="Commandes" value={activeOrders.length} hint={`${customerCount} client${customerCount > 1 ? "s" : ""}`} />
          <MetricCard label="A preparer" value={preparing} hint="Payees ou en preparation" />
          <MetricCard label="Participations" value={entries} hint="Concours total actif" />
        </div>

        {view === "orders" && (
          <OrdersView orders={activeOrders} query={query} status={status} selectedId={selectedId} params={params} />
        )}
        {view === "archives" && (
          <OrdersView orders={archivedOrders} query={query} status={status} selectedId={selectedId} params={params} mode="archives" />
        )}
        {view === "clients" && (
          <ClientsView orders={orders} query={query} />
        )}
        {view === "invoices" && (
          <InvoicesView orders={orders} query={query} params={params} />
        )}
        {view === "contest" && (
          <ContestView orders={orders} query={query} />
        )}
      </section>
    </main>
  );
}
