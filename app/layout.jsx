```jsx
import Script from "next/script";
import "../styles.css";

export const metadata = {
  title: "TMRR - No Rules. Just Ride.",
  description:
    "Boutique officielle TMRR. T-shirts noirs, esprit rebel, collection limitee et grand concours Honda Rebel.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        {children}

        <Script src="/script.js" strategy="afterInteractive" />

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-64333P3D88"
          strategy="afterInteractive"
        />

        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-64333P3D88');
          `}
        </Script>
      </body>
    </html>
  );
}
```
