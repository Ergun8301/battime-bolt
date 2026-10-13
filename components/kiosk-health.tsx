'use client';

// Lot 30 (borne robuste) — ce que le bureau sait de l'ÉCRAN de la tablette, en
// phrases courtes, dans la fenêtre « Borne » (components/kiosk-admin.tsx).
//
// Les phrases viennent de supabase/functions/_shared/kiosk-client-state.ts
// (kioskNotices) : « L'écran de la tablette peut s'éteindre : réglez Verrouillage
// auto sur Jamais » / « Ouvrez la borne depuis l'icône installée » / « Tablette
// hors ligne depuis … ». Rien du tout tant que la tablette n'a jamais envoyé son
// état (ancienne page, fonction `kiosk` ou migration pas encore en ligne), ou
// quand l'état est périmé et que la tablette n'est pas non plus « hors ligne ».
//
// Accessibilité : une région « status » (lue sans voler le focus), des phrases
// complètes (pas seulement une couleur ou une icône), des boutons de 44 px.
import type { KioskNotice } from '../supabase/functions/_shared/kiosk-client-state';

const CSS = `
.kh-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;min-width:0}
.kh-note{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px 10px;border:1.5px solid rgba(240,145,90,.55);background:#FFF1E6;border-radius:12px;padding:10px 12px;color:#15120F;min-width:0}
.kh-note.kh-off{border-color:rgba(21,18,15,.18);background:#F3EFE6}
.kh-ic{flex:none;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#F0915A;color:#15120F;font-weight:900;font-size:13px;line-height:1;margin-top:1px}
.kh-off .kh-ic{background:#8a8378;color:#fff}
.kh-body{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:2px}
.kh-txt{font-size:14px;font-weight:800;line-height:1.4;overflow-wrap:anywhere}
.kh-hint{font-size:12.5px;font-weight:600;line-height:1.35;color:#6b5a4a}
.kh-btn{flex:none;min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid #15120F;background:#fff;color:#15120F;border-radius:10px;padding:8px 14px;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;margin-left:30px}
.kh-btn:focus-visible{outline:3px solid #15120F;outline-offset:2px}
`;
const CSS_HTML = { __html: CSS };

/** Le nom accessible de chaque bouton commence par le texte visible (« Voir comment ») et dit de QUOI il s'agit : deux boutons au même nom seraient indiscernables au lecteur d'écran. */
const HELP_LABEL: Record<string, string> = {
  wake: 'garder l’écran de la tablette allumé',
  install: 'ouvrir la borne depuis l’icône installée',
};

export function KioskNotices({ notices, onHelp }: { notices: KioskNotice[]; onHelp: () => void }) {
  if (!notices.length) return null;
  return (
    <>
      <style dangerouslySetInnerHTML={CSS_HTML} />
      <div role="status" aria-label="À savoir sur la tablette" data-testid="ka-notices">
        <ul className="kh-list">
        {notices.map((n) => (
          <li key={n.id} className={`kh-note${n.id === 'offline' ? ' kh-off' : ''}`} data-testid={`ka-notice-${n.id}`}>
            <span className="kh-ic" aria-hidden="true">{n.id === 'offline' ? '…' : '!'}</span>
            <span className="kh-body">
              <span className="kh-txt">{n.text}</span>
              {n.hint && <span className="kh-hint">{n.hint}</span>}
            </span>
            {n.help && (
              <button type="button" className="kh-btn" data-testid={`ka-notice-help-${n.id}`} aria-label={`Voir comment : ${HELP_LABEL[n.id] ?? n.text}`} onClick={onHelp}>
                Voir comment
              </button>
            )}
          </li>
        ))}
        </ul>
      </div>
    </>
  );
}
