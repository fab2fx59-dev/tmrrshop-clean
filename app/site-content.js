import fs from "node:fs";
import path from "node:path";

export const pageFiles = {
  "bandanas": "bandanas.html",
  "carte-kdo": "carte-kdo.html",
  "casquettes": "casquettes.html",
  "club": "club.html",
  "compte": "compte.html",
  "confidentialite": "confidentialite.html",
  "contact": "contact.html",
  "faq": "faq.html",
  "hoodies": "hoodies.html",
  "intro-preview": "intro-preview.html",
  "livraison-retours": "livraison-retours.html",
  "mentions-legales": "mentions-legales.html",
  "paiement": "paiement.html",
  "panier": "panier.html",
  "reglement-concours": "reglement-concours.html",
  "tshirts": "tshirts.html"
};

const root = process.cwd();

function extractBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

function normalizeLinks(html) {
  return html
    .replace(/\s*<link[^>]+href=["']styles\.css["'][^>]*>/gi, "")
    .replace(/\s*<script[^>]+src=["']script\.js["'][^>]*>\s*<\/script>/gi, "")
    .replace(/(href|src)=["']assets\//g, '$1="/assets/')
    .replace(/href=["']index\.html(#[^"']*)?["']/g, (_, hash = "") => `href="/${hash}"`)
    .replace(
      /href=["']([a-z0-9-]+)\.html(#[^"']*)?["']/gi,
      (_, page, hash = "") => `href="/${page}${hash}"`
    );
}

export function getPageHtml(fileName) {
  const filePath = path.join(root, fileName);
  const html = fs.readFileSync(filePath, "utf8");
  return normalizeLinks(extractBody(html));
}
