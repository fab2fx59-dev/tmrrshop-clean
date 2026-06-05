export const metadata = {
  title: "Fidélité TMRR",
  description: "Programme fidélité TMRR : 1 euro dépensé = 1 point, 100 points = 15 % de remise."
};

export default function FidelityPage() {
  return (
    <>
      <canvas className="spark-canvas" aria-hidden="true"></canvas>
      <div className="site-noise" aria-hidden="true"></div>
      <div className="top-strip">
        <div className="ticker">
          <span>Fidélité TMRR</span>
          <span>1 EUR dépensé = 1 point</span>
          <span>100 points = -15 %</span>
        </div>
      </div>
      <header className="site-header">
        <video className="nav-video" src="/assets/nav/nav-bg.mp4" autoPlay muted loop playsInline preload="metadata" aria-hidden="true"></video>
        <a className="brand" href="/">
          <img src="/assets/brand/logo-dragon-white.png" alt="TMRR" />
        </a>
        <nav className="nav" aria-label="Navigation principale">
          <a href="/">Accueil</a>
          <a href="/tshirts">T-shirts</a>
          <a href="/casquettes">Casquettes</a>
          <a href="/hoodies">Sweats à capuches</a>
          <a href="/bandanas">Bandanas</a>
          <a href="/compte">Compte</a>
        </nav>
        <a className="cart-pill" href="/panier">
          <span>Panier</span>
          <strong>0</strong>
        </a>
      </header>
      <main>
        <section className="page-hero">
          <p className="eyebrow">Programme fidélité</p>
          <h1>Rouler fidèle, gagner plus.</h1>
          <p className="hero-lead">
            Chaque euro dépensé chez TMRR te rapproche d'une remise. Simple, direct, sans blabla.
          </p>
        </section>
        <section className="category-products section-dark">
          <div className="loyalty-page">
            <article className="account-card">
              <span className="step-number">01</span>
              <h2>Tu commandes</h2>
              <p>Chaque commande payée ajoute des points à ton espace client.</p>
            </article>
            <article className="account-card featured">
              <span className="step-number">02</span>
              <h2>Tu cumules</h2>
              <p>
                <strong>1 euro dépensé = 1 point fidélité.</strong>
              </p>
            </article>
            <article className="account-card">
              <span className="step-number">03</span>
              <h2>Tu débloques</h2>
              <p>À 100 points, tu peux générer un code promo de 15 %, valable une seule fois au paiement.</p>
            </article>
          </div>
          <div className="loyalty-cta">
            <a className="btn btn-primary magnetic" href="/compte">Voir mes points</a>
            <a className="btn btn-ghost magnetic" href="/tshirts">Gagner des points</a>
          </div>
        </section>
      </main>
    </>
  );
}
