const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
const CART_KEY = "tmrrCart";
const USERS_KEY = "tmrrUsers";
const SESSION_KEY = "tmrrSession";
const ORDERS_KEY = "tmrrOrders";
const SHIPPING_PRICE = 4.9;
const FREE_SHIPPING_MIN = 60;
let activePromo = null;

function readCart() {
  const readWindowName = () => {
    try {
      const state = JSON.parse(window.name || "{}");
      return Array.isArray(state[CART_KEY]) ? state[CART_KEY] : [];
    } catch {
      return [];
    }
  };

  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return readWindowName();
  }
}

function writeCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    try {
      const state = JSON.parse(window.name || "{}");
      state[CART_KEY] = cart;
      window.name = JSON.stringify(state);
    } catch {
      window.name = JSON.stringify({ [CART_KEY]: cart });
    }
  }
  updateCartCount();
}

function parsePrice(text) {
  const normalized = text.replace(",", ".").replace(/[^\d.]/g, "");
  return Number.parseFloat(normalized) || 0;
}

function formatPrice(value) {
  return `${value.toFixed(2).replace(".", ",")} EUR`;
}

function isGiftCardItem(item) {
  return item.category === "gift_card" || String(item.name || "").toLowerCase().includes("carte cadeau");
}

function calculateOrderTotals(cart) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippableSubtotal = cart
    .filter((item) => !isGiftCardItem(item))
    .reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = shippableSubtotal > 0 && shippableSubtotal < FREE_SHIPPING_MIN ? SHIPPING_PRICE : 0;
  const discount = activePromo
    ? activePromo.type === "gift_card"
      ? Math.min(subtotal + shipping, Number(activePromo.amount || 0))
      : subtotal * (Number(activePromo.discountPercent || 0) / 100)
    : 0;
  return {
    subtotal,
    shipping,
    discount,
    total: Math.max(0, subtotal + shipping - discount)
  };
}

function updateCartCount() {
  const total = readCart().reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll(".cart-pill strong").forEach((element) => {
    element.textContent = String(total);
  });
}

function bindHeroVideoSound() {
  const video = document.querySelector("[data-hero-video]");
  const button = document.querySelector("[data-hero-sound]");
  const frame = video?.closest(".hero-art");
  if (!video) return;

  const setSoundState = (enabled) => {
    video.muted = !enabled;
    video.volume = enabled ? 1 : 0;
    frame?.classList.toggle("is-sound-on", enabled);
    if (button) {
      button.textContent = enabled ? "Son on" : "Son off";
      button.setAttribute("aria-pressed", String(enabled));
    }
  };

  const toggleSound = async () => {
    const nextState = video.muted;
    setSoundState(nextState);
    try {
      await video.play();
    } catch {
      setSoundState(false);
    }
  };

  video.addEventListener("click", toggleSound);
  button?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSound();
  });
  setSoundState(false);
}

function addToCart(item) {
  const cart = readCart();
  const existing = cart.find((cartItem) => cartItem.id === item.id);
  if (existing) {
    existing.quantity += item.quantity || 1;
  } else {
    cart.push({ ...item, quantity: item.quantity || 1 });
  }
  writeCart(cart);
  window.location.href = window.location.protocol === "file:" ? "panier.html" : "/panier";
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getCurrentUser() {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return null;
  return readJson(USERS_KEY, []).find((user) => user.email === email) || null;
}

function getUserOrders(email) {
  return readJson(ORDERS_KEY, []).filter((order) => order.email === email);
}

function bindProductButtons() {
  document.querySelectorAll(".product-card .btn-small").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const card = button.closest(".product-card");
      if (!card) return;
      const name = card.querySelector("h3")?.textContent?.trim() || "Article TMRR";
      const priceText = card.querySelector(".buy-row strong")?.textContent || "0";
      const image = card.querySelector("img")?.getAttribute("src") || "";
      const model = card.querySelector('[data-option="model"]')?.value;
      const size = card.querySelector('[data-option="size"]')?.value;
      const quantity = Math.max(1, Number(card.querySelector('[data-option="quantity"]')?.value || 1));
      const baseOption = card.querySelector(".product-label")?.textContent?.trim() || "TMRR";
      const selectedOptions = [baseOption, model && `Modèle ${model}`, size && `Taille ${size}`].filter(Boolean).join(" · ");
      addToCart({
        id: `${name}-${priceText}-${model || ""}-${size || ""}`.toLowerCase().replace(/\s+/g, "-"),
        name,
        price: parsePrice(priceText),
        image,
        quantity,
        options: selectedOptions
      });
    });
  });

  document.querySelector(".order-box .btn")?.addEventListener("click", (event) => {
    event.preventDefault();
    const model = document.querySelector("[data-order-model]")?.value || "Homme";
    const size = document.querySelector("[data-order-size]")?.value || "M";
    const quantity = Number(document.querySelector(".order-box input")?.value || 1);
    addToCart({
      id: `ticket-rebel-pack-${model}-${size}`,
      name: "Pack Ticket Rebel",
      price: 39.9,
      image: "assets/pack/ticket-shirt-poster.png",
      quantity,
      options: `T-shirt concours modèle ${model} taille ${size} · Casquette TMRR · 2 participations`
    });
  });

  document.querySelectorAll("[data-pack-choice]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const pack = button.dataset.packChoice || "pack1";
      const scope = button.closest(".mobile-pack-controls") || button.closest("[data-pack-selector]") || document;
      const model = scope.querySelector(`[data-pack-model="${pack}"]`)?.value || "Homme";
      const size = scope.querySelector(`[data-pack-size="${pack}"]`)?.value || "M";
      const isPackTwo = pack === "pack2";
      addToCart({
        id: `${pack}-${model}-${size}`.toLowerCase().replace(/\s+/g, "-"),
        name: isPackTwo ? "Pack 2 - Ticket Rebel" : "Pack 1 - T-shirt concours",
        price: isPackTwo ? 39.9 : 25.9,
        image: "assets/campaign/packs.png",
        quantity: 1,
        options: isPackTwo
          ? `T-shirt concours modÃ¨le ${model} taille ${size} Â· Casquette TMRR Â· 2 participations`
          : `T-shirt concours modÃ¨le ${model} taille ${size} Â· 1 participation`
      });
    });
  });

  document.querySelectorAll("[data-club-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.planName || "Club TMRR";
      const price = Number(button.dataset.planPrice || 0);
      addToCart({
        id: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        price,
        image: "assets/brand/logo-dragon-white.png",
        options: "Abonnement Club TMRR"
      });
    });
  });
}

function bindGiftCardForm() {
  const form = document.querySelector("[data-gift-form]");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const amount = Number(data.get("amount"));
    const quantity = Number(data.get("quantity") || 1);
    const recipientEmail = String(data.get("recipientEmail") || "").trim();
    if (![25, 50, 75, 100].includes(amount)) return;
    if (!recipientEmail) {
      form.reportValidity();
      return;
    }
    addToCart({
      id: `carte-kdo-${amount}`,
      name: "Carte cadeau electronique",
      price: amount,
      image: "assets/gift/gift-card.png",
      quantity,
      category: "gift_card",
      recipientEmail,
      recipientName: String(data.get("recipientName") || "").trim(),
      recipientType: String(data.get("recipientType") || "other"),
      deliveryDate: String(data.get("sendDate") || ""),
      giftMessage: String(data.get("message") || "").trim(),
      options: `${data.get("recipientType") === "self" ? "Pour moi-meme" : "Pour quelqu'un d'autre"} - Envoi a ${recipientEmail}`
    });
  });
}
function renderCartPage() {
  const list = document.querySelector("[data-cart-items]");
  const totalElement = document.querySelector("[data-cart-total]");
  if (!list || !totalElement) return;
  const params = new URLSearchParams(window.location.search);
  const addPayload = params.get("add");
  if (addPayload) {
    try {
      const item = JSON.parse(decodeURIComponent(addPayload));
      const cleanUrl = `${window.location.pathname}`;
      const cart = readCart();
      const existing = cart.find((cartItem) => cartItem.id === item.id);
      if (existing) {
        existing.quantity += item.quantity || 1;
      } else {
        cart.push({ ...item, quantity: item.quantity || 1 });
      }
      writeCart(cart);
      window.history.replaceState(null, "", cleanUrl);
    } catch {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }
  const cart = readCart();
  list.innerHTML = "";

  if (!cart.length) {
    list.innerHTML = `<p class="hero-lead">Ton panier est vide pour le moment.</p>`;
    document.querySelector("[data-cart-subtotal]")?.replaceChildren(document.createTextNode(formatPrice(0)));
    document.querySelector("[data-cart-shipping]")?.replaceChildren(document.createTextNode(formatPrice(0)));
    totalElement.textContent = formatPrice(0);
    return;
  }

  cart.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "cart-item";
    const lineTotal = item.price * item.quantity;
    row.innerHTML = `
      <img src="${item.image}" alt="">
      <div>
        <h3>${item.name}</h3>
        <p>${item.options || ""}</p>
        <p>Prix unitaire : ${formatPrice(item.price)}</p>
        <label class="cart-quantity">Quantite
          <input type="number" min="1" value="${item.quantity}" data-cart-quantity="${index}">
        </label>
        <p>Total article : ${formatPrice(lineTotal)}</p>
      </div>
      <button class="cart-remove" type="button" data-remove="${index}">Retirer</button>
    `;
    list.appendChild(row);
  });

  const totals = calculateOrderTotals(cart);
  document.querySelector("[data-cart-subtotal]")?.replaceChildren(document.createTextNode(formatPrice(totals.subtotal)));
  document.querySelector("[data-cart-shipping]")?.replaceChildren(document.createTextNode(totals.shipping ? formatPrice(totals.shipping) : "Offerts"));
  totalElement.textContent = formatPrice(totals.total);

  list.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = readCart();
      next.splice(Number(button.dataset.remove), 1);
      writeCart(next);
      renderCartPage();
    });
  });

  list.querySelectorAll("[data-cart-quantity]").forEach((input) => {
    input.addEventListener("change", () => {
      const next = readCart();
      const index = Number(input.dataset.cartQuantity);
      const quantity = Math.max(1, Number(input.value || 1));
      input.value = String(quantity);
      if (next[index]) {
        next[index].quantity = quantity;
        writeCart(next);
        renderCartPage();
      }
    });
  });
}

function renderPaymentPage() {
  const itemsElement = document.querySelector("[data-payment-items]");
  const totalElement = document.querySelector("[data-payment-total]");
  const confirmButton = document.querySelector("[data-confirm-order]");
  const message = document.querySelector("[data-payment-message]");
  const promoInput = document.querySelector("[data-promo-code]");
  const promoButton = document.querySelector("[data-apply-promo]");
  const discountLine = document.querySelector(".cart-discount");
  const discountElement = document.querySelector("[data-payment-discount]");
  if (!itemsElement || !totalElement || !confirmButton) return;

  const cart = readCart();
  itemsElement.innerHTML = "";

  if (!cart.length) {
    itemsElement.innerHTML = `<p>Ton panier est vide pour le moment.</p>`;
    document.querySelector("[data-payment-subtotal]")?.replaceChildren(document.createTextNode(formatPrice(0)));
    document.querySelector("[data-payment-shipping]")?.replaceChildren(document.createTextNode(formatPrice(0)));
    totalElement.textContent = formatPrice(0);
    confirmButton.disabled = true;
    return;
  }

  cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "payment-line";
    row.innerHTML = `
      <span>
        ${item.quantity} x ${item.name}
        <small>${item.options || "Article TMRR"} · Prix unitaire : ${formatPrice(item.price)}</small>
      </span>
      <strong>${formatPrice(item.price * item.quantity)}</strong>
    `;
    itemsElement.appendChild(row);
  });

  const totals = calculateOrderTotals(cart);
  document.querySelector("[data-payment-subtotal]")?.replaceChildren(document.createTextNode(formatPrice(totals.subtotal)));
  document.querySelector("[data-payment-shipping]")?.replaceChildren(document.createTextNode(totals.shipping ? formatPrice(totals.shipping) : "Offerts"));
  if (discountLine && discountElement) {
    discountLine.hidden = !totals.discount;
    discountElement.textContent = `-${formatPrice(totals.discount)}`;
  }
  totalElement.textContent = formatPrice(totals.total);

  promoButton?.addEventListener("click", async () => {
    const code = promoInput?.value?.trim();
    if (!code) {
      if (message) message.textContent = "Saisis un code promo.";
      return;
    }

    if (message) message.textContent = "Vérification du code promo...";

    const response = await fetch("/api/promo/validate", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code })
    });
    const payload = await response.json();

    if (!response.ok) {
      activePromo = null;
      if (message) message.textContent = payload.error || "Code promo invalide.";
      renderPaymentPage();
      return;
    }

    activePromo = {
      code: payload.code,
      type: payload.type || "promo",
      discountPercent: Number(payload.discountPercent || 0),
      amount: Number(payload.amount || 0)
    };
    if (promoInput) promoInput.value = payload.code;
    if (message) {
      message.textContent = activePromo.type === "gift_card"
        ? `Carte cadeau ${payload.code} appliquee : ${formatPrice(activePromo.amount)} de credit disponible.`
        : `Code ${payload.code} applique : -${activePromo.discountPercent} %.`;
    }
    renderPaymentPage();
  });

  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    if (message) message.textContent = "Preparation du paiement securise...";

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: cart,
          promoCode: activePromo?.type === "promo" ? activePromo.code : "",
          giftCardCode: activePromo?.type === "gift_card" ? activePromo.code : ""
        })
      });
      const responseText = await response.text();
      let payload = {};

      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { error: responseText || "Erreur technique pendant la preparation du paiement." };
      }

      if (!response.ok) {
        const missingConfig = payload.config
          ? ` Config: URL Supabase ${payload.config.supabaseUrl ? "OK" : "MANQUANTE"}, anon ${payload.config.supabaseAnon ? "OK" : "MANQUANTE"}, service ${payload.config.supabaseService ? "OK" : "MANQUANTE"}, Stripe ${payload.config.stripeSecret ? "OK" : "MANQUANTE"}.`
          : "";
        const errorText = (payload.error || `Le paiement n'a pas pu demarrer. Erreur ${response.status}.`) + missingConfig;
        if (message) message.textContent = errorText;
        if (response.status === 401 && errorText.toLowerCase().includes("connecte")) {
          window.setTimeout(() => {
            window.location.href = "/compte";
          }, 1200);
        }
        confirmButton.disabled = false;
        return;
      }

      if (payload.url) {
        window.location.href = payload.url;
        return;
      }

      throw new Error("Aucune page de paiement recue.");
    } catch (error) {
      if (message) {
        message.textContent = error?.message
          ? `Le paiement n'a pas pu demarrer : ${error.message}`
          : "Le paiement n'a pas pu demarrer. Reessaie dans un instant.";
      }
      confirmButton.disabled = false;
    }
  });
}

function clearCartAfterStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("paiement") !== "success") return;
  writeCart([]);
}

function bindAccountPage() {
  const registerForm = document.querySelector("[data-register-form]");
  const loginForm = document.querySelector("[data-login-form]");
  const dashboard = document.querySelector("[data-account-dashboard]");
  const authForms = document.querySelector("[data-auth-forms]");
  if (!registerForm || !loginForm || !dashboard || !authForms) return;

  const loginMessage = document.querySelector("[data-login-message]");
  const registerMessage = document.querySelector("[data-register-message]");

  const showDashboard = () => {
    const user = getCurrentUser();
    if (!user) {
      authForms.hidden = false;
      dashboard.hidden = true;
      return;
    }

    authForms.hidden = true;
    dashboard.hidden = false;
    document.querySelector("[data-account-name]").textContent = user.name;
    document.querySelector("[data-account-email]").textContent = user.email;
    document.querySelector("[data-account-phone]").textContent = user.phone || "Non renseigné";

    const orders = getUserOrders(user.email);
    const orderList = document.querySelector("[data-account-orders]");
    const contest = document.querySelector("[data-account-contest]");
    const contestEntries = orders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => {
        const label = `${item.name} ${item.options || ""}`.toLowerCase();
        if (label.includes("ticket rebel")) return itemSum + 2 * item.quantity;
        if (label.includes("concours") || label.includes("no rules")) return itemSum + item.quantity;
        return itemSum;
      }, 0);
    }, 0);

    if (contest) {
      contest.textContent = contestEntries
        ? `${contestEntries} participation(s) concours associée(s) à tes commandes enregistrées.`
        : "Aucune participation concours enregistrée pour le moment.";
    }

    if (!orderList) return;
    if (!orders.length) {
      orderList.innerHTML = `<p>Aucune commande enregistrée pour le moment. Quand tu valideras un panier, il apparaîtra ici.</p>`;
      return;
    }

    orderList.innerHTML = orders.map((order) => `
      <article class="account-order">
        <div><strong>${order.id}</strong><span>${order.date}</span></div>
        <p>${order.items.map((item) => `${item.quantity} x ${item.name}`).join(" · ")}</p>
        <footer><span>${order.status}</span><strong>${formatPrice(order.total)}</strong></footer>
      </article>
    `).join("");
  };

  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(registerForm);
    const email = String(data.get("email") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const users = readJson(USERS_KEY, []);

    if (users.some((user) => user.email === email)) {
      if (registerMessage) registerMessage.textContent = "Un compte existe déjà avec cet e-mail. Utilise la connexion.";
      return;
    }

    users.push({ email, password, name, phone, createdAt: new Date().toISOString() });
    writeJson(USERS_KEY, users);
    localStorage.setItem(SESSION_KEY, email);
    if (registerMessage) registerMessage.textContent = "Compte créé. Bienvenue dans ton espace TMRR.";
    showDashboard();
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(loginForm);
    const email = String(data.get("email") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    const user = readJson(USERS_KEY, []).find((entry) => entry.email === email && entry.password === password);

    if (!user) {
      if (loginMessage) loginMessage.textContent = "Identifiants introuvables. Vérifie ton e-mail ou ton mot de passe.";
      return;
    }

    localStorage.setItem(SESSION_KEY, email);
    if (loginMessage) loginMessage.textContent = "";
    showDashboard();
  });

  document.querySelector("[data-logout]")?.addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    showDashboard();
  });

  showDashboard();
}

function bindDropProgress() {
  const progress = document.querySelector("[data-drop-progress]");
  if (!progress) return;

  const start = Number(progress.dataset.dropStart || 651);
  const total = Number(progress.dataset.dropTotal || 2500);
  const dailyIncrement = Number(progress.dataset.dropDaily || 21);
  const resetDate = new Date(`${progress.dataset.dropDate || "2026-06-02"}T00:00:00`);
  const current = progress.querySelector("[data-drop-current]");
  const bar = progress.querySelector("[data-drop-bar]");

  const update = () => {
    const days = Math.max(0, Math.floor((Date.now() - resetDate.getTime()) / 86400000));
    const value = Math.min(total, start + days * dailyIncrement);
    const percent = Math.min(100, (value / total) * 100);

    if (current) current.textContent = String(value);
    if (bar) bar.style.width = `${percent}%`;
  };

  update();
  window.setInterval(update, 60000);
}

function bindSiteIntro() {
  const intro = document.querySelector(".site-intro");
  if (!intro) return;

  const finishIntro = () => {
    intro.classList.add("is-finished");
    document.body.classList.remove("intro-active");
  };

  document.body.classList.add("intro-active");

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishIntro();
    return;
  }

  window.setTimeout(finishIntro, 4850);
}

menuButton?.addEventListener("click", () => {
  const open = document.body.classList.toggle("menu-open");
  menuButton.setAttribute("aria-expanded", String(open));
});

nav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    document.body.classList.remove("menu-open");
    menuButton?.setAttribute("aria-expanded", "false");
  }
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.14 }
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

const countdown = document.querySelector(".countdown");
if (countdown) {
  const deadline = new Date(countdown.dataset.deadline || "").getTime();
  const parts = {
    days: countdown.querySelector("[data-days]"),
    hours: countdown.querySelector("[data-hours]"),
    minutes: countdown.querySelector("[data-minutes]"),
    seconds: countdown.querySelector("[data-seconds]")
  };

  const pad = (value) => String(value).padStart(2, "0");
  const updateCountdown = () => {
    const diff = Math.max(0, deadline - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    parts.days.textContent = pad(days);
    parts.hours.textContent = pad(hours);
    parts.minutes.textContent = pad(minutes);
    parts.seconds.textContent = pad(seconds);
  };

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

const bikeFrames = [
  "assets/bike/rebel-1.png",
  "assets/bike/rebel-2.png",
  "assets/bike/rebel-3.png",
  "assets/bike/rebel-4.png",
  "assets/bike/rebel-5.png"
];
const bikeImage = document.querySelector("[data-bike-frame]");
const bikeSlider = document.querySelector("[data-bike-slider]");
const bikePlay = document.querySelector("[data-bike-play]");
const bikeStage = document.querySelector(".viewer-stage");
let bikeIndex = 0;
let bikeAuto = true;

function setBikeFrame(index) {
  if (!bikeImage || !bikeSlider) return;
  bikeIndex = (index + bikeFrames.length) % bikeFrames.length;
  bikeStage?.classList.add("is-changing");
  bikeImage.src = bikeFrames[bikeIndex];
  bikeSlider.value = String(bikeIndex);
  window.setTimeout(() => bikeStage?.classList.remove("is-changing"), 180);
}

document.querySelector(".viewer-control.prev")?.addEventListener("click", () => {
  bikeAuto = false;
  if (bikePlay) bikePlay.textContent = "Reprendre auto";
  setBikeFrame(bikeIndex - 1);
});

document.querySelector(".viewer-control.next")?.addEventListener("click", () => {
  bikeAuto = false;
  if (bikePlay) bikePlay.textContent = "Reprendre auto";
  setBikeFrame(bikeIndex + 1);
});

bikeSlider?.addEventListener("input", () => {
  bikeAuto = false;
  if (bikePlay) bikePlay.textContent = "Reprendre auto";
  setBikeFrame(Number(bikeSlider.value));
});

bikePlay?.addEventListener("click", () => {
  bikeAuto = !bikeAuto;
  bikePlay.textContent = bikeAuto ? "Pause auto" : "Reprendre auto";
});

window.setInterval(() => {
  if (bikeAuto) setBikeFrame(bikeIndex + 1);
}, 1800);

document.querySelectorAll(".magnetic").forEach((button) => {
  button.addEventListener("mousemove", (event) => {
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    button.style.transform = `translate(${x * 0.08}px, ${y * 0.14}px)`;
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "";
  });
});

const canvas = document.querySelector(".spark-canvas");
const ctx = canvas?.getContext("2d");
let sparks = [];
let width = 0;
let height = 0;

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function seedSparks() {
  sparks = Array.from({ length: 48 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0.35 + Math.random() * 1.4,
    vy: -0.8 - Math.random() * 1.8,
    size: 1 + Math.random() * 2.4,
    life: 0.25 + Math.random() * 0.75
  }));
}

function drawSparks() {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  sparks.forEach((spark) => {
    spark.x += spark.vx;
    spark.y += spark.vy;
    spark.life -= 0.002;
    if (spark.y < -20 || spark.x > width + 20 || spark.life <= 0) {
      spark.x = Math.random() * width * 0.9;
      spark.y = height + Math.random() * 120;
      spark.life = 0.25 + Math.random() * 0.75;
    }

    ctx.globalAlpha = Math.max(0, spark.life);
    ctx.fillStyle = "#ff6a00";
    ctx.beginPath();
    ctx.ellipse(spark.x, spark.y, spark.size * 0.55, spark.size * 2.2, -0.65, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  requestAnimationFrame(drawSparks);
}

bindProductButtons();
bindGiftCardForm();
renderCartPage();
renderPaymentPage();
clearCartAfterStripeReturn();
bindDropProgress();
bindSiteIntro();
bindAccountPage();
bindHeroVideoSound();
updateCartCount();

if (canvas && ctx && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  resizeCanvas();
  seedSparks();
  drawSparks();
  window.addEventListener("resize", () => {
    resizeCanvas();
    seedSparks();
  });
}

