## Ce que fait cette PR

<!-- Une ou deux phrases : quoi, et pourquoi. -->

## Registre de l'assistant

<!--
  L'assistant ne sait faire (ou guider) que ce que le registre connaît (supabase/functions/_shared/registre/).
  `npm run test:couverture` échoue quand le code a une entrée que rien ne porte (nouveau RPC, nouvelle fenêtre,
  nouvelle ancre data-guide, nouvelle écriture dans lib/). Il ne voit PAS un bouton neuf branché sur une écriture
  qui existe déjà : c'est cette case-ci qui le rattrape.
-->

**J'ai ajouté ou changé un bouton, une fenêtre, un RPC ?**

- [ ] Non, aucun des trois.
- [ ] Oui, et ce geste est porté par la capacité (id : `B…` / `S…`) : …
- [ ] Oui, et ce n'est pas une capacité, parce que : … (menu, légende, route publique : `interne-*.ts`, raison d'au moins 30 caractères ; jamais une écriture)

**Contrôles**

- [ ] `clics.snapshot.json` régénéré, capacité nommée ci-dessus. À cocher si le nombre de `onClick` / `onSelect` / `onSubmit` d'un fichier a augmenté ; sinon « sans objet ». Commande : `REGISTRE_REGENERER=clics npx -y deno@2 test --allow-env --allow-read --allow-write supabase/functions/_shared/registre-couverture.test.ts`
- [ ] `dettes.json` régénéré si une dette, un écart, une entrée interne ou une écriture non assistée a changé (même commande avec `REGISTRE_REGENERER=dettes` ; le plafond doit baisser dans la même PR qu'une dette fermée, et ne monte qu'en revue explicite).
- [ ] Un nouvel outil ou ouvreur a son cas d'évaluation (`assistant-eval/cases.ts`).
- [ ] `npm run test:couverture` vert en local.

## Vérifications

- [ ] `npm run typecheck`
- [ ] Les tests du domaine touché sont lancés (indiquer lesquels) : …
