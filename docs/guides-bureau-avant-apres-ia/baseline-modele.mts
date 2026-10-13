// Avant/après de la VOIE MODÈLE : fromFunctionCall('repondre') pour les 47 phrases bureau, deux réponses possibles.
import { CASES, ADMIN_RAW, ME } from '../../supabase/functions/assistant-eval/cases.ts';
import * as A from '../../supabase/functions/_shared/assistant-actions-core.ts';
const out: Record<string, unknown> = {};
const bureau = CASES.filter((c) => c.cote === 'bureau');
out._count = bureau.length;
for (const c of bureau) {
  const mk = () => { const ctx = A.buildActionContext(ADMIN_RAW as never) as A.ActionContext; ctx.me = ME; ctx.demande = c.phrase; return ctx; };
  const g = A.findGuide(c.phrase);
  out[c.id] = {
    ok: A.fromFunctionCall('repondre', { reponse: 'ok' }, mk()),
    fiche: g ? A.fromFunctionCall('repondre', { reponse: A.guideAnswer(g) }, mk()) : null,
    fiche_avec_lien: g ? A.fromFunctionCall('repondre', { reponse: A.guideAnswer(g), liens: [g.lien] }, mk()) : null,
  };
}
console.log(JSON.stringify(out, null, 1));
