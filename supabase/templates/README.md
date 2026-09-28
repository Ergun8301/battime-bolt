# Modèles d’e-mails d’authentification (Supabase)

À coller dans Supabase → Authentication → Emails (voir `CONFIG-EMAILS.md` à la racine).

| Modèle Supabase | Fichier | Objet |
|---|---|---|
| Confirm signup | `confirmation.html` | `Confirmez votre adresse e-mail — BEMEXO` |
| Invite user | `invite.html` | `Invitation à rejoindre votre équipe sur BEMEXO` |
| Reset password | `recovery.html` | `Réinitialisez votre mot de passe BEMEXO` |
| Change email address | `email_change.html` | `Confirmez votre nouvelle adresse e-mail — BEMEXO` |
| Magic link | `magic_link.html` | `Votre lien de connexion BEMEXO` |

Tous les liens pointent vers `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…` (page `app/auth/confirm`), donc sur bemexo.com : plus aucun lien vers supabase.co dans les e-mails.

Aucune image : le logo est du texte (BEMEXO en jaune sur noir). Un seul bouton, et le même lien en clair en dessous.

`{{ .Data.first_name }}` et `{{ .Data.employer_name }}` viennent des métadonnées posées à l’inscription et par la fonction `invite-worker`. S’ils manquent, le texte reste correct (« Bonjour, », « Votre employeur »).
