import Script from "next/script";
import "../styles.css";

export const metadata = {
  title: "TMRR - No Rules. Just Ride.",
  description:
    "Boutique officielle TMRR. T-shirts noirs, esprit rebel, collection limitee et grand concours Honda Rebel."
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <Script src="/script.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
