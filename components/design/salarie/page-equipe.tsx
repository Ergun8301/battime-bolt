'use client';

// Design salarié · étape 6 · « Mon équipe » (E27) : le chef a sa page, rangée dans « Plus » (?ui=2).
// La feuille d'heures d'équipe est CELLE d'avant (components/team-day.tsx, ses gestes, ses droits, ses libellés) : cette page lui apporte seulement
// les chantiers de l'entreprise, que la journée lui donnait. Lue à l'ouverture de la page, jamais au chargement de /poseur (requetes-lot29).
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { User, Worksite } from '@/lib/types';
import TeamDay from '@/components/team-day';

export default function PageEquipe({ me, onChanged }: { me: User; onChanged: () => void }) {
  const [chantiers, setChantiers] = useState<Worksite[]>([]);
  const today = format(new Date(), 'yyyy-MM-dd');
  useEffect(() => {
    let stale = false;
    supabase.from('worksites').select('*').eq('company_id', me.company_id).eq('is_active', true).order('client_name')
      .then((r) => { if (!stale && !r.error) setChantiers((r.data || []) as Worksite[]); });
    return () => { stale = true; };
  }, [me.company_id]);
  return <div className="dz-equipe"><TeamDay me={me} today={today} worksites={chantiers} onChanged={onChanged} /></div>;
}
