'use client';

// Champ mot de passe commun à tous les écrans (inscription, connexion, création
// et réinitialisation du mot de passe, pointage QR) :
//  - un bouton œil pour afficher / masquer ce qu'on tape ;
//  - avec `showRules`, la règle sous le champ, une coche verte par condition
//    remplie au fur et à mesure (lib/password.ts, la seule source de la règle).
//
// Styles en ligne : les écrans qui l'utilisent n'ont pas la même feuille de
// style (classes bt-*, kx-*). La classe du champ est passée par l'appelant.

import { useState } from 'react';
import { PASSWORD_CHECKS } from '@/lib/password';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Style du champ (la marge du bas est reportée sur l'enveloppe). */
  inputStyle?: React.CSSProperties;
  /** Style de l'enveloppe : c'est elle qui porte l'espace sous le bloc. */
  wrapStyle?: React.CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: 'current-password' | 'new-password';
  name?: string;
  /** Afficher la règle et ses coches sous le champ (création d'un mot de passe). */
  showRules?: boolean;
}

function Eye({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  );
}

export function PasswordInput({
  id, value, onChange, className, inputStyle, wrapStyle, placeholder, disabled, required, autoComplete, name, showRules,
}: Props) {
  const [visible, setVisible] = useState(false);
  const rulesId = `${id}-regles`;

  return (
    <div style={wrapStyle}>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          name={name}
          className={className}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={showRules ? rulesId : undefined}
          style={{ ...inputStyle, marginBottom: 0, paddingRight: 52 }}
        />
        <button
          type="button"
          className="pw-eye"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          style={{
            position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)',
            width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#6E6A63', padding: 0,
          }}
        >
          <Eye open={visible} />
        </button>
      </div>

      {showRules && (
        <ul id={rulesId} className="pw-rules" aria-live="polite" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 4 }}>
          {PASSWORD_CHECKS.map((c) => {
            const ok = c.test(value);
            return (
              <li key={c.id} data-ok={ok ? 'oui' : 'non'} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, lineHeight: 1.3, fontWeight: ok ? 700 : 500, color: ok ? '#1f7a4d' : '#6E6A63' }}>
                <span
                  aria-hidden="true"
                  style={{
                    flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: ok ? '#1f7a4d' : 'transparent', border: ok ? 'none' : '1.5px solid #b9b2a6', color: '#fff', fontSize: 12, fontWeight: 900,
                  }}
                >
                  {ok ? '✓' : ''}
                </span>
                <span>{c.label}<span className="sr-only">{ok ? ' : rempli' : ' : pas encore'}</span></span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
