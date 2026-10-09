// Habillage commun aux écrans d'accès (connexion, création et réinitialisation
// du mot de passe, « mot de passe oublié ») : design « noir + jaune chantier ».
// Une seule feuille de style, pour que ces écrans ne divergent plus (la page
// « mot de passe oublié » était restée sur l'ancien design, sans accents).
const AUTH_CSS = `
@import url('/fonts/fonts.css');
.bt-auth{font-family:'Archivo',sans-serif;background:#F2EDE3;color:#15120F;-webkit-font-smoothing:antialiased;min-height:100vh;min-height:100svh}
.bt-auth *{box-sizing:border-box}
.bt-auth .mono{font-family:'JetBrains Mono',monospace}
.bt-mono{font-family:'JetBrains Mono',monospace}
.bt-split{display:grid;grid-template-columns:1fr 1fr;min-height:100vh;min-height:100svh;position:relative}
.bt-leftcol{display:flex;flex-direction:column;justify-content:center;padding:32px 7vw;min-width:0}
.bt-wrap{width:100%;max-width:480px;margin:0 auto}
.bt-logo{display:flex;align-items:center;justify-content:center;margin-bottom:28px}
.bt-logo-badge{display:inline-flex;align-items:center;justify-content:center;background:#15120F;border-radius:16px;padding:16px 30px;box-shadow:0 14px 30px -14px rgba(21,18,15,.5);text-decoration:none;max-width:100%}
.bt-logo-badge-img{width:clamp(196px,52vw,264px);height:auto;display:block;max-width:100%}
.bt-vis-brand{position:absolute;bottom:clamp(34px,5vh,52px);left:50%;transform:translateX(-50%);width:clamp(200px,24vw,262px);height:auto;opacity:.97;pointer-events:none;z-index:2}
.bt-h1{font-size:25px;line-height:1.15;font-weight:900;letter-spacing:-.02em;margin:0 0 10px;text-align:center}
.bt-h1-accent{color:#9a7c14}
.bt-sub{font-size:15px;color:#6E6A63;font-weight:500;margin:0 0 20px;text-align:center}
.bt-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#E4DCCE;border-radius:12px;padding:5px;margin-bottom:20px}
.bt-tab{cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:9px;font-weight:800;font-size:15px;color:#6E6A63;border:none;background:transparent;font-family:'Archivo',sans-serif}
.bt-tab.is-active{background:#15120F;color:#FFC21A}
.bt-label{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin-bottom:6px}
.bt-field{width:100%;font-family:'Archivo',sans-serif;font-size:16px;font-weight:500;padding:13px 16px;border:1.5px solid rgba(21,18,15,.18);border-radius:11px;background:#FBF8F2;outline:none;color:#15120F}
.bt-field::placeholder{color:#a39d92}
.bt-field:focus{border-color:#15120F;background:#fff}
.bt-forgot{font-size:12.5px;font-weight:700;color:#9a7c14;text-decoration:none}
.bt-ybtn{width:100%;border:none;cursor:pointer;background:#FFC21A;color:#15120F;font-family:'Archivo',sans-serif;font-weight:900;font-size:17px;padding:16px;border-radius:12px;box-shadow:0 4px 0 #C99300;transition:transform .12s ease, box-shadow .12s ease}
.bt-ybtn:hover{transform:translateY(-2px);box-shadow:0 6px 0 #C99300}
.bt-ybtn:active{transform:translateY(2px);box-shadow:0 1px 0 #C99300}
.bt-ybtn:disabled{opacity:.65;cursor:default;transform:none;box-shadow:0 4px 0 #C99300}
.bt-foot{text-align:center;font-size:14.5px;color:#6E6A63;font-weight:500;margin:18px 0 0}
.bt-foot a{font-weight:800;color:#15120F;text-decoration:none;border-bottom:2px solid #FFC21A}
.bt-ok{background:#e7f6ed;border:1px solid #a8dcc0;color:#1f7a4d;font-size:14px;font-weight:600;border-radius:10px;padding:11px 14px;margin-bottom:16px}
.bt-err{background:#fce8e6;border:1px solid #f3b4ad;color:#9a2820;font-size:14px;font-weight:600;border-radius:10px;padding:11px 14px;margin-bottom:16px}
.bt-visual{position:relative;background:radial-gradient(140% 120% at 50% 43%,rgba(0,0,0,0) 55%,rgba(0,0,0,.4) 100%),radial-gradient(circle at 50% 42%,#332818 0%,#20190f 50%,#15120F 80%);overflow:hidden;display:flex;align-items:center;justify-content:center;padding:44px 40px clamp(84px,11.5vh,112px);min-width:0}
.bt-ruban-center{position:absolute;top:0;left:calc(50% - 6px);width:12px;height:100%;background:repeating-linear-gradient(45deg,#15120F 0 9px,#FFC21A 9px 18px);z-index:5;pointer-events:none}
.bt-vis-inner{display:flex;flex-direction:column;align-items:center;position:relative;z-index:1;filter:drop-shadow(0 44px 74px rgba(0,0,0,.62));animation:bt-vis-float 7s ease-in-out infinite}
@keyframes bt-vis-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.bt-vis-halo{position:absolute;top:43%;left:50%;transform:translate(-50%,-50%);width:min(64vh,620px);height:min(64vh,620px);border-radius:50%;background:radial-gradient(circle,rgba(255,194,26,.16),transparent 62%);filter:blur(22px);z-index:0;pointer-events:none}
.bt-vis-xbg{position:absolute;z-index:0;pointer-events:none;height:auto}
.bt-vis-xbg-1{bottom:-64px;right:-78px;width:380px;opacity:.09;transform:rotate(12deg)}
.bt-vis-xbg-2{top:3%;left:-44px;width:168px;opacity:.08;transform:rotate(-18deg)}
.bt-vis-xbg-3{top:-26px;right:11%;width:148px;opacity:.075;transform:rotate(-8deg)}
.bt-vis-xbg-4{bottom:7%;left:4%;width:196px;opacity:.08;transform:rotate(14deg)}
.bt-vis-xbg-5{top:45%;right:-46px;width:118px;opacity:.06;transform:rotate(-15deg)}
@media(prefers-reduced-motion:reduce){.bt-vis-inner{animation:none}}
.bt-vis-tagline{display:none;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#FFC21A;text-align:center;font-weight:700}
.bt-card{width:100%;max-width:420px;background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:18px;padding:34px 30px;box-shadow:0 24px 50px -24px rgba(21,18,15,.4)}
.bt-center{min-height:100vh;min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px}
.bt-spin{width:34px;height:34px;border:3px solid rgba(21,18,15,.18);border-top-color:#15120F;border-radius:50%;animation:btspin .8s linear infinite;margin:0 auto}
@keyframes btspin{to{transform:rotate(360deg)}}
@media(min-width:881px){
  .bt-split{height:100vh;height:100svh;min-height:0}
  .bt-leftcol{overflow-y:auto}
}
@media(max-width:880px){
  .bt-split{grid-template-columns:1fr}
  .bt-leftcol{order:2;padding:40px 28px}
  .bt-visual{order:1;min-height:0;padding:24px}
  .bt-vis-inner{display:none}
  .bt-vis-halo{display:none}
  .bt-vis-xbg{display:none}
  .bt-vis-tagline{display:block}
  .bt-vis-brand{display:none}
  .bt-ruban-center{display:none}
  .bt-h1{font-size:23px}
}
`;

// Objet FIXE : un `{ __html }` neuf à chaque rendu fait réécrire la feuille
// de style par React (re-calcul de la page, polices rechargées → flash).
export const AUTH_CSS_HTML = { __html: AUTH_CSS };
