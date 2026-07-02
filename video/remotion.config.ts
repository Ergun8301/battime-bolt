import { Config } from '@remotion/cli/config';

// Headless shell préinstallé du conteneur (celui de Playwright) : évite tout
// re-téléchargement de navigateur au moment du rendu. Le Chrome complet ne
// suffit pas (l'ancien mode headless en a été retiré) — il faut le shell dédié.
Config.setBrowserExecutable('/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
