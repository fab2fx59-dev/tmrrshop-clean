import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let index = 0; index < 8; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `TMRR-${suffix}`;
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour générer ton code fidélité." }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("promo_codes")
    .select("code")
    .eq("user_id", user.id)
    .is("used_at", null)
    .maybeSingle();

  if (existing?.code) {
    return NextResponse.json({ code: existing.code });
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("user_id", user.id)
    .eq("status", "paid");

  const points = (orders || []).reduce((sum, order) => sum + Math.floor(Number(order.total_amount || 0)), 0);

  if (points < 100) {
    return NextResponse.json({ error: "Il faut 100 points fidélité pour générer un code -15 %." }, { status: 400 });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode();
    const { data, error } = await supabase
      .from("promo_codes")
      .insert({
        user_id: user.id,
        code,
        discount_percent: 15
      })
      .select("code")
      .single();

    if (!error && data?.code) {
      return NextResponse.json({ code: data.code });
    }
  }

  return NextResponse.json({ error: "Le code n'a pas pu être généré. Réessaie dans un instant." }, { status: 500 });
}
