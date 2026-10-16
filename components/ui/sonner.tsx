'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';
import { readUi2Flag, subscribeUi2Flag } from '@/lib/ui2-flag';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();
  // Design salarié (?ui=2, /poseur et /pointer seulement) : le retour passager se pose juste au-dessus de la barre du bas (planche, « retour passager »).
  // Sans drapeau : exactement les propriétés d'avant.
  const ui2 = useSyncExternalStore(subscribeUi2Flag, readUi2Flag, () => false);

  const v2: Partial<ToasterProps> = ui2 ? {
    position: 'bottom-center',
    offset: 'calc(var(--dz-barre-h, 0px) + 12px)',
    toastOptions: { classNames: { toast: 'dz-retour', description: 'dz-retour__texte', actionButton: 'dz-retour__action', cancelButton: 'dz-retour__action' } },
  } : {};

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
      {...v2}
    />
  );
};

export { Toaster };
