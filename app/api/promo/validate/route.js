import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function createGiftCardClient(fallbackClient) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return fallbackClient;
}

export async function POST(request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour utiliser un code." }, { status: 401 });
  }

  const { code } = await request.json();
  const cleanCode = String(code || "").trim().toUpperCase();

  if (!cleanCode) {
    return NextResponse.json({ error: "Saisis un code." }, { status: 400 });
  }

  const { data: promo } = await supabase
    .from("promo_codes")
    .select("code, discount_percent, used_at")
    .eq("user_id", user.id)
    .eq("code", cleanCode)
    .maybeSingle();

  if (promo && !promo.used_at) {
    return NextResponse.json({
      type: "promo",
      code: promo.code,
      discountPercent: Number(promo.discount_percent || 0)
    });
  }

  const giftSupabase = createGiftCardClient(supabase);
  const { data: giftCard } = await giftSupabase
    .from("gift_cards")
    .select("code, amount, remaining_amount, status, used_at")
    .eq("code", cleanCode)
    .maybeSingle();

  const giftAmount = Number(giftCard?.remaining_amount || giftCard?.amount || 0);

  if (!giftCard || giftCard.used_at || giftCard.status !== "active" || giftAmount <= 0) {
    return NextResponse.json({ error: "Code promo ou carte cadeau invalide." }, { status: 400 });
  }

  return NextResponse.json({
    type: "gift_card",
    code: giftCard.code,
    amount: giftAmount
  });
}
