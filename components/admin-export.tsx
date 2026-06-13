'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntryWithWorksite, User } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { exportEntriesToExcel, exportEntriesToPDF } from '@/lib/export-utils';

export default function AdminExport() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (!user?.company_id) return;
    supabase
      .from('companies')
      .select('name')
      .eq('id', user.company_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setCompanyName(data.name);
      });
  }, [user?.company_id]);

  const fetchEntries = async (startDate: Date, endDate: Date): Promise<(TimeEntryWithWorksite & { user: User })[]> => {
    if (!user?.company_id) return [];

    const fromStr = format(startDate, 'yyyy-MM-dd');
    const toStr = format(endDate, 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('time_entries')
      .select(`
        *,
        worksite:worksites(*),
        user:users!user_id(*)
      `)
      .eq('company_id', user.company_id)
      .gte('work_date', fromStr)
      .lte('work_date', toStr)
      .order('work_date', { ascending: false })
      .order('user_id');

    if (error) throw error;
    return data || [];
  };

  // Lock exported entries so they can no longer be edited (payroll snapshot).
  const lockEntries = async (ids: string[]) => {
    if (!user?.company_id || ids.length === 0) return;
    await supabase
      .from('time_entries')
      .update({ exported_at: new Date().toISOString(), locked: true })
      .in('id', ids)
      .eq('company_id', user.company_id);
  };

  const runExport = async (kind: 'excel' | 'pdf') => {
    if (!user?.company_id) {
      toast.error('Profil non chargé, réessayez dans un instant');
      return;
    }
    setLoading(true);
    try {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const entries = await fetchEntries(weekStart, weekEnd);

      if (entries.length === 0) {
        toast.error(`Aucune saisie du ${format(weekStart, 'dd/MM')} au ${format(weekEnd, 'dd/MM')}`);
        return;
      }

      const opts = {
        fileName: `battime-${kind === 'pdf' ? 'rapport' : 'export'}-${format(weekStart, 'yyyy-MM-dd')}`,
        title: 'Battime - Rapport hebdomadaire',
        periodLabel: `${format(weekStart, 'dd/MM/yyyy')} au ${format(weekEnd, 'dd/MM/yyyy')}`,
        companyName,
      };
      if (kind === 'excel') exportEntriesToExcel(entries, opts);
      else exportEntriesToPDF(entries, opts);

      await lockEntries(entries.map((e) => e.id));

      toast.success(`Export téléchargé — ${entries.length} saisie${entries.length > 1 ? 's' : ''} verrouillée${entries.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error exporting:', err);
      toast.error("Erreur lors de l'export");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Export</h2>
        <p className="text-muted-foreground">Téléchargez les saisies de toute l'équipe pour la semaine</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Export Excel
            </CardTitle>
            <CardDescription>
              Fichier Excel (.xlsx) contenant toutes les saisies de la semaine
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Semaine du {format(weekStart, 'd MMMM yyyy', { locale: fr })}</Label>
              <input
                type="date"
                value={format(weekStart, 'yyyy-MM-dd')}
                onChange={(e) => { if (e.target.value) setWeekStart(startOfWeek(parseISO(e.target.value + 'T00:00:00'), { weekStartsOn: 1 })); }}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <Button onClick={() => runExport('excel')} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Télécharger Excel
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Export PDF
            </CardTitle>
            <CardDescription>
              Rapport PDF formaté pour impression ou archivage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Semaine du {format(weekStart, 'd MMMM yyyy', { locale: fr })}</Label>
              <input
                type="date"
                value={format(weekStart, 'yyyy-MM-dd')}
                onChange={(e) => { if (e.target.value) setWeekStart(startOfWeek(parseISO(e.target.value + 'T00:00:00'), { weekStartsOn: 1 })); }}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <Button onClick={() => runExport('pdf')} disabled={loading} className="w-full" variant="outline">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Télécharger PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
