"use client";

import { useState } from "react";

function formatPrice(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} EUR`;
}

function formatStatus(status) {
  if (status === "paid") return "Payee";
  if (status === "cancelled") return "Annulee";
  return "En attente";
}

function OrderList({ orders }) {
  const [openOrderId, setOpenOrderId] = useState("");

  if (!orders.length) {
    return <p>Aucune commande enregistree pour le moment. Tes prochains achats apparaitront ici.</p>;
  }

  return orders.map((order) => {
    const isOpen = openOrderId === order.id;
    const items = order.order_items || [];
    const productItems = items.filter((item) => item.product_category !== "shipping");
    const shippingItem = items.find((item) => item.product_category === "shipping");
    const entries = items.reduce((sum, item) => sum + Number(item.contest_entries || 0), 0);
    const subtotal = productItems.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 1), 0);

    return (
      <article className={`account-order ${isOpen ? "is-open" : ""}`} key={order.id}>
        <button className="account-order-toggle" type="button" onClick={() => setOpenOrderId(isOpen ? "" : order.id)} aria-expanded={isOpen}>
          <span>
            <strong>{order.order_number}</strong>
            <small>{new Date(order.created_at).toLocaleDateString("fr-FR")}</small>
          </span>
          <span>
            <em>{formatStatus(order.status)}</em>
            <strong>{formatPrice(order.total_amount)}</strong>
          </span>
        </button>

        {isOpen && (
          <div className="account-order-detail">
            <div className="order-detail-head">
              <span>Articles commandes</span>
              {order.paid_at && <small>Payee le {new Date(order.paid_at).toLocaleDateString("fr-FR")}</small>}
            </div>

            <div className="order-detail-lines">
              {productItems.map((item, index) => {
                const options = [
                  item.variant_model && `Modele ${item.variant_model}`,
                  item.variant_size && `Taille ${item.variant_size}`
                ].filter(Boolean);

                return (
                  <div className="order-detail-line" key={`${item.product_name}-${index}`}>
                    <span>
                      <strong>{item.quantity} x {item.product_name}</strong>
                      {options.length > 0 && <small>{options.join(" - ")}</small>}
                      {Number(item.contest_entries || 0) > 0 && (
                        <small>{item.contest_entries} participation{Number(item.contest_entries) > 1 ? "s" : ""} concours</small>
                      )}
                    </span>
                    <span>
                      <small>Prix unitaire : {formatPrice(item.unit_price)}</small>
                      <strong>{formatPrice(Number(item.unit_price || 0) * Number(item.quantity || 1))}</strong>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="order-detail-total">
              <span>Sous-total articles</span>
              <strong>{formatPrice(subtotal)}</strong>
            </div>
            <div className="order-detail-total">
              <span>Frais de port</span>
              <strong>{shippingItem ? formatPrice(shippingItem.unit_price) : "Offerts"}</strong>
            </div>
            {entries > 0 && (
              <div className="order-detail-total">
                <span>Participations concours</span>
                <strong>{entries}</strong>
              </div>
            )}
            <div className="order-detail-total order-detail-grand-total">
              <span>Total paye</span>
              <strong>{formatPrice(order.total_amount)}</strong>
            </div>
          </div>
        )}
      </article>
    );
  });
}

function GiftCardList({ giftCards }) {
  if (!giftCards.length) {
    return <p>Aucune carte KDO achetee pour le moment. Tes codes apparaitront ici apres paiement valide.</p>;
  }

  return (
    <div className="account-gift-cards">
      {giftCards.map((card) => {
        const remainingAmount = Number(card.remaining_amount ?? card.amount ?? 0);
        const isUsed = card.status === "used" || remainingAmount <= 0;

        return (
          <article className={`account-gift-card ${isUsed ? "is-used" : ""}`} key={`${card.code}-${card.created_at}`}>
            <div>
              <span>{isUsed ? "Carte KDO utilisee" : "Code carte KDO"}</span>
              <strong>{card.code}</strong>
            </div>
            <p>
              Montant initial : <strong>{formatPrice(card.amount)}</strong>
            </p>
            <p>
              Credit restant : <strong>{formatPrice(remainingAmount)}</strong>
            </p>
            <p>Destinataire : {card.recipient_name || card.recipient_email || "Non renseigne"}</p>
            <p>Statut : {isUsed ? "Credit utilise" : "Active"}</p>
            <small>{isUsed ? "Cette carte cadeau a ete consommee." : card.emailed_at ? "E-mail envoye" : "Code visible ici. Envoi e-mail en attente de configuration."}</small>
          </article>
        );
      })}
    </div>
  );
}

export default function AccountTabs({ userEmail, firstName, lastName, phone, address, orders, entries, loyaltyPoints, promos, giftCards }) {
  const [activeTab, setActiveTab] = useState("infos");
  const [promoMessage, setPromoMessage] = useState("");
  const [promoCode, setPromoCode] = useState(promos.find((promo) => !promo.used_at)?.code || "");
  const visiblePromos = promoCode && !promos.some((promo) => promo.code === promoCode)
    ? [{ code: promoCode, discount_percent: 15, used_at: null }, ...promos]
    : promos;
  const canGeneratePromo = loyaltyPoints >= 100 && !promoCode;

  async function generatePromoCode() {
    setPromoMessage("Creation de ton code fidelite...");
    const response = await fetch("/api/promo/create", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      setPromoMessage(payload.error || "Impossible de creer le code pour le moment.");
      return;
    }

    setPromoCode(payload.code);
    setPromoMessage("Code fidelite pret. Tu peux l'utiliser au paiement.");
  }

  return (
    <div className="account-tabs">
      <div className="account-tab-list" role="tablist" aria-label="Espace client">
        <button className={activeTab === "infos" ? "active" : ""} type="button" onClick={() => setActiveTab("infos")}>
          Informations
        </button>
        <button className={activeTab === "orders" ? "active" : ""} type="button" onClick={() => setActiveTab("orders")}>
          Commandes
        </button>
        <button className={activeTab === "contest" ? "active" : ""} type="button" onClick={() => setActiveTab("contest")}>
          Concours
        </button>
        <button className={activeTab === "loyalty" ? "active" : ""} type="button" onClick={() => setActiveTab("loyalty")}>
          Fidelite
        </button>
        <button className={activeTab === "giftcards" ? "active" : ""} type="button" onClick={() => setActiveTab("giftcards")}>
          Mes cartes KDO
        </button>
      </div>

      {activeTab === "infos" && (
        <article className="account-card">
          <h3>Mes informations</h3>
          <p>
            <strong>Prenom :</strong> {firstName || "Non renseigne"}
          </p>
          <p>
            <strong>Nom :</strong> {lastName || "Non renseigne"}
          </p>
          <p>
            <strong>E-mail :</strong> {userEmail}
          </p>
          <p>
            <strong>Telephone :</strong> {phone || "Non renseigne"}
          </p>
          <p>
            <strong>Adresse :</strong> {address || "Non renseignee"}
          </p>
        </article>
      )}

      {activeTab === "orders" && (
        <article className="account-card">
          <h3>Mes commandes</h3>
          <div className="account-orders">
            <OrderList orders={orders} />
          </div>
        </article>
      )}

      {activeTab === "contest" && (
        <article className="account-card">
          <h3>Participation concours</h3>
          <p>
            {entries > 0
              ? `${entries} participation${entries > 1 ? "s" : ""} enregistree${entries > 1 ? "s" : ""} pour le tirage.`
              : "Tes participations apparaitront ici apres un achat concours valide."}
          </p>
        </article>
      )}

      {activeTab === "loyalty" && (
        <article className="account-card loyalty-card">
          <h3>Fidelite TMRR</h3>
          <p>
            <strong>{loyaltyPoints}</strong> point{loyaltyPoints > 1 ? "s" : ""} fidelite disponible{loyaltyPoints > 1 ? "s" : ""}.
          </p>
          <p>1 euro depense = 1 point fidelite. Des 100 points, tu debloques un code promo de 15 % valable une seule fois.</p>
          <div className="loyalty-progress" aria-label="Progression fidelite">
            <span style={{ width: `${Math.min(100, loyaltyPoints)}%` }}></span>
          </div>
          {visiblePromos.length ? (
            <div className="promo-code-list">
              {visiblePromos.map((promo) => (
                <div className={`promo-code-box ${promo.used_at ? "is-used" : ""}`} key={`${promo.code}-${promo.used_at || "active"}`}>
                  <span>{promo.used_at ? "Code deja utilise" : "Ton code actif"}</span>
                  <strong>{promo.code}</strong>
                  <small>
                    {promo.used_at
                      ? `Deja utilise le ${new Date(promo.used_at).toLocaleDateString("fr-FR")}`
                      : "Valable une seule fois au paiement."}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <button className="btn btn-primary magnetic" type="button" disabled={!canGeneratePromo} onClick={generatePromoCode}>
              Generer mon code -15 %
            </button>
          )}
          <a className="btn btn-ghost magnetic" href="/fidelite">Voir le programme fidelite</a>
          {promoMessage && <p className="form-message">{promoMessage}</p>}
        </article>
      )}

      {activeTab === "giftcards" && (
        <article className="account-card">
          <h3>Mes cartes KDO</h3>
          <p>Retrouve ici les codes achetes, leur montant et le credit restant disponible.</p>
          <GiftCardList giftCards={giftCards || []} />
        </article>
      )}
    </div>
  );
}
