# Assistant BEMEXO — lot 3

Un seul bouton « Assistant BEMEXO » (admin). On écrit, ou on appuie sur 🎤 et on parle.

| Point | Comment |
|---|---|
| Dictée | Reconnaissance vocale du navigateur / téléphone (fr-FR). Absente → micro masqué. |
| Réponses | 1 à 3 phrases, chiffres, jusqu'à 3 liens (coûts, congés, fiche salarié) |
| Suggestions | 4 questions au démarrage |
| Données | Lues avec le jeton du patron (ses droits, sa RLS), résumées en instantané. Lecture seule. |
| Paie | Jamais : ni taux horaire, ni bulletin, ni n° de sécu. Seulement des totaux par chantier. |
| Stockage | Rien, sauf un compteur (entreprise, jour, nombre) pour le quota. Aucun log de contenu. |
| Quota | 50 questions / jour / entreprise (`ASSISTANT_DAILY_LIMIT`), message clair au-delà |
| IA | Même module que le lot 2 (`_shared/ai-provider.ts`), modèle `AI_MODEL` |
| Interrupteur | `companies.ai_enabled` (verrouillé : clé service / éditeur SQL uniquement) |

## Préview (sans base ni compte)

`/apercu/assistant?demo=assistant` — préviews uniquement.

## Mise en service (après feu vert)

1. Migration `supabase/migrations/20260929160000_lot3_assistant_bureau.sql`
2. Secrets : `GEMINI_API_KEY` (déjà là pour le lot 2), `ASSISTANT_DAILY_LIMIT` (facultatif)
3. `supabase functions deploy assistant`

## Tests

`npm run test:assistant` (instantané, liens, IA simulée) · `npm run test:assistant-quota` (quota sur Postgres jetable)
