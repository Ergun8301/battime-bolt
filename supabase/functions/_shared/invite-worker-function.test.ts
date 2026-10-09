// Lance invite-worker-function.check.ts (la fonction `invite-worker` de bout en
// bout, base et e-mails simulés) dans un Deno à part : la fonction importe
// supabase-js depuis npm, dont les dépendances ne doivent pas être cherchées
// dans le node_modules du site (package.json à la racine). D'où DENO_NO_PACKAGE_JSON.
//   deno test -A supabase/functions/   (ce fichier est pris avec les autres)

Deno.test('Invitations — fonction invite-worker de bout en bout (base simulée)', async () => {
  const check = new URL('./invite-worker-function.check.ts', import.meta.url).pathname;
  const out = await new Deno.Command(Deno.execPath(), {
    args: ['test', '-A', '--quiet', '--no-lock', check],
    env: { DENO_NO_PACKAGE_JSON: '1', NO_COLOR: '1' },
    stdout: 'piped', stderr: 'piped',
  }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  console.log(text.split('\n').filter((l) => /\.\.\. (ok|FAILED)|passed|failed|error/i.test(l)).join('\n'));
  if (!out.success) throw new Error(`invite-worker-function.check.ts a échoué :\n${text}`);
});
