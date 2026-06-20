import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Battime — Les heures du batiment, pointees sur le chantier',
  description:
    'Vos equipes pointent depuis leur telephone, vous recuperez tout en temps reel — propre, pret pour la paie. Essayez Battime gratuitement pendant 30 jours.',
};

// Portage fidele de la maquette Claude Design (noir + jaune chantier).
// Le markup provient de la maquette HTML/CSS ; styles inline conserves a
// l'identique pour la fidelite, + quelques classes lp-* pour le responsive
// mobile (defini dans STYLES). Pourra etre decoupe en composants plus tard.
const STYLES = `@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
.lp{font-family:'Archivo',sans-serif;background:#F2EDE3;color:#15120F;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden;width:100%;min-height:100vh}
.lp *{box-sizing:border-box;margin:0;padding:0}
.lp ::selection{background:#FFC21A;color:#15120F}
.lp img{display:block;max-width:100%}
.lp section[id]{scroll-margin-top:72px}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:.15}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@media(max-width:880px){
 .lp-hero-grid{grid-template-columns:1fr !important;gap:36px !important;padding-top:40px !important;padding-bottom:56px !important}
 .lp-hero-visual{height:520px !important;max-width:430px;margin:0 auto;width:100%}
 .lp-2col{grid-template-columns:1fr !important}
 .lp-3col{grid-template-columns:1fr !important}
 .lp-tarif-grid{grid-template-columns:1fr !important;max-width:380px !important}
 .lp-bureau-grid{grid-template-columns:1fr !important;gap:34px !important}
 .lp-temoignage-grid{grid-template-columns:1fr !important;justify-items:center;text-align:center;gap:22px !important}
 .lp-nav{display:none !important}
 .lp h1{font-size:38px !important;line-height:1.04 !important}
 .lp h2{font-size:30px !important}
 .lp-footer-row{flex-direction:column !important;text-align:center;gap:18px !important}
}
@media(max-width:560px){
 .lp-hide-sm{display:none !important}
 .lp h1{font-size:34px !important;line-height:1.05 !important}
 .lp h2{font-size:26px !important}
 .lp-tarif-sec{padding:32px 18px 56px !important}
}`;

const BODY = `<!-- ============ HEADER ============ -->
  <header style="position:sticky;top:0;z-index:50;background:rgba(242,237,227,.85);backdrop-filter:blur(10px);border-bottom:1px solid rgba(21,18,15,.12)">
    <div style="max-width:1200px;margin:0 auto;padding:16px 28px;display:flex;align-items:center;justify-content:space-between;gap:24px">
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:34px;height:34px;background:#15120F;border-radius:7px;display:flex;align-items:center;justify-content:center;position:relative">
          <div style="width:14px;height:14px;border:2.5px solid #FFC21A;border-radius:50%;border-top-color:transparent;transform:rotate(45deg)"></div>
        </div>
        <span style="font-weight:900;font-size:21px;letter-spacing:-.02em">Battime</span>
      </div>
      <nav class="lp-nav" style="display:flex;align-items:center;gap:26px;font-size:14.5px;font-weight:600;color:#3a352f;white-space:nowrap">
        <a href="#probleme" style="color:inherit;text-decoration:none">Le problème</a>
        <a href="#etapes" style="color:inherit;text-decoration:none">Comment ça marche</a>
        <a href="#metiers" style="color:inherit;text-decoration:none">Pour qui</a>
        <a href="#tarif" style="color:inherit;text-decoration:none">Tarif</a>
      </nav>
      <div style="display:flex;align-items:center;gap:14px">
        <a href="/connexion" class="lp-hide-sm" style="font-size:14.5px;font-weight:700;color:#15120F;text-decoration:none">Se connecter</a>
        <a href="#tarif" style="background:#FFC21A;color:#15120F;font-weight:800;font-size:14.5px;padding:11px 18px;border-radius:9px;text-decoration:none;box-shadow:0 2px 0 #C99300">Essayer gratuitement</a>
      </div>
    </div>
  </header>

  <!-- ============ HERO ============ -->
  <section style="position:relative;background:#F2EDE3">
    <div class="lp-hero-grid" style="max-width:1200px;margin:0 auto;min-height:calc(100vh - 72px);padding:40px 28px;display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;align-content:center">

      <!-- LEFT -->
      <div data-reveal style="">
        <div style="display:inline-flex;align-items:center;gap:9px;background:#15120F;color:#FFC21A;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;padding:7px 13px;border-radius:6px;margin-bottom:26px">
          <span style="width:7px;height:7px;background:#FFC21A;border-radius:50%;animation:blink 1.4s infinite"></span>
          BTP · Artisans · Intérim
        </div>
        <h1 style="font-size:60px;line-height:.98;font-weight:900;letter-spacing:-.025em;margin-bottom:22px">
          Les heures de vos gars,<br>pointées <span style="color:#15120F;background:#FFC21A;padding:0 8px;box-decoration-break:clone;-webkit-box-decoration-break:clone">sur le chantier.</span>
        </h1>
        <p style="font-size:19px;line-height:1.5;color:#46413a;max-width:480px;margin-bottom:34px;font-weight:500">
          Fini les feuilles en papier qui se perdent et la ressaisie du lundi matin. Vos équipes pointent depuis leur téléphone, vous récupérez tout en temps réel — propre, prêt pour la paie.
        </p>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:30px">
          <a href="/connexion" style="background:#FFC21A;color:#15120F;font-weight:800;font-size:17px;padding:16px 26px;border-radius:11px;text-decoration:none;box-shadow:0 3px 0 #C99300;display:inline-flex;align-items:center;gap:10px">
            Essayer 30 jours gratuits
            <span style="font-size:20px;line-height:1">→</span>
          </a>
          <a href="#etapes" style="color:#15120F;font-weight:700;font-size:16px;text-decoration:none;border-bottom:2px solid #15120F;padding-bottom:2px">Voir comment ça marche</a>
        </div>
        <div style="display:flex;align-items:center;gap:18px;font-size:13.5px;font-weight:600;color:#6E6A63;font-family:'JetBrains Mono',monospace">
          <span>Sans carte bancaire</span>
          <span style="width:4px;height:4px;background:#c4bdae;border-radius:50%"></span>
          <span>Prêt en 5 min</span>
          <span style="width:4px;height:4px;background:#c4bdae;border-radius:50%"></span>
          <span>En français</span>
        </div>
      </div>

      <!-- RIGHT : phone over site photo -->
      <div data-reveal class="lp-hero-visual" style="position:relative;height:560px">
        <!-- hazard band : integre au bord superieur de la PHOTO, A FLEUR du bord droit (right:0) avec le MEME arrondi que la photo (14px) -> le coin du hachure epouse exactement la courbe de la photo. Hauteur augmentee pour couvrir tout le quart-de-rond du coin. z-index:1 = au-dessus de la photo mais SOUS le telephone (z-index:3). -->
        <div style="position:absolute;top:44px;right:0;width:86%;height:22px;background:repeating-linear-gradient(45deg,#15120F 0 11px,#FFC21A 11px 22px);border-radius:14px 14px 0 0;z-index:1"></div>
        <!-- site photo panel -->
        <img src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80" alt="Chantier en cours" style="position:absolute;top:44px;right:0;width:86%;height:478px;border-radius:14px;object-fit:cover" />
        <!-- the phone -->
        <div style="position:absolute;bottom:0;left:0;width:268px;height:540px;background:#15120F;border-radius:38px;padding:11px;box-shadow:0 28px 60px -18px rgba(21,18,15,.5),0 0 0 2px rgba(21,18,15,.1);animation:float 6s ease-in-out infinite;z-index:3">
          <div style="width:100%;height:100%;background:#F2EDE3;border-radius:28px;overflow:hidden;position:relative;display:flex;flex-direction:column">
            <!-- notch -->
            <div style="position:absolute;top:9px;left:50%;transform:translateX(-50%);width:88px;height:20px;background:#15120F;border-radius:11px;z-index:5"></div>
            <!-- app top bar -->
            <div style="padding:34px 18px 14px;background:#15120F;color:#fff">
              <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.12em;color:#FFC21A;text-transform:uppercase;margin-bottom:5px">Martin Menuiserie</div>
              <div style="font-size:18px;font-weight:800">Salut Karim 👋</div>
            </div>
            <!-- body -->
            <div style="flex:1;padding:16px;display:flex;flex-direction:column">
              <div style="background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:13px 14px;margin-bottom:14px">
                <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;color:#9a948a;text-transform:uppercase;margin-bottom:4px">Chantier du jour</div>
                <div style="font-size:15px;font-weight:800;margin-bottom:2px">Villa Lupin — Aix</div>
                <div style="font-size:11.5px;color:#6E6A63;font-weight:600">Lot menuiserie · 3 collègues sur place</div>
              </div>
              <div style="text-align:center;margin:6px 0 16px">
                <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;color:#9a948a;text-transform:uppercase;margin-bottom:2px">Lun. 18 juin</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:52px;font-weight:700;letter-spacing:-.02em;line-height:1">07:42</div>
              </div>
              <button style="background:#FFC21A;border:none;border-radius:16px;padding:20px;font-family:'Archivo',sans-serif;font-weight:900;font-size:18px;color:#15120F;box-shadow:0 4px 0 #C99300;cursor:pointer;letter-spacing:-.01em">POINTER L'ARRIVÉE</button>
              <div style="margin-top:auto;padding-top:14px;display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;font-weight:600;color:#6E6A63">
                <span style="width:6px;height:6px;background:#2FA36B;border-radius:50%"></span>
                Envoyé direct au bureau
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </section>

  <!-- ============ PROBLEME ============ -->
  <section id="probleme" style="background:#15120F;color:#F2EDE3;position:relative">
    <!-- hazard top edge -->
    <div style="height:14px;background:repeating-linear-gradient(45deg,#15120F 0 14px,#FFC21A 14px 28px)"></div>
    <div style="max-width:1080px;margin:0 auto;padding:84px 28px 90px">
      <div data-reveal style="max-width:680px;margin-bottom:54px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFC21A;margin-bottom:16px">Le vrai problème</div>
        <h2 style="font-size:42px;line-height:1.04;font-weight:900;letter-spacing:-.02em">Le lundi matin, quelqu'un ressaisit tout à la main.</h2>
      </div>

      <div class="lp-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <!-- AVANT -->
        <div data-reveal style="background:#211D19;border:1px solid rgba(242,237,227,.12);border-radius:18px;padding:30px">
          <div style="display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#15120F;background:#8a857c;padding:5px 11px;border-radius:5px;margin-bottom:22px;font-weight:700">Avant</div>
          <div style="font-size:20px;font-weight:800;margin-bottom:18px;color:#F2EDE3">Sans Battime</div>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:14px">
            <li style="display:flex;gap:12px;font-size:15.5px;line-height:1.4;color:#c9c3b8;font-weight:500"><span style="color:#9a948a;flex:none">✕</span> Des feuilles en papier qui se perdent ou reviennent illisibles</li>
            <li style="display:flex;gap:12px;font-size:15.5px;line-height:1.4;color:#c9c3b8;font-weight:500"><span style="color:#9a948a;flex:none">✕</span> Les heures qui arrivent en retard, après la paie</li>
            <li style="display:flex;gap:12px;font-size:15.5px;line-height:1.4;color:#c9c3b8;font-weight:500"><span style="color:#9a948a;flex:none">✕</span> Une matinée entière à tout retaper dans Excel</li>
            <li style="display:flex;gap:12px;font-size:15.5px;line-height:1.4;color:#c9c3b8;font-weight:500"><span style="color:#9a948a;flex:none">✕</span> Des oublis, des erreurs, des litiges sur les heures</li>
          </ul>
        </div>
        <!-- APRES -->
        <div data-reveal style="background:#F2EDE3;color:#15120F;border-radius:18px;padding:30px;position:relative;overflow:hidden">
          <div style="position:absolute;top:0;right:0;width:90px;height:12px;background:repeating-linear-gradient(45deg,#15120F 0 8px,#FFC21A 8px 16px)"></div>
          <div style="display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#15120F;background:#FFC21A;padding:5px 11px;border-radius:5px;margin-bottom:22px;font-weight:700">Avec Battime</div>
          <div style="font-size:20px;font-weight:800;margin-bottom:18px">Tout devient simple</div>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:14px">
            <li style="display:flex;gap:12px;font-size:15.5px;line-height:1.4;color:#3a352f;font-weight:600"><span style="color:#2FA36B;flex:none;font-weight:900">✓</span> Le gars pointe sur le chantier, en quelques secondes</li>
            <li style="display:flex;gap:12px;font-size:15.5px;line-height:1.4;color:#3a352f;font-weight:600"><span style="color:#2FA36B;flex:none;font-weight:900">✓</span> Vous voyez les heures arriver en temps réel</li>
            <li style="display:flex;gap:12px;font-size:15.5px;line-height:1.4;color:#3a352f;font-weight:600"><span style="color:#2FA36B;flex:none;font-weight:900">✓</span> Export pour la paie en un clic, sans rien ressaisir</li>
            <li style="display:flex;gap:12px;font-size:15.5px;line-height:1.4;color:#3a352f;font-weight:600"><span style="color:#2FA36B;flex:none;font-weight:900">✓</span> Zéro papier, zéro oubli, des heures justes</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ ETAPES ============ -->
  <section id="etapes" style="background:#F2EDE3">
    <div style="max-width:1140px;margin:0 auto;padding:88px 28px 80px">
      <div data-reveal style="text-align:center;max-width:640px;margin:0 auto 58px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9a8a3a;margin-bottom:16px">3 étapes, c'est tout</div>
        <h2 style="font-size:42px;line-height:1.04;font-weight:900;letter-spacing:-.02em">Du chantier à la paie,<br>sans rien retaper.</h2>
      </div>
      <div class="lp-3col" style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px">
        <!-- step 1 -->
        <div data-reveal style="background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:18px;padding:30px 26px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
            <div style="font-family:'JetBrains Mono',monospace;font-size:46px;font-weight:700;line-height:1;color:#FFC21A;-webkit-text-stroke:1px #15120F">01</div>
            <div style="width:44px;height:44px;border-radius:11px;background:#15120F;display:flex;align-items:center;justify-content:center;font-size:22px">📍</div>
          </div>
          <h3 style="font-size:21px;font-weight:800;margin-bottom:10px;letter-spacing:-.01em">Le salarié pointe</h3>
          <p style="font-size:15px;line-height:1.5;color:#56514a;font-weight:500">Sur le chantier, il ouvre l'appli et tape un gros bouton. Arrivée, pause, départ. Aucune formation, ça marche du premier coup.</p>
        </div>
        <!-- step 2 -->
        <div data-reveal style="background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:18px;padding:30px 26px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
            <div style="font-family:'JetBrains Mono',monospace;font-size:46px;font-weight:700;line-height:1;color:#FFC21A;-webkit-text-stroke:1px #15120F">02</div>
            <div style="width:44px;height:44px;border-radius:11px;background:#15120F;display:flex;align-items:center;justify-content:center;font-size:22px">⚡</div>
          </div>
          <h3 style="font-size:21px;font-weight:800;margin-bottom:10px;letter-spacing:-.01em">Tout remonte au bureau</h3>
          <p style="font-size:15px;line-height:1.5;color:#56514a;font-weight:500">Les heures arrivent en temps réel, classées par chantier et par salarié. Le patron ou la secrétaire suit tout depuis l'ordinateur.</p>
        </div>
        <!-- step 3 -->
        <div data-reveal style="background:#15120F;color:#F2EDE3;border-radius:18px;padding:30px 26px;position:relative;overflow:hidden">
          <div style="position:absolute;bottom:-1px;left:0;width:100%;height:10px;background:repeating-linear-gradient(45deg,#15120F 0 8px,#FFC21A 8px 16px)"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
            <div style="font-family:'JetBrains Mono',monospace;font-size:46px;font-weight:700;line-height:1;color:#FFC21A">03</div>
            <div style="width:44px;height:44px;border-radius:11px;background:#FFC21A;display:flex;align-items:center;justify-content:center;font-size:22px">📤</div>
          </div>
          <h3 style="font-size:21px;font-weight:800;margin-bottom:10px;letter-spacing:-.01em">Export paie en un clic</h3>
          <p style="font-size:15px;line-height:1.5;color:#c9c3b8;font-weight:500">En fin de mois, vous exportez un récap propre, prêt pour votre comptable ou votre logiciel de paie. Fini la ressaisie du lundi.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ COTE BUREAU ============ -->
  <section style="background:#E8E1D3">
    <div class="lp-bureau-grid" style="max-width:1140px;margin:0 auto;padding:84px 28px;display:grid;grid-template-columns:.9fr 1.1fr;gap:48px;align-items:center">
      <div data-reveal style="">
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9a8a3a;margin-bottom:16px">Côté bureau</div>
        <h2 style="font-size:38px;line-height:1.05;font-weight:900;letter-spacing:-.02em;margin-bottom:20px">Vous voyez tout, en direct, sans appeler personne.</h2>
        <p style="font-size:17px;line-height:1.55;color:#46413a;font-weight:500;margin-bottom:26px;max-width:430px">Qui est sur quel chantier, combien d'heures, depuis quand. Tout est classé tout seul. Le vendredi, vous validez — le mois fini, vous exportez.</p>
        <div style="display:flex;flex-direction:column;gap:13px">
          <div style="display:flex;gap:12px;align-items:center;font-size:15.5px;font-weight:600;color:#2a2622"><span style="width:26px;height:26px;flex:none;background:#15120F;color:#FFC21A;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900">✓</span> Heures par chantier et par salarié</div>
          <div style="display:flex;gap:12px;align-items:center;font-size:15.5px;font-weight:600;color:#2a2622"><span style="width:26px;height:26px;flex:none;background:#15120F;color:#FFC21A;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900">✓</span> Heures sup. calculées automatiquement</div>
          <div style="display:flex;gap:12px;align-items:center;font-size:15.5px;font-weight:600;color:#2a2622"><span style="width:26px;height:26px;flex:none;background:#15120F;color:#FFC21A;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900">✓</span> Export Excel ou logiciel de paie</div>
        </div>
      </div>

      <!-- dashboard mock -->
      <div data-reveal style="">
        <div style="background:#fff;border-radius:16px;box-shadow:0 24px 50px -20px rgba(21,18,15,.4);overflow:hidden;border:1px solid rgba(21,18,15,.08)">
          <!-- window bar -->
          <div style="background:#15120F;padding:12px 16px;display:flex;align-items:center;gap:8px">
            <div style="width:11px;height:11px;border-radius:50%;background:#FF5F57"></div>
            <div style="width:11px;height:11px;border-radius:50%;background:#FEBC2E"></div>
            <div style="width:11px;height:11px;border-radius:50%;background:#28C840"></div>
            <div style="margin-left:12px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#9a948a">battime.fr/equipe</div>
          </div>
          <!-- header row -->
          <div style="padding:18px 20px;border-bottom:1px solid rgba(21,18,15,.08);display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:17px;font-weight:800">Aujourd'hui — Lun. 18 juin</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#6E6A63;margin-top:2px;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;background:#2FA36B;border-radius:50%;animation:blink 1.4s infinite"></span> 4 en cours · mise à jour en direct</div>
            </div>
            <div style="background:#FFC21A;color:#15120F;font-weight:800;font-size:13px;padding:9px 14px;border-radius:8px;box-shadow:0 2px 0 #C99300">Exporter la paie</div>
          </div>
          <!-- rows -->
          <div style="padding:6px 0">
            <div style="padding:13px 20px;display:flex;align-items:center;gap:14px;border-bottom:1px solid rgba(21,18,15,.05)">
              <div style="width:38px;height:38px;border-radius:50%;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex:none">KB</div>
              <div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:700">Karim B.</div><div style="font-size:12px;color:#6E6A63;font-weight:500">Villa Lupin — Aix</div></div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700">06:18</div>
              <div style="width:9px;height:9px;border-radius:50%;background:#2FA36B;flex:none"></div>
            </div>
            <div style="padding:13px 20px;display:flex;align-items:center;gap:14px;border-bottom:1px solid rgba(21,18,15,.05)">
              <div style="width:38px;height:38px;border-radius:50%;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex:none">JM</div>
              <div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:700">Julien M.</div><div style="font-size:12px;color:#6E6A63;font-weight:500">Toiture Rue Pasteur</div></div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700">05:42</div>
              <div style="width:9px;height:9px;border-radius:50%;background:#2FA36B;flex:none"></div>
            </div>
            <div style="padding:13px 20px;display:flex;align-items:center;gap:14px;border-bottom:1px solid rgba(21,18,15,.05)">
              <div style="width:38px;height:38px;border-radius:50%;background:#c4bdae;color:#15120F;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex:none">TL</div>
              <div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:700">Thomas L.</div><div style="font-size:12px;color:#6E6A63;font-weight:500">En pause · Villa Lupin</div></div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;color:#9a948a">04:55</div>
              <div style="width:9px;height:9px;border-radius:50%;background:#FFC21A;flex:none"></div>
            </div>
            <div style="padding:13px 20px;display:flex;align-items:center;gap:14px">
              <div style="width:38px;height:38px;border-radius:50%;background:#15120F;color:#FFC21A;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex:none">PD</div>
              <div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:700">Pascal D.</div><div style="font-size:12px;color:#6E6A63;font-weight:500">Terrasse Le Tholonet</div></div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700">06:30</div>
              <div style="width:9px;height:9px;border-radius:50%;background:#2FA36B;flex:none"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ METIERS MARQUEE ============ -->
  <section id="metiers" style="background:#15120F;color:#F2EDE3;padding:54px 0;overflow:hidden">
    <div data-reveal style="text-align:center;margin-bottom:34px;padding:0 28px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFC21A;margin-bottom:12px">Fait pour le terrain</div>
      <h2 style="font-size:30px;font-weight:900;letter-spacing:-.02em">Pensé pour les métiers qui bossent dehors — et les agences d'intérim</h2>
    </div>
    <div style="display:flex;width:max-content;animation:marquee 28s linear infinite">
      <div style="display:flex;gap:14px;padding-right:14px">
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Menuisiers</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;background:#FFC21A;color:#15120F;border-radius:40px;padding:12px 26px;white-space:nowrap">Couvreurs</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Paysagistes</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Plombiers</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;background:#FFC21A;color:#15120F;border-radius:40px;padding:12px 26px;white-space:nowrap">Maçons</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Poseurs</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Électriciens</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Carreleurs</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Charpentiers</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Peintres</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;background:#FFC21A;color:#15120F;border-radius:40px;padding:12px 26px;white-space:nowrap">Agences d'intérim</span>
      </div>
      <div style="display:flex;gap:14px;padding-right:14px" aria-hidden="true">
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Menuisiers</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;background:#FFC21A;color:#15120F;border-radius:40px;padding:12px 26px;white-space:nowrap">Couvreurs</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Paysagistes</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Plombiers</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;background:#FFC21A;color:#15120F;border-radius:40px;padding:12px 26px;white-space:nowrap">Maçons</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Poseurs</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Électriciens</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Carreleurs</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Charpentiers</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;border:2px solid rgba(242,237,227,.25);border-radius:40px;padding:12px 26px;white-space:nowrap">Peintres</span>
        <span style="font-size:24px;font-weight:800;letter-spacing:-.01em;background:#FFC21A;color:#15120F;border-radius:40px;padding:12px 26px;white-space:nowrap">Agences d'intérim</span>
      </div>
    </div>
  </section>

  <!-- ============ TEMOIGNAGE ============ -->
  <section style="background:#F2EDE3">
    <div style="max-width:980px;margin:0 auto;padding:90px 28px">
      <div data-reveal class="lp-temoignage-grid" style="display:grid;grid-template-columns:auto 1fr;gap:36px;align-items:center">
        <img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&q=80" alt="Patron d'entreprise du batiment" style="width:160px;height:160px;flex:none;border-radius:20px;object-fit:cover" />
        <div>
          <div style="font-size:60px;line-height:.4;color:#FFC21A;font-weight:900;font-family:'JetBrains Mono',monospace">"</div>
          <p style="font-size:25px;line-height:1.35;font-weight:700;letter-spacing:-.01em;margin-bottom:20px">Avant je passais mon lundi matin à déchiffrer des feuilles. Maintenant tout est déjà là quand j'arrive. J'ai récupéré une demi-journée par semaine.</p>
          <div style="display:flex;align-items:center;gap:10px;font-size:14.5px"><span style="font-weight:800">Thierry R.</span><span style="color:#9a948a">·</span><span style="color:#6E6A63;font-weight:500">Charpente Rivière, 9 salariés</span></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ TARIF ============ -->
  <section id="tarif" class="lp-tarif-sec" style="background:#F2EDE3;color:#15120F;-webkit-font-smoothing:antialiased;padding:48px 28px 80px">
    <div style="max-width:1140px;margin:0 auto">

      <!-- En-tête -->
      <div data-reveal style="text-align:center;max-width:680px;margin:0 auto 14px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#9a8a3a;margin-bottom:16px">Tarif</div>
        <h2 style="font-size:44px;line-height:1.04;font-weight:900;letter-spacing:-.025em;margin:0">Un prix simple, selon la taille de l'équipe.</h2>
      </div>

      <!-- Bandeau essai gratuit -->
      <div style="display:flex;justify-content:center;margin:0 auto 50px">
        <div style="display:inline-flex;align-items:center;gap:13px;background:#15120F;color:#F2EDE3;border-radius:12px;padding:13px 20px;flex-wrap:wrap;justify-content:center">
          <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#FFC21A;letter-spacing:.04em">30 JOURS GRATUITS</span>
          <span style="width:5px;height:5px;background:#6E6A63;border-radius:50%"></span>
          <span style="font-size:14.5px;font-weight:600;color:#d8d2c6">Sans carte bancaire</span>
          <span style="width:5px;height:5px;background:#6E6A63;border-radius:50%"></span>
          <span style="font-size:14.5px;font-weight:600;color:#d8d2c6">Sans engagement</span>
        </div>
      </div>

      <!-- Les 3 offres -->
      <div class="lp-tarif-grid" data-reveal style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px;align-items:end">

        <!-- Offre 1 -->
        <div style="background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:20px;padding:32px 28px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#9a948a;font-weight:700;margin-bottom:8px">Jusqu'à 10 salariés</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px">
            <span style="font-size:50px;font-weight:900;letter-spacing:-.03em;line-height:1">49€</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:500;color:#6E6A63">/ mois</span>
          </div>
          <div style="font-size:14.5px;color:#6E6A63;font-weight:500;margin-bottom:26px">Pour les petites équipes et les artisans qui démarrent.</div>
          <a href="/connexion" style="display:block;text-align:center;background:#F2EDE3;color:#15120F;font-weight:800;font-size:15.5px;padding:15px;border-radius:11px;text-decoration:none;border:2px solid #15120F">Commencer l'essai</a>
        </div>

        <!-- Offre 2 — mise en avant -->
        <div style="background:#15120F;color:#F2EDE3;border-radius:22px;padding:36px 30px 32px;position:relative;overflow:hidden;box-shadow:0 26px 54px -24px rgba(21,18,15,.55);transform:translateY(-10px)">
          <!-- ruban de chantier -->
          <div style="position:absolute;top:0;left:0;width:100%;height:12px;background:repeating-linear-gradient(45deg,#15120F 0 9px,#FFC21A 9px 18px)"></div>
          <div style="display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#15120F;background:#FFC21A;padding:5px 11px;border-radius:6px;font-weight:700;margin:8px 0 18px">Le plus courant</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#a59c86;font-weight:700;margin-bottom:8px">Jusqu'à 25 salariés</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px">
            <span style="font-size:58px;font-weight:900;letter-spacing:-.03em;line-height:1">89€</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:500;color:#a59c86">/ mois</span>
          </div>
          <div style="font-size:14.5px;color:#c9c3b8;font-weight:500;margin-bottom:26px">Le choix de la plupart des entreprises du bâtiment.</div>
          <a href="/connexion" style="display:block;text-align:center;background:#FFC21A;color:#15120F;font-weight:900;font-size:16px;padding:17px;border-radius:12px;text-decoration:none;box-shadow:0 4px 0 #C99300">Commencer 30 jours gratuits</a>
        </div>

        <!-- Offre 3 -->
        <div style="background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:20px;padding:32px 28px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:#9a948a;font-weight:700;margin-bottom:8px">Jusqu'à 50 salariés</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px">
            <span style="font-size:50px;font-weight:900;letter-spacing:-.03em;line-height:1">149€</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:500;color:#6E6A63">/ mois</span>
          </div>
          <div style="font-size:14.5px;color:#6E6A63;font-weight:500;margin-bottom:26px">Pour les structures avec plusieurs équipes sur le terrain.</div>
          <a href="/connexion" style="display:block;text-align:center;background:#F2EDE3;color:#15120F;font-weight:800;font-size:15.5px;padding:15px;border-radius:11px;text-decoration:none;border:2px solid #15120F">Commencer l'essai</a>
        </div>

      </div>

      <!-- Au-delà de 50 — sur mesure -->
      <div data-reveal style="display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;background:transparent;border:1.5px dashed rgba(21,18,15,.28);border-radius:16px;padding:22px 28px;margin-top:26px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:42px;height:42px;flex:none;background:#15120F;border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-weight:700;color:#FFC21A;font-size:15px">50+</div>
          <div>
            <div style="font-size:17px;font-weight:800;letter-spacing:-.01em">Au-delà de 50 salariés</div>
            <div style="font-size:14px;color:#6E6A63;font-weight:500">On construit une offre sur mesure pour votre structure.</div>
          </div>
        </div>
        <a href="/connexion" style="flex:none;background:#15120F;color:#F2EDE3;font-weight:800;font-size:15px;padding:13px 22px;border-radius:11px;text-decoration:none">Parlons-en →</a>
      </div>

      <!-- Inclus dans toutes les offres -->
      <div data-reveal style="margin-top:44px;border-top:1px solid rgba(21,18,15,.14);padding-top:34px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:#9a948a;font-weight:700;text-align:center;margin-bottom:24px">Inclus dans toutes les offres</div>
        <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:14px 30px;max-width:920px;margin:0 auto">
          <div style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;color:#2a2622"><span style="width:22px;height:22px;flex:none;background:#FFC21A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#15120F">✓</span> Pointage et chantiers illimités</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;color:#2a2622"><span style="width:22px;height:22px;flex:none;background:#FFC21A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#15120F">✓</span> Suivi en temps réel</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;color:#2a2622"><span style="width:22px;height:22px;flex:none;background:#FFC21A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#15120F">✓</span> Export prêt pour la paie</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;color:#2a2622"><span style="width:22px;height:22px;flex:none;background:#FFC21A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#15120F">✓</span> Support en français</div>
          <div style="display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;color:#2a2622"><span style="width:22px;height:22px;flex:none;background:#FFC21A;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#15120F">✓</span> Mises à jour incluses</div>
        </div>
        <p style="text-align:center;font-size:14px;color:#6E6A63;font-weight:500;margin:28px 0 0">Sans engagement — vous arrêtez quand vous voulez.</p>
      </div>

    </div>
  </section>

  <!-- ============ FAQ ============ -->
  <section style="background:#F2EDE3">
    <div style="max-width:780px;margin:0 auto;padding:84px 28px">
      <h2 data-reveal style="font-size:34px;font-weight:900;letter-spacing:-.02em;margin-bottom:36px;text-align:center">Les questions qu'on nous pose</h2>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div data-reveal style="background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:22px 24px">
          <div style="font-size:17px;font-weight:800;margin-bottom:8px">Et s'il n'y a pas de réseau sur le chantier ?</div>
          <p style="font-size:15px;line-height:1.5;color:#56514a;font-weight:500">Aucun souci. Le pointage est enregistré sur le téléphone et remonte tout seul dès que le réseau revient.</p>
        </div>
        <div data-reveal style="background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:22px 24px">
          <div style="font-size:17px;font-weight:800;margin-bottom:8px">Mes gars ne sont pas à l'aise avec la technologie.</div>
          <p style="font-size:15px;line-height:1.5;color:#56514a;font-weight:500">C'est fait pour eux. Un écran, un gros bouton. S'ils savent envoyer un SMS, ils savent pointer sur Battime.</p>
        </div>
        <div data-reveal style="background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:22px 24px">
          <div style="font-size:17px;font-weight:800;margin-bottom:8px">Est-ce que ça marche avec mon logiciel de paie ?</div>
          <p style="font-size:15px;line-height:1.5;color:#56514a;font-weight:500">L'export se fait en Excel ou au format de votre logiciel. Votre comptable récupère un fichier propre, sans rien retaper.</p>
        </div>
        <div data-reveal style="background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:22px 24px">
          <div style="font-size:17px;font-weight:800;margin-bottom:8px">Combien de temps pour démarrer ?</div>
          <p style="font-size:15px;line-height:1.5;color:#56514a;font-weight:500">Cinq minutes. Vous ajoutez vos salariés et vos chantiers, ils installent l'appli, et c'est parti dès le lendemain.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ CTA FINAL ============ -->
  <section style="background:#15120F;color:#F2EDE3;position:relative;overflow:hidden">
    <div style="height:14px;background:repeating-linear-gradient(45deg,#15120F 0 14px,#FFC21A 14px 28px)"></div>
    <div data-reveal style="max-width:760px;margin:0 auto;padding:96px 28px 100px;text-align:center">
      <h2 style="font-size:52px;line-height:1.02;font-weight:900;letter-spacing:-.025em;margin-bottom:22px">Récupérez vos lundis matin.</h2>
      <p style="font-size:19px;line-height:1.5;color:#c9c3b8;font-weight:500;max-width:520px;margin:0 auto 36px">Essayez Battime gratuitement pendant 30 jours. Vos gars pointent dès demain, vous exportez à la fin du mois.</p>
      <a href="/connexion" style="display:inline-flex;align-items:center;gap:11px;background:#FFC21A;color:#15120F;font-weight:900;font-size:19px;padding:19px 32px;border-radius:13px;text-decoration:none;box-shadow:0 4px 0 #C99300">Essayer gratuitement <span style="font-size:22px">→</span></a>
      <div style="margin-top:22px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#9a948a">Sans carte bancaire · sans engagement</div>
    </div>
  </section>

  <!-- ============ FOOTER ============ -->
  <footer style="background:#0e0c0a;color:#9a948a;padding:46px 28px">
    <div class="lp-footer-row" style="max-width:1140px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:11px">
        <div style="width:30px;height:30px;background:#FFC21A;border-radius:7px;display:flex;align-items:center;justify-content:center">
          <div style="width:13px;height:13px;border:2.5px solid #15120F;border-radius:50%;border-top-color:transparent;transform:rotate(45deg)"></div>
        </div>
        <span style="font-weight:900;font-size:18px;color:#F2EDE3">Battime</span>
      </div>
      <div style="display:flex;gap:26px;font-size:14px;font-weight:600">
        <a href="#etapes" style="color:#9a948a;text-decoration:none">Fonctionnement</a>
        <a href="#tarif" style="color:#9a948a;text-decoration:none">Tarif</a>
        <a href="mailto:khabitatcontact@gmail.com" style="color:#9a948a;text-decoration:none">Contact</a>
        <a href="/connexion" style="color:#9a948a;text-decoration:none">Connexion</a><a href="/mentions-legales" style="color:#9a948a;text-decoration:none">Mentions legales</a><a href="/confidentialite" style="color:#9a948a;text-decoration:none">Confidentialite</a>
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:12.5px">© 2026 Battime — Les heures du bâtiment.</div>
    </div>
  </footer>`;

export default function LandingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="lp" dangerouslySetInnerHTML={{ __html: BODY }} />
    </>
  );
}
