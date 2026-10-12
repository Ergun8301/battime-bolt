# Formations (lot 6, oct. 2026)

Le bureau ajoute une formation : un titre, puis **un lien YouTube, Vimeo ou Google Drive** ou **un document déjà téléversé** dans « Documents » d'un chantier ; pour **toute l'équipe** (y compris les nouveaux venus) ou **certains salariés**. Le salarié (ou le chef d'équipe) la voit dans son appli (« Formations »), l'ouvre dans un nouvel onglet et coche « Vue ». Le bureau voit qui l'a vue, et quand.

- **Bureau** : « Salariés » → « Formations » (et le menu du téléphone). « + Ajouter », la liste « x/y vues », un clic montre ✓ / « pas encore ». « Retirer » (les « Vue » restent), « Remettre ». Pas de modification ni d'effacement en V1.
- **Salarié** : bandeau « N formations à voir › » sur « Ma journée » tant qu'il en reste ; entrée « Formations » du menu dès qu'il y en a une. « Ouvrir ↗ » est un vrai lien (`target=_blank`, `rel="noopener noreferrer"`) ; « Vue » se coche à la main, « Annuler » pendant 10 s (la base accepte 10 min).
- **Notification** : send-push (mode bureau, déjà en production) aux seuls destinataires. Jamais d'e-mail.
- **Pas d'hébergement vidéo, pas d'iframe.** La base n'accepte qu'un lien `https` vers youtube.com (www., m.), youtu.be, vimeo.com (www.), player.vimeo.com, drive.google.com, docs.google.com ; `http` est converti en `https` ; `javascript:`, `data:`, un autre site, un identifiant ou un port sont refusés (à l'écran **et** par la base).
- **Documents** : seulement ceux de l'entreprise, ni photo, ni facture, ni devis ; lien signé 1 h (bucket privé `chantier-docs`, même code que « Documents »).
- Rien ne compte comme heures : totaux, export, coûts, relances et borne ne lisent pas ces tables.

## Migration

`supabase/migrations/20261010210000_lot6_formations.sql` — **pas encore appliquée** (Cowork la relit et l'applique). 100 % additive : tables `trainings`, `training_views`, fonctions `my_trainings()`, `set_training_seen()`, garde `guard_training_write()`. RLS limitée à l'entreprise, droits par colonne, anon exclu. Le fichier contient la **VÉRIFICATION APRÈS APPLICATION** (une ligne, 10 colonnes à `true`) et le **RETOUR ARRIÈRE**.

Tant qu'elle n'est pas appliquée, l'application est exactement celle d'avant (lecture en échec silencieux : PGRST205 / PGRST202).

Aperçu : il lit la base de production. Une fois la migration appliquée, une formation ajoutée sur l'aperçu envoie de vraies notifications — n'essayer que dans l'entreprise de test.

## Tester

- `npm run test:formations` — règles pures (liens, public, « qui l'a vue », messages), Deno.
- `npm run test:formations-db` — la migration sur un Postgres jetable (PGlite) : isolation des entreprises, droits, « Vue » pour soi seul, retour arrière.
- `npm run build` puis `npm run test:formations-ecrans` — les vrais écrans sur une base simulée ; captures dans `docs/captures-lot6/` (« avant » : `AVANT=1` sur le build d'avant).

## Lot 13 : vidéos envoyées directement

Le bureau peut aussi **filmer ou choisir une vidéo** (MP4, MOV, WebM ; 50 Mo par fichier, 100 Mo par entreprise, forfait gratuit), que le salarié regarde dans l'appli. Tables, bucket et fonctions à part : la table `trainings` ci-dessus n'est pas modifiée. Voir [videos.md](videos.md).
