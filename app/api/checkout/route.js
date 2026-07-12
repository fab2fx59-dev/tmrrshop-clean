import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const SHIPPING_PRICE = 4.9;
const FREE_SHIPPING_MIN = 60;
const MAX_ITEM_QUANTITY = 99;
const GIFT_CARD_AMOUNTS = [25, 50, 75, 100];
const PRODUCT_NAMES = {
  tshirt: ["People Think", "Never Fit", "Break The Frame", "Trop Libre", "Rebel By Nature"],
  cap: ["Dragon Mark", "Fast Logo", "Rebel By Nature", "Smash The System", "TMRR Drip", "Graffiti", "Danger Script", "Danger Bold"],
  hoodie: ["Smash The System", "Break The Frame", "Never Obey", "Out Of The Box", "Rebel By Nature", "Break The Rules", "People Think"],
  bandana: ["Bullet Shield", "Gold Line", "White Signal", "Skull Guard"]
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasProductName(item, names) {
  const itemName = normalizeText(item.name);
  return names.some((name) => itemName === normalizeText(name));
}

function getItemLabel(item) {
  return [
    item.name,
    item.options,
    item.category,
    item.model,
    item.size,
    item.image
  ].filter(Boolean).join(" ").toLowerCase();
}

function getCatalogPrice(item) {
  const label = getItemLabel(item);

  if (isGiftCardItem(item)) {
    const amount = Number(item.price || 0);
    return GIFT_CARD_AMOUNTS.includes(amount) ? amount : null;
  }

  if (hasProductName(item, ["Club TMRR 12 mois"])) return 199;
  if (hasProductName(item, ["Club TMRR 6 mois"])) return 119;
  if (hasProductName(item, ["T-shirt TMRR du mois"])) return 19.9;
  if (hasProductName(item, ["Pack 2 - Ticket Rebel", "Pack Ticket Rebel"])) return 39.9;
  if (hasProductName(item, ["Pack 1 - T-shirt concours"])) return 25.9;
  if ((label.includes("hoodie") || label.includes("assets/hoodies/")) && hasProductName(item, PRODUCT_NAMES.hoodie)) return 39.9;
  if ((label.includes("t-shirt noir") || label.includes("assets/products/")) && hasProductName(item, PRODUCT_NAMES.tshirt)) return 24.9;
  if ((label.includes("casquette") || label.includes("assets/caps/")) && hasProductName(item, PRODUCT_NAMES.cap)) return 14.9;
  if ((label.includes("bandana") || label.includes("assets/bandanas/")) && hasProductName(item, PRODUCT_NAMES.bandana)) return 16.9;

  return null;
}

function normalizeQuantity(quantity) {
  const parsed = Number(quantity || 1);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ITEM_QUANTITY) {
    return null;
  }

  return parsed;
}

function normalizeCheckoutItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "Le panier est vide." };
  }

  const items = [];

  for (const rawItem of rawItems) {
    const safeRawItem = rawItem || {};
    const quantity = normalizeQuantity(safeRawItem.quantity);
    const price = getCatalogPrice(safeRawItem);

    if (!quantity) {
      return { error: "Une quantite du panier est invalide." };
    }

    if (!price || price <= 0) {
      return { error: "Un article du panier n'est pas reconnu par la boutique TMRR." };
    }

    if (isGiftCardItem(safeRawItem) && !String(safeRawItem.recipientEmail || "").includes("@")) {
      return { error: "Renseigne l'e-mail du destinataire de la carte cadeau." };
    }

    items.push({
      ...safeRawItem,
      quantity,
      price,
      name: String(safeRawItem.name || "Article TMRR").slice(0, 120),
      options: String(safeRawItem.options || "").slice(0, 400),
      model: String(safeRawItem.model || "").slice(0, 80),
      size: String(safeRawItem.size || "").slice(0, 80),
      category: String(safeRawItem.category || "").slice(0, 80),
      recipientEmail: String(safeRawItem.recipientEmail || "").slice(0, 180),
      recipientName: String(safeRawItem.recipientName || "").slice(0, 120)
    });
  }

  return { items };
}

function getContestEntries(item) {
  const label = `${item.name || ""} ${item.options || ""} ${item.category || ""}`.toLowerCase();
  const quantity = Number(item.quantity || 1);

  if (label.includes("ticket rebel")) return quantity * 2;
  if (label.includes("concours") || label.includes("no rules") || Number(item.price || 0) === 25.9) return quantity;
  return 0;
}

function isGiftCardItem(item) {
  return item.category === "gift_card" || String(item.name || "").toLowerCase().includes("carte cadeau");
}

function getTotals(items) {
  const subtotal = items.reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.quantity || 1);
  }, 0);
  const shippableSubtotal = items
    .filter((item) => !isGiftCardItem(item))
    .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const shipping = shippableSubtotal > 0 && shippableSubtotal < FREE_SHIPPING_MIN ? SHIPPING_PRICE : 0;

  return {
    subtotal,
    shipping,
    total: subtotal + shipping
  };
}

function getShippingLine(items) {
  const shippableSubtotal = items
    .filter((item) => !isGiftCardItem(item))
    .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);

  if (shippableSubtotal <= 0 || shippableSubtotal >= FREE_SHIPPING_MIN) {
    return null;
  }

  return {
    quantity: 1,
    price_data: {
      currency: "eur",
      unit_amount: Math.round(SHIPPING_PRICE * 100),
      product_data: {
        name: "Livraison suivie"
      }
    }
  };
}

function createGiftCardClient(fallbackClient) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return fallbackClient;
}

function createOrderClient(fallbackClient) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return fallbackClient;
}

function getSiteUrl(request) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const requestOrigin = request.nextUrl?.origin || request.headers.get("origin") || "https://tmrr.shop";
  const isLocal = (url) => {
    try {
      return ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
    } catch {
      return false;
    }
  };
  const shouldUseConfiguredUrl = configuredUrl && (!isLocal(configuredUrl) || isLocal(requestOrigin));
  const baseUrl = shouldUseConfiguredUrl ? configuredUrl : requestOrigin;

  return baseUrl.replace(/\/+$/, "");
}

export async function POST(request) {
  try {
    return await handleCheckout(request);
  } catch (error) {
    console.error("Checkout fatal error", error);

    return NextResponse.json(
      {
        error: `Erreur serveur paiement : ${error?.message || "erreur inconnue"}`,
        config: {
          supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
          supabaseAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
          supabaseService: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          stripeSecret: Boolean(process.env.STRIPE_SECRET_KEY)
        }
      },
      { status: 500 }
    );
  }
}

async function handleCheckout(request) {
  let supabase = null;
  let user = null;

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      user = data?.user || null;
    } catch {
      user = null;
    }
  }

  if (!supabase) {
    return NextResponse.json(
      { error: "Le compte client est obligatoire pour commander, mais Supabase n'est pas encore configure." },
      { status: 500 }
    );
  }

  if (!user) {
    return NextResponse.json(
      { error: "Connecte-toi ou cree un compte client pour passer commande." },
      { status: 401 }
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe n'est pas encore configure." },
      { status: 500 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { items: rawItems = [], promoCode = "", giftCardCode = "" } = await request.json();
  const normalizedCart = normalizeCheckoutItems(rawItems);

  if (normalizedCart.error) {
    return NextResponse.json(
      { error: normalizedCart.error },
      { status: 400 }
    );
  }

  const items = normalizedCart.items;
  const siteUrl = getSiteUrl(request);
  const totals = getTotals(items);
  const orderNumber = `TMRR-${Date.now().toString().slice(-8)}`;
  const cleanPromoCode = String(promoCode || "").trim().toUpperCase();
  const cleanGiftCardCode = String(giftCardCode || "").trim().toUpperCase();
  let discount = null;
  let giftCardDiscount = null;

  if (cleanPromoCode && cleanGiftCardCode) {
    return NextResponse.json(
      { error: "Utilise un seul code de reduction par commande." },
      { status: 400 }
    );
  }

  if (cleanPromoCode) {
    if (!user || !supabase) {
      return NextResponse.json(
        { error: "Connecte-toi pour utiliser ton code promo fidelite." },
        { status: 401 }
      );
    }

    const { data: promo } = await supabase
      .from("promo_codes")
      .select("code, discount_percent, used_at")
      .eq("user_id", user.id)
      .eq("code", cleanPromoCode)
      .maybeSingle();

    if (!promo || promo.used_at) {
      return NextResponse.json({ error: "Code promo invalide ou déjà utilisé." }, { status: 400 });
    }

    const coupon = await stripe.coupons.create({
      percent_off: Math.min(100, Math.max(1, Number(promo.discount_percent || 15))),
      duration: "once",
      name: `Fidélité TMRR ${promo.code}`
    });

    discount = {
      type: "promo",
      code: promo.code,
      stripeCouponId: coupon.id
    };
  }

  if (cleanGiftCardCode) {
    const giftSupabase = createGiftCardClient(supabase);
    const { data: giftCard } = await giftSupabase
      .from("gift_cards")
      .select("code, amount, remaining_amount, status, used_at")
      .eq("code", cleanGiftCardCode)
      .maybeSingle();

    const availableAmount = Number(giftCard?.remaining_amount || giftCard?.amount || 0);
    const appliedAmount = Math.min(totals.total, availableAmount);

    if (!giftCard || giftCard.used_at || giftCard.status !== "active" || appliedAmount <= 0) {
      return NextResponse.json({ error: "Carte cadeau invalide ou deja utilisee." }, { status: 400 });
    }

    const coupon = await stripe.coupons.create({
      amount_off: Math.round(appliedAmount * 100),
      currency: "eur",
      duration: "once",
      name: `Carte cadeau TMRR ${giftCard.code}`
    });

    giftCardDiscount = {
      type: "gift_card",
      code: giftCard.code,
      appliedAmount,
      stripeCouponId: coupon.id
    };
  }

  const orderSupabase = createOrderClient(supabase);
  if (!orderSupabase) {
    return NextResponse.json(
      {
        error: `Supabase n'est pas encore configure sur Vercel : NEXT_PUBLIC_SUPABASE_URL ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "MANQUANTE"}, NEXT_PUBLIC_SUPABASE_ANON_KEY ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "OK" : "MANQUANTE"}, SUPABASE_SERVICE_ROLE_KEY ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MANQUANTE"}.`
      },
      { status: 500 }
    );
  }

  const orderEmail = user.email;

  const { data: order, error: orderError } = await orderSupabase
    .from("orders")
    .insert({
      user_id: user?.id || null,
      order_number: orderNumber,
      customer_email: orderEmail,
      status: "pending",
      total_amount: totals.total,
      currency: "EUR"
    })
    .select("id")
    .single();

  if (orderError) {
    return NextResponse.json(
      { error: `La commande n'a pas pu etre preparee : ${orderError.message || "permission Supabase refusee"}` },
      { status: 500 }
    );
  }

  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_name: item.name || "Article TMRR",
    product_category: item.category || "",
    variant_model: item.category === "gift_card" ? item.recipientEmail || "" : item.model || "",
    variant_size: item.category === "gift_card" ? item.recipientName || "" : item.size || "",
    quantity: Number(item.quantity || 1),
    unit_price: Number(item.price || 0),
    contest_entries: getContestEntries(item)
  }));

  if (totals.shipping > 0) {
    orderItems.push({
      order_id: order.id,
      product_name: "Livraison suivie",
      product_category: "shipping",
      quantity: 1,
      unit_price: totals.shipping,
      contest_entries: 0
    });
  }

  const { error: itemsError } = await orderSupabase.from("order_items").insert(orderItems);

  if (itemsError) {
    await orderSupabase.from("orders").delete().eq("id", order.id).eq("status", "pending");

    return NextResponse.json(
      { error: `Les articles de la commande n'ont pas pu etre enregistres : ${itemsError.message || "permission Supabase refusee"}` },
      { status: 500 }
    );
  }

  const lineItems = items.map((item) => ({
    quantity: item.quantity || 1,
    price_data: {
      currency: "eur",
      unit_amount: Math.round(Number(item.price || 0) * 100),
      product_data: {
        name: item.name || "Article TMRR",
        metadata: {
          size: item.size || "",
          model: item.model || "",
          category: item.category || "",
          options: item.options || ""
        }
      }
    }
  }));
  const shippingLine = getShippingLine(items);
  if (shippingLine) {
    lineItems.push(shippingLine);
  }
  const checkoutDiscounts = [discount, giftCardDiscount].filter(Boolean).map((item) => ({ coupon: item.stripeCouponId }));

  let session;

  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        order_id: order.id,
        promo_code: discount?.code || "",
        gift_card_code: giftCardDiscount?.code || "",
        gift_card_amount: giftCardDiscount?.appliedAmount ? String(giftCardDiscount.appliedAmount) : "",
        tmrr_cart: JSON.stringify(items).slice(0, 450)
      },
      line_items: lineItems,
      discounts: checkoutDiscounts.length ? checkoutDiscounts : undefined,
      success_url: `${siteUrl}/compte?paiement=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/panier?paiement=cancel`
    });
  } catch (error) {
    await orderSupabase.from("orders").delete().eq("id", order.id).eq("status", "pending");

    return NextResponse.json(
      { error: `Stripe refuse le demarrage du paiement : ${error.message}` },
      { status: 500 }
    );
  }

  await orderSupabase
    .from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id);

  return NextResponse.json({ url: session.url });
}
