// Lot 11 — lance kiosk-function.check.ts (la fonction `kiosk` de bout en bout,
// base simulée) dans un Deno à part : la fonction importe supabase-js depuis
// jsr, dont les dépendances npm ne doivent pas être cherchées dans le
// node_modules du site (package.json à la racine). D'où DENO_NO_PACKAGE_JSON.
//   deno test -A supabase/functions/   (ce fichier est pris avec les autres)

Deno.test('Lot 11 — fonction kiosk de bout en bout (base simulée)', async () => {
  const check = new URL('./kiosk-function.check.ts', import.meta.url).pathname;
  const out = await new Deno.Command(Deno.execPath(), {
    args: ['test', '-A', '--quiet', '--no-lock', check],
    env: { DENO_NO_PACKAGE_JSON: '1', NO_COLOR: '1' },
    stdout: 'piped', stderr: 'piped',
  }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  console.log(text.split('\n').filter((l) => /\.\.\. (ok|FAILED)|passed|failed|error/i.test(l)).join('\n'));
  if (!out.success) throw new Error(`kiosk-function.check.ts a échoué :\n${text}`);
});
