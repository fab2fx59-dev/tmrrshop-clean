import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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

async function markPromoCodeUsed({ supabase, session }) {
  const promoCode = session.metadata?.promo_code;
  const userId = session.client_reference_id || session.metadata?.user_id;
  if (!promoCode || !userId) return;

  await supabase
    .from("promo_codes")
    .update({
      used_at: new Date().toISOString(),
      stripe_checkout_session_id: session.id
    })
    .eq("user_id", userId)
    .eq("code", promoCode)
    .is("used_at", null);
}

async function createPurchasedGiftCards({ supabase, session }) {
  const orderId = session.metadata?.order_id;
  const buyerUserId = session.client_reference_id || session.metadata?.user_id;
  if (!orderId || !buyerUserId) return;

  const { data: existing } = await supabase
    .from("gift_cards")
    .select("id")
    .eq("order_id", orderId);

  if ((existing || []).length) return;

  const { data: order } = await supabase
    .from("orders")
    .select("customer_email")
    .eq("id", orderId)
    .maybeSingle();

  const buyerEmail = order?.customer_email || session.customer_details?.email || session.customer_email || "";
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("product_name, product_category, variant_model, variant_size, quantity, unit_price")
    .eq("order_id", orderId);

  const giftItems = (orderItems || []).filter((item) => {
    return item.product_category === "gift_card" || String(item.product_name || "").toLowerCase().includes("carte cadeau");
  });

  for (const item of giftItems) {
    const quantity = Math.max(1, Number(item.quantity || 1));
    for (let index = 0; index < quantity; index += 1) {
      const amount = Number(item.unit_price || 0);
      const payload = {
        order_id: orderId,
        buyer_user_id: buyerUserId,
        buyer_email: buyerEmail,
        recipient_email: item.variant_model || buyerEmail,
        recipient_name: item.variant_size || "",
        amount,
        initial_amount: amount,
        remaining_amount: amount,
        message: "",
        delivery_date: null,
        status: "active",
        code: makeGiftCardCode()
      };

      const { data: giftCard } = await supabase
        .from("gift_cards")
        .insert(payload)
        .select("id, code, amount, recipient_email, recipient_name, message")
        .single();

      if (giftCard && await sendGiftCardEmail(giftCard)) {
        await supabase
          .from("gift_cards")
          .update({ emailed_at: new Date().toISOString() })
          .eq("id", giftCard.id);
      }
    }
  }
}

async function consumeGiftCard({ supabase, session }) {
  const code = session.metadata?.gift_card_code;
  const amount = Number(session.metadata?.gift_card_amount || 0);
  if (!code || amount <= 0) return;

  const { data: giftCard } = await supabase
    .from("gift_cards")
    .select("id, remaining_amount, amount")
    .eq("code", code)
    .maybeSingle();

  if (!giftCard) return;

  const current = Number(giftCard.remaining_amount || giftCard.amount || 0);
  const nextAmount = Math.max(0, current - amount);

  await supabase
    .from("gift_cards")
    .update({
      remaining_amount: nextAmount,
      status: nextAmount > 0 ? "active" : "used",
      used_at: nextAmount > 0 ? null : new Date().toISOString()
    })
    .eq("id", giftCard.id);
}

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook non configure." }, { status: 500 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase admin non configure." }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const supabase = getAdminClient();
    const paidAt = new Date().toISOString();
    let shouldApplyPaymentEffects = true;

    if (session.metadata?.order_id) {
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("id, status")
        .eq("id", session.metadata.order_id)
        .maybeSingle();
      shouldApplyPaymentEffects = currentOrder?.status !== "paid";

      await supabase
        .from("orders")
        .update({
          status: "paid",
          customer_email: session.customer_details?.email || session.customer_email || "",
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent,
          paid_at: paidAt
        })
        .eq("id", session.metadata.order_id);
    } else {
      const orderNumber = `TMRR-${Date.now()}`;

      await supabase.from("orders").insert({
        order_number: orderNumber,
        customer_email: session.customer_details?.email || session.customer_email || "",
        status: "paid",
        total_amount: Number(session.amount_total || 0) / 100,
        currency: String(session.currency || "eur").toUpperCase(),
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent,
        paid_at: paidAt
      });
    }

    await createPurchasedGiftCards({ supabase, session });

    if (shouldApplyPaymentEffects) {
      await markPromoCodeUsed({ supabase, session });
      await consumeGiftCard({ supabase, session });
    }
  }

  return NextResponse.json({ received: true });
}
