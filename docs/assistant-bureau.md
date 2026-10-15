# Assistant BEMEXO — lot 3

Un seul bouton « Assistant BEMEXO » (admin). On écrit, ou on appuie sur 🎤 et on parle.

| Point | Comment |
|---|---|
| Dictée | Reconnaissance vocale du navigateur / téléphone (fr-FR). Absente → micro masqué. |
| Réponses | 1 à 3 phrases, chiffres, jusqu'à 3 liens (coûts, congés, fiche salarié) |
| Suggestions | 4 questions au démarrage |
| Données | Lues avec le jeton du patron (ses droits, sa RLS), résumées en instantané. Lecture seule. |
| Paie | Jamais : ni taux horaire, ni bulletin, ni n° de sécu. Seulement des totaux par chantier. |
| Stockage | Un compteur (entreprise, jour, nombre) pour le quota. Depuis l'étape 2, le TEXTE des conversations (privé, 30 jours : voir « Chat avec mémoire » plus bas). Aucun log de contenu. |
| Quota | 50 questions / jour / entreprise (`ASSISTANT_DAILY_LIMIT`), message clair au-delà |
| IA | Même module que le lot 2 (`_shared/ai-provider.ts`), réglé par `AI_CONFIG` (lot 6, voir `docs/ia-v2.md` : `AI_MODEL` n'est plus lu) |
| Interrupteur | `companies.ai_enabled` (verrouillé : clé service / éditeur SQL uniquement) |

## Préview (sans base ni compte)

`/apercu/assistant?demo=assistant` — préviews uniquement.

## Mise en service (après feu vert)

1. Migration `supabase/migrations/20260929160000_lot3_assistant_bureau.sql`
2. Secrets : `AI_API_KEY` ou `GEMINI_API_KEY` (déjà là pour le lot 2 ; `ANTHROPIC_API_KEY` en plus, ou à la place, si `AI_CONFIG` utilise Claude : voir `docs/ia-v2.md`), `AI_CONFIG` (facultatif, lot 6), `ASSISTANT_DAILY_LIMIT` (facultatif)
3. `supabase functions deploy assistant`

## Chat avec mémoire (étape 2)

Le panneau est un chat. Il se souvient du sujet (« et pour Lucas aussi ? », « pareil demain », « annule ça ») : à chaque demande l'écran envoie `history`,
les 7 derniers messages TEXTE de la conversation en cours. « ＋ Nouveau chat » repart d'une page blanche. « Historique » liste ses conversations pour les
rouvrir et les CONTINUER, en supprimer une ou tout effacer (confirmation dans la ligne, pas de fenêtre du navigateur).

- **Privé** : chaque conversation n'est lisible que par son auteur (le patron ne lit pas le chat d'un salarié, ni le support BEMEXO) ; conservée 30 jours après la dernière activité, puis supprimée.
- **Texte seulement** : jamais une pièce jointe, jamais une carte d'action (un ancien chat rouvert montre du texte), jamais un message d'erreur ou de quota.
- **L'assistant marche même si l'enregistrement échoue** (l'erreur est avalée, rien n'est écrit dans la console). Si la conversation de l'écran a disparu (supprimée depuis un autre onglet) ou est pleine (200 messages), le tour est enregistré dans un nouveau chat et une ligne discrète le dit.
- **Rien ne disparaît en cours de route** : « Nouveau chat », la réouverture d'une conversation et la suppression de celle de l'écran sont refusés tant qu'une réponse arrive ou qu'une carte écrit (« Je le fais… ») ; une fiche pas encore confirmée demande « Abandonner cette action ? ». Une demande qui dépasse 60 s est abandonnée (« L’assistant met trop de temps à répondre »).
- **Clavier** : la confirmation de suppression a le focus sur « Non » ; le focus ne retombe jamais en haut de la page ; « Conversation supprimée » est annoncé.

Le détail (contrat, limites, tests) : `docs/ia-v2.md` § H. Captures : `docs/captures-assistant-historique/` (390 px et 1280 px).

## Tests

`npm run test:assistant` (instantané, liens, IA simulée) · `npm run test:assistant-quota` (quota sur Postgres jetable) · `npm run test:assistant-historique` (écran du chat : mémoire, nouveau chat, historique ; après `npm run build`)
