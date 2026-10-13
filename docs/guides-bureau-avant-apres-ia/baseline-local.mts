import { CASES, ADMIN_RAW, ME } from '../../supabase/functions/assistant-eval/cases.ts';
import * as A from '../../supabase/functions/_shared/assistant-actions-core.ts';
const out: Record<string, unknown> = {};
const enc = new TextEncoder();
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');
out.guideForPrompt_sha256 = await sha(A.guideForPrompt());
for (const c of CASES.filter((c) => c.cote === 'bureau' && !c.file)) {
  const ctx = A.buildActionContext(ADMIN_RAW as never) as A.ActionContext; ctx.me = ME; ctx.demande = c.phrase;
  out[c.id] = A.handleActionLocally(c.phrase, ctx);
}
// Prompt complet pour 1 phrase
const ctx = A.buildActionContext(ADMIN_RAW as never) as A.ActionContext; ctx.me = ME;
out.prompt_sha256 = await sha(A.actionPrompt(ctx, '{}', A.guideForPrompt(), 'x'));
console.log(JSON.stringify(out, null, 1));
