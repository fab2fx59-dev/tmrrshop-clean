# TMRR Storefront

Boutique TMRR en cours de migration vers Next.js, Supabase et Stripe.

## Contenu principal

- `app/` : nouvelle base Next.js.
- `assets/` : sources des images et videos.
- `public/assets/` : copie servie par Next.js.
- `styles.css` : direction artistique, responsive et animations.
- `script.js` : interactions historiques du prototype.
- `supabase-schema.sql` : tables Supabase deja preparees.
- `.env.local` : configuration locale Supabase, a ne pas envoyer sur Git.

## Lancer la version Next.js

Depuis ce dossier :

```powershell
npm install
$env:NODE_OPTIONS='--use-system-ca'
& "C:\Program Files\nodejs\node.exe" .\node_modules\next\dist\bin\next dev
```

Puis ouvrir :

```text
http://localhost:3000
```

## Configuration production a completer

Avant un vrai paiement :

- ajouter `STRIPE_SECRET_KEY` dans Vercel.
- ajouter `STRIPE_WEBHOOK_SECRET` dans Vercel.
- ajouter `SUPABASE_SERVICE_ROLE_KEY` dans Vercel, uniquement cote serveur.
- ajouter `NEXT_PUBLIC_SITE_URL` avec l'adresse finale du site.

Ne jamais publier `.env.local`.

Deploiement Vercel pret.
