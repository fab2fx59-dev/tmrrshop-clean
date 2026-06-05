/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    const pages = [
      "bandanas",
      "carte-kdo",
      "casquettes",
      "club",
      "compte",
      "confidentialite",
      "contact",
      "faq",
      "hoodies",
      "livraison-retours",
      "mentions-legales",
      "paiement",
      "panier",
      "reglement-concours",
      "tshirts"
    ];

    return [
      { source: "/index.html", destination: "/", permanent: false },
      ...pages.map((page) => ({
        source: `/${page}.html`,
        destination: `/${page}`,
        permanent: false
      }))
    ];
  }
};

module.exports = nextConfig;
