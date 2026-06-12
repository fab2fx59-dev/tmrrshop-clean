import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../lib/supabase/server";

const SHIPPING_PRICE = 4.9;
const FREE_SHIPPING_MIN = 60;

function getContestEntries(item) {
  const label = `${item.name || ""} ${item.options || ""}`.toLowerCase();
  const quantity = Number(item.quantity || 1);

  if (label.includes("ticket rebel")) return quantity * 2;
  if (label.includes("concours") || label.includes("no rules")) return quantity;
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
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return fallbackClient;
}

function createOrderClient(fallbackClient) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return fallbackClient;
}

export async function POST(request) {
  try {
    return await handleCheckout(request);
  } catch (error) {
    console.error("Checkout fatal error", error);

    return NextResponse.json(
      { error: `Erreur serveur paiement : ${error?.message || "erreur inconnue"}` },
      { status: 500 }
    );
  }
}

async function handleCheckout(request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe n'est pas encore configure." },
      { status: 500 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { items = [], customerEmail, promoCode = "", giftCardCode = "" } = await request.json();

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Le panier est vide." },
      { status: 400 }
    );
  }

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL;
  const totals = getTotals(items);
  const orderNumber = `TMRR-${Date.now().toString().slice(-8)}`;
  const cleanPromoCode = String(promoCode || "").trim().toUpperCase();
  const cleanGiftCardCode = String(giftCardCode || "").trim().toUpperCase();
  let discount = null;
  let giftCardDiscount = null;

  if (cleanPromoCode) {
    if (!user) {
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
      percent_off: Number(promo.discount_percent || 15),
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
  const orderEmail = customerEmail || user?.email || "client-a-renseigner@tmrr.shop";

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
      customer_email: customerEmail || user?.email || undefined,
      client_reference_id: user?.id || undefined,
      metadata: {
        user_id: user?.id || "",
        order_id: order.id,
        promo_code: discount?.code || "",
        gift_card_code: giftCardDiscount?.code || "",
        gift_card_amount: giftCardDiscount?.appliedAmount ? String(giftCardDiscount.appliedAmount) : "",
        tmrr_cart: JSON.stringify(items).slice(0, 450)
      },
      line_items: lineItems,
      discounts: checkoutDiscounts.length ? checkoutDiscounts : undefined,
      success_url: `${origin}/compte?paiement=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/panier?paiement=cancel`
    });
  } catch (error) {
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
