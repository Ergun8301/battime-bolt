// Lance staff-email-function.check.ts (la fonction `send-staff-email` de bout en
// bout, base et service d'e-mail simulés, AUCUN e-mail envoyé) dans un Deno à part :
// la fonction importe supabase-js depuis npm, dont les dépendances ne doivent pas être
// cherchées dans le node_modules du site (package.json à la racine). D'où DENO_NO_PACKAGE_JSON.
//   deno test -A supabase/functions/   (ce fichier est pris avec les autres)

Deno.test('E-mails du bureau — fonction send-staff-email de bout en bout (monde simulé)', async () => {
  const check = new URL('./staff-email-function.check.ts', import.meta.url).pathname;
  const out = await new Deno.Command(Deno.execPath(), {
    args: ['test', '-A', '--quiet', '--no-lock', check],
    env: { DENO_NO_PACKAGE_JSON: '1', NO_COLOR: '1' },
    stdout: 'piped', stderr: 'piped',
  }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  console.log(text.split('\n').filter((l) => /\.\.\. (ok|FAILED)|passed|failed|error/i.test(l)).join('\n'));
  if (!out.success) throw new Error(`staff-email-function.check.ts a échoué :\n${text}`);
});
