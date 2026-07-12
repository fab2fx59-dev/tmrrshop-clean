import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { signIn, signOut, signUp } from "../auth/actions";
import { createSupabaseServerClient } from "../lib/supabase/server";
import AccountTabs from "./account-tabs";

export const dynamic = "force-dynamic";

function getSafePath(value, fallback = "/compte") {
  const path = String(value || "").trim();

  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }

  return path;
}

function Header() {
  return (
    <>
      <canvas className="spark-canvas" aria-hidden="true"></canvas>
      <div className="site-noise" aria-hidden="true"></div>
      <div className="top-strip">
        <div className="ticker">
          <span>Compte client</span>
          <span>Suivi commandes</span>
          <span>Accès TMRR</span>
        </div>
      </div>
      <header className="site-header">
        <video className="nav-video" src="/assets/nav/nav-bg.mp4" autoPlay muted loop playsInline preload="metadata" aria-hidden="true"></video>
        <a className="brand" href="/">
          <img src="/assets/brand/logo-dragon-white.png" alt="TMRR" />
        </a>
        <button className="menu-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false">
          <span></span>
          <span></span>
        </button>
        <nav className="nav" aria-label="Navigation principale">
          <a href="/">Accueil</a>
          <a href="/#concours">Jeu concours TMRR</a>
          <a href="/casquettes">Casquettes</a>
          <a href="/tshirts">T-shirts</a>
          <a href="/hoodies">Sweats à capuches</a>
          <a href="/bandanas">Bandanas</a>
          <a href="/club">Club TMRR</a>
          <a href="/carte-kdo">Carte KDO</a>
          <a href="/faq">FAQ</a>
          <a href="/compte">Compte</a>
        </nav>
        <a className="cart-pill" href="/panier">
          <span>Panier</span>
          <strong>0</strong>
        </a>
      </header>
    </>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <img src="/assets/brand/logo-dragon-white.png" alt="TMRR" />
        <p>No rules. Just ride.</p>
        <span>Boutique officielle TMRR - collection noire, esprit libre, concours Honda Rebel.</span>
      </div>
      <div className="footer-grid">
        <div>
          <h2>Boutique</h2>
          <a href="/tshirts">T-shirts</a>
          <a href="/casquettes">Casquettes</a>
          <a href="/hoodies">Sweats à capuches</a>
          <a href="/bandanas">Bandanas</a>
          <a href="/carte-kdo">Carte KDO</a>
        </div>
        <div>
          <h2>Concours</h2>
          <a href="/#concours">Honda Rebel à gagner</a>
          <a href="/#panier">Pack Ticket Rebel</a>
          <a href="/reglement-concours">Règlement concours</a>
          <a href="/faq">FAQ</a>
        </div>
        <div>
          <h2>Client</h2>
          <a href="/compte">Mon compte</a>
          <a href="/panier">Panier</a>
          <a href="/paiement">Paiement sécurisé</a>
          <a href="/livraison-retours">Livraison & retours</a>
          <a href="/contact">Contact</a>
        </div>
        <div>
          <h2>TMRR</h2>
          <a href="/club">Club TMRR</a>
          <a href="/mentions-legales">Mentions légales</a>
          <a href="/confidentialite">Confidentialité</a>
          <a className="facebook-button" href="https://www.facebook.com/TMRRofficiel" target="_blank" rel="noopener">
            Facebook TMRRofficiel
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 TMRR. Tous droits réservés.</span>
        <span>Paiement sécurisé par carte bancaire.</span>
      </div>
    </footer>
  );
}

function Message({ text }) {
  if (!text) return null;
  return <p className="form-message account-notice">{text}</p>;
}

function PaymentReturnMessage({ status }) {
  if (status === "success") {
    return <p className="form-message account-notice success">Paiement validé. Merci pour ta commande TMRR.</p>;
  }

  if (status === "pending") {
    return (
      <p className="form-message account-notice">
        Paiement reçu par Stripe. Ta commande apparaîtra ici dès que la confirmation finale sera enregistrée.
      </p>
    );
  }

  if (status === "cancel") {
    return <p className="form-message account-notice">Paiement annulé. Aucun règlement n'a été enregistré.</p>;
  }

  return null;
}

function createAdminClient(fallbackClient) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return fallbackClient;
}

function getContestEntriesFromLabel(label, quantity = 1) {
  const text = String(label || "").toLowerCase();
  const safeQuantity = Math.max(1, Number(quantity || 1));

  if (text.includes("ticket rebel")) return safeQuantity * 2;
  if (text.includes("concours") || text.includes("no rules")) return safeQuantity;
  return 0;
}

async function attachEmailOrders({ user, supabase }) {
  if (!user?.email) return;

  const adminSupabase = createAdminClient(supabase);
  await adminSupabase
    .from("orders")
    .update({ user_id: user.id })
    .eq("customer_email", user.email)
    .is("user_id", null);
}

function makeGiftCardCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let index = 0; index < 10; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `KDO-${suffix}`;
}

function giftCardEmailHtml({ code, amount, recipientName, recipient_name, message }) {
  const safeName = recipientName || recipient_name || "Rider TMRR";
  const safeMessage = message || "Une carte cadeau TMRR t'attend. Choisis ta piece, trace ta route.";

  return `
    <div style="margin:0;padding:32px;background:#070707;color:#fff;font-family:Arial,sans-serif;">
      <div style="max-width:680px;margin:0 auto;border:1px solid #ff5a00;background:#111;">
        <div style="padding:28px;text-align:center;background:#000;">
          <img src="${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/assets/brand/logo-dragon-white.png" alt="TMRR" style="max-width:180px;width:60%;height:auto;">
          <p style="margin:14px 0 0;color:#ff5a00;font-weight:900;letter-spacing:2px;text-transform:uppercase;">Carte cadeau TMRR</p>
        </div>
        <div style="padding:34px;">
          <h1 style="margin:0 0 12px;font-size:34px;line-height:1;text-transform:uppercase;">${safeName}, ton code est pret.</h1>
          <p style="color:#d8d8d8;font-size:16px;line-height:1.6;">${safeMessage}</p>
          <div style="margin:28px 0;padding:24px;border:2px dashed #ff5a00;text-align:center;background:#050505;">
            <span style="display:block;color:#aaa;text-transform:uppercase;font-size:12px;letter-spacing:2px;">Code carte cadeau</span>
            <strong style="display:block;margin:10px 0;color:#ff5a00;font-size:34px;letter-spacing:3px;">${code}</strong>
            <span style="display:block;color:#fff;font-size:24px;font-weight:900;">Montant : ${Number(amount).toFixed(2).replace(".", ",")} EUR</span>
          </div>
          <p style="color:#d8d8d8;font-size:14px;line-height:1.6;">Utilise ce code dans le champ code promo au moment du paiement sur la boutique TMRR. Tu peux imprimer cet e-mail et l'offrir directement.</p>
        </div>
      </div>
    </div>
  `;
}

async function sendGiftCardEmail(giftCard) {
  if (!process.env.RESEND_API_KEY || !giftCard.recipient_email) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.GIFT_CARD_FROM_EMAIL || "TMRR <onboarding@resend.dev>",
      to: giftCard.recipient_email,
      subject: `Ta carte cadeau TMRR - ${Number(giftCard.amount).toFixed(2).replace(".", ",")} EUR`,
      html: giftCardEmailHtml(giftCard)
    })
  });

  return response.ok;
}

async function createPurchasedGiftCards({ session, user, supabase }) {
  let cart = [];
  try {
    cart = JSON.parse(session.metadata?.tmrr_cart || "[]");
  } catch {
    cart = [];
  }
  let giftItems = cart.filter((item) => item.category === "gift_card" || String(item.name || "").toLowerCase().includes("carte cadeau"));

  const giftSupabase = createAdminClient(supabase);
  const { data: existing } = await giftSupabase
    .from("gift_cards")
    .select("id")
    .eq("order_id", session.metadata.order_id);

  if ((existing || []).length) return;

  if (!giftItems.length) {
    const { data: orderItems } = await giftSupabase
      .from("order_items")
      .select("product_name, product_category, variant_model, variant_size, quantity, unit_price")
      .eq("order_id", session.metadata.order_id);

    giftItems = (orderItems || [])
      .filter((item) => item.product_category === "gift_card" || String(item.product_name || "").toLowerCase().includes("carte cadeau"))
      .map((item) => ({
        name: item.product_name,
        price: Number(item.unit_price || 0),
        quantity: Number(item.quantity || 1),
        recipientEmail: item.variant_model || user.email,
        recipientName: item.variant_size || ""
      }));
  }

  if (!giftItems.length) return;

  for (const item of giftItems) {
    const quantity = Math.max(1, Number(item.quantity || 1));
    for (let index = 0; index < quantity; index += 1) {
      const amount = Number(item.price || 0);
      const code = makeGiftCardCode();
      const giftCardPayload = {
        order_id: session.metadata.order_id,
        buyer_user_id: user.id,
        buyer_email: user.email,
        recipient_email: item.recipientEmail || user.email,
        recipient_name: item.recipientName || "",
        amount,
        initial_amount: amount,
        remaining_amount: amount,
        message: item.giftMessage || "",
        delivery_date: item.deliveryDate || null,
        status: "active",
        code
      };

      const { data: giftCard } = await giftSupabase
        .from("gift_cards")
        .insert(giftCardPayload)
        .select("id, code, amount, recipient_email, recipient_name, message")
        .single();

      if (giftCard && await sendGiftCardEmail(giftCard)) {
        await giftSupabase
          .from("gift_cards")
          .update({ emailed_at: new Date().toISOString() })
          .eq("id", giftCard.id);
      }
    }
  }
}

async function consumeGiftCard({ session, supabase }) {
  const code = session.metadata?.gift_card_code;
  const amount = Number(session.metadata?.gift_card_amount || 0);
  if (!code || amount <= 0) return;

  const giftSupabase = createAdminClient(supabase);
  const { data: giftCard } = await giftSupabase
    .from("gift_cards")
    .select("id, remaining_amount, amount")
    .eq("code", code)
    .maybeSingle();

  if (!giftCard) return;

  const current = Number(giftCard.remaining_amount || giftCard.amount || 0);
  const nextAmount = Math.max(0, current - amount);

  await giftSupabase
    .from("gift_cards")
    .update({
      remaining_amount: nextAmount,
      status: nextAmount > 0 ? "active" : "used",
      used_at: nextAmount > 0 ? null : new Date().toISOString()
    })
    .eq("id", giftCard.id);
}

function AuthForms({ message, redirectTo = "/paiement" }) {
  return (
    <div className="account-forms">
      <form className="gift-form account-card" action={signIn}>
        <input type="hidden" name="redirect_to" value={redirectTo} />
        <h2>Se connecter</h2>
        <p>Utilise ton e-mail et ton mot de passe pour retrouver tes commandes et ton suivi TMRR.</p>
        <label>
          E-mail
          <input type="email" name="email" autoComplete="email" placeholder="email@exemple.fr" required />
        </label>
        <label>
          Mot de passe
          <input type="password" name="password" autoComplete="current-password" placeholder="Ton mot de passe" required />
        </label>
        <button className="btn btn-primary magnetic" type="submit">
          Se connecter
        </button>
        <Message text={message} />
      </form>
      <form className="gift-form account-card" action={signUp}>
        <input type="hidden" name="redirect_to" value={redirectTo} />
        <h2>Créer un compte</h2>
        <p>Ton compte garde tes commandes, tes informations et tes participations au concours au même endroit.</p>
        <label>
          Prénom
          <input type="text" name="first_name" autoComplete="given-name" placeholder="Ton prénom" required />
        </label>
        <label>
          Nom
          <input type="text" name="last_name" autoComplete="family-name" placeholder="Ton nom" required />
        </label>
        <label>
          E-mail
          <input type="email" name="email" autoComplete="email" placeholder="email@exemple.fr" required />
        </label>
        <label>
          Téléphone
          <input type="tel" name="phone" autoComplete="tel" placeholder="06 00 00 00 00" />
        </label>
        <label>
          Adresse
          <input type="text" name="address" autoComplete="street-address" placeholder="Adresse de livraison" />
        </label>
        <label>
          Mot de passe
          <input type="password" name="password" autoComplete="new-password" placeholder="Minimum 6 caractères" minLength="6" required />
        </label>
        <button className="btn btn-primary magnetic" type="submit">
          Créer mon compte
        </button>
      </form>
    </div>
  );
}

function AccountDashboard({ user, profile, orders, promos, giftCards, paymentStatus }) {
  const entries = orders.reduce((sum, order) => {
    const items = order.order_items || [];
    return sum + items.reduce((itemSum, item) => itemSum + Number(item.contest_entries || 0), 0);
  }, 0);
  const loyaltyPoints = orders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + Math.floor(Number(order.total_amount || 0)), 0);

  return (
    <div className="account-dashboard">
      <div className="account-welcome">
        <div>
          <p className="eyebrow">Espace client</p>
          <h2>Bienvenue, {profile?.full_name || user.email}.</h2>
          <p>Retrouve tes infos, tes commandes et tes participations au tirage TMRR.</p>
          <PaymentReturnMessage status={paymentStatus} />
        </div>
        <form action={signOut}>
          <button className="btn btn-ghost magnetic" type="submit">
            Se déconnecter
          </button>
        </form>
      </div>
      <AccountTabs
        userEmail={user.email}
        firstName={profile?.first_name || ""}
        lastName={profile?.last_name || ""}
        phone={profile?.phone || ""}
        address={profile?.address || ""}
        orders={orders}
        entries={entries}
        loyaltyPoints={loyaltyPoints}
        promos={promos}
        giftCards={giftCards}
      />
    </div>
  );
}

async function confirmStripeReturn({ sessionId, user, supabase }) {
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) return "pending";

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") return "pending";
    const adminSupabase = createAdminClient(supabase);
    const customerEmail = session.customer_details?.email || session.customer_email || user.email || "";

    const { data: currentOrder } = await adminSupabase
      .from("orders")
      .select("id, status, user_id")
      .eq("stripe_checkout_session_id", session.id)
      .maybeSingle();

    if (currentOrder?.user_id && currentOrder.user_id !== user.id) return "pending";
    const shouldApplyPaymentEffects = currentOrder?.status !== "paid";

    let orderId = currentOrder?.id || session.metadata?.order_id || "";

    if (!orderId) {
      const { data: newOrder } = await adminSupabase
        .from("orders")
        .insert({
          user_id: user.id,
          order_number: `TMRR-${Date.now().toString().slice(-8)}`,
          customer_email: customerEmail,
          status: "paid",
          total_amount: Number(session.amount_total || 0) / 100,
          currency: String(session.currency || "eur").toUpperCase(),
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent,
          paid_at: new Date().toISOString()
        })
        .select("id")
        .single();

      orderId = newOrder?.id || "";

      if (orderId) {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ["data.price.product"]
        });
        const orderItems = (lineItems.data || []).map((line) => {
          const product = typeof line.price?.product === "object" ? line.price.product : null;
          const productName = line.description || product?.name || "Article TMRR";
          const quantity = Math.max(1, Number(line.quantity || 1));

          return {
            order_id: orderId,
            product_name: productName,
            product_category: productName.toLowerCase().includes("livraison") ? "shipping" : "",
            variant_model: product?.metadata?.model || "",
            variant_size: product?.metadata?.size || "",
            quantity,
            unit_price: Number(line.amount_subtotal || line.amount_total || 0) / 100 / quantity,
            contest_entries: getContestEntriesFromLabel(productName, quantity)
          };
        });

        if (orderItems.length) {
          await adminSupabase.from("order_items").insert(orderItems);
        }
      }
    }

    await adminSupabase
      .from("orders")
      .update({
        user_id: user.id,
        customer_email: customerEmail,
        status: "paid",
        stripe_payment_intent_id: session.payment_intent,
        paid_at: new Date().toISOString()
      })
      .eq("stripe_checkout_session_id", session.id);

    if (session.metadata?.promo_code) {
      await supabase
        .from("promo_codes")
        .update({
          used_at: new Date().toISOString(),
          stripe_checkout_session_id: session.id
        })
        .eq("user_id", user.id)
        .eq("code", session.metadata.promo_code)
        .is("used_at", null);
    }

    await createPurchasedGiftCards({ session, user, supabase });

    if (shouldApplyPaymentEffects) {
      await consumeGiftCard({ session, supabase });
    }

    return "success";
  } catch {
    return "pending";
  }
}

async function getAccountOrders({ user, supabase }) {
  const adminSupabase = createAdminClient(supabase);
  const orderSelect = "id, order_number, status, total_amount, currency, created_at, paid_at, order_items(product_name, product_category, variant_model, variant_size, quantity, unit_price, contest_entries)";

  const byUserPromise = adminSupabase
    .from("orders")
    .select(orderSelect)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const byEmailPromise = user.email
    ? adminSupabase
        .from("orders")
        .select(orderSelect)
        .eq("customer_email", user.email)
        .order("created_at", { ascending: false })
    : Promise.resolve({ data: [] });

  const [{ data: byUser }, { data: byEmail }] = await Promise.all([byUserPromise, byEmailPromise]);
  const byId = new Map();

  for (const order of [...(byUser || []), ...(byEmail || [])]) {
    byId.set(order.id, order);
  }

  return Array.from(byId.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export default async function AccountPage({ searchParams }) {
  const params = await searchParams;
  const message = params?.message ? decodeURIComponent(params.message) : "";
  const redirectTo = getSafePath(params?.redirect, "/compte");
  const paymentParam = params?.paiement || "";
  const sessionId = params?.session_id || "";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let profile = null;
  let orders = [];
  let promos = [];
  let giftCards = [];
  let paymentStatus = paymentParam === "cancel" ? "cancel" : "";

  if (user) {
    if (redirectTo !== "/compte" && !paymentParam && !sessionId) {
      redirect(redirectTo);
    }

    if (paymentParam === "success") {
      paymentStatus = await confirmStripeReturn({ sessionId, user, supabase });
    }
    await attachEmailOrders({ user, supabase });

    const [{ data: profileData }, ordersData, { data: promoData }, { data: giftCardData }] = await Promise.all([
      supabase.from("profiles").select("first_name, last_name, full_name, phone, address").eq("id", user.id).maybeSingle(),
      getAccountOrders({ user, supabase }),
      supabase
        .from("promo_codes")
        .select("code, discount_percent, used_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("gift_cards")
        .select("code, amount, remaining_amount, status, recipient_email, recipient_name, delivery_date, emailed_at, created_at")
        .eq("buyer_user_id", user.id)
        .order("created_at", { ascending: false })
    ]);

    profile = profileData;
    orders = ordersData || [];
    promos = promoData || [];
    giftCards = giftCardData || [];
  }

  return (
    <>
      <Header />
      <main>
        <section className="page-hero">
          <p className="eyebrow">Espace client</p>
          <h1>Ton accès TMRR.</h1>
          <p className="hero-lead">
            Crée ton compte, connecte-toi avec tes identifiants et retrouve tes commandes TMRR au même endroit.
          </p>
        </section>
        <section className="category-products section-dark">
          <div className="account-shell">
            {user ? (
              <AccountDashboard user={user} profile={profile} orders={orders} promos={promos} giftCards={giftCards} paymentStatus={paymentStatus} />
            ) : (
              <AuthForms message={message || (paymentStatus === "cancel" ? "Paiement annulé." : "")} redirectTo={redirectTo} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
