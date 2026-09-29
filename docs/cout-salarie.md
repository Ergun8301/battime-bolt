# Coût réel d'un salarié — lot 2

Le patron dépose un bulletin de paie : l'IA lit 4 chiffres, il valide, BEMEXO
connaît le **vrai coût horaire** du salarié et la **vraie rentabilité** des chantiers.

## Parcours

| Où | Quoi |
|---|---|
| Fiche salarié → « Coût réel » | Déposer un bulletin (PDF / photo) ou saisir à la main → vérifier → **Valider** |
| Réglages → « Caisse de congés BTP » | Interrupteur + taux (20,70 % par défaut) |
| Chantiers | « Coût réel des heures » à côté du budget (calculs existants inchangés) |

## Règles de calcul

- Coût d'un bulletin = (total employeur + brut × taux congés BTP si activé) ÷ heures payées
- Coût horaire réel = moyenne des **3 derniers** bulletins validés (par mois)
- Coût réel d'un chantier = Σ heures pointées × coût réel de chaque salarié ; les salariés sans bulletin sont signalés, jamais comptés à 0 €

## Confidentialité

- Le **fichier** n'est jamais stocké : lu en mémoire, envoyé au modèle, oublié.
- Seuls 4 chiffres validés sont gardés (`payslip_figures`). Jamais le n° de sécu.
- Aucun contenu de bulletin dans les logs.
- RLS : admin de l'entreprise uniquement. Un salarié ne voit ni son coût ni celui des autres.

## IA

- `supabase/functions/_shared/ai-provider.ts` : seul fichier à changer pour un autre fournisseur.
- Modèle via `AI_MODEL` (défaut `gemini-3.1-flash-lite`), clé `GEMINI_API_KEY`.
- Réponse JSON imposée + contrôle : total employeur > brut, heures entre 1 et 250 ; sinon champ vide « à vérifier ».
- Sans clé : « Lecture automatique indisponible, saisissez les chiffres » — la saisie manuelle marche.

## Préview (sans base ni compte)

`/apercu/cout-salarie?demo=cout` — actif **uniquement** sur les préviews (`isPreviewHost()`).

## Mise en service (après feu vert)

1. Migration `supabase/migrations/20260929140000_lot2_cout_salarie.sql`
2. Secrets : `GEMINI_API_KEY` (obligatoire pour la lecture auto), `AI_MODEL` (facultatif)
3. Fonction : `supabase functions deploy payslip-read`
4. `UPDATE public.companies SET ai_enabled = true WHERE id = '…';`

## Tests

`npm run test:cout` (calculs, cohérence, IA simulée) · `npm run test:cout-rls` (RLS sur un Postgres jetable)
