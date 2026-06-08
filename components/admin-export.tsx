'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntryWithWorksite, User } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins.toString().padStart(2, '0')}`;
}

export default function AdminExport() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(false);

  const fetchEntries = async (startDate: Date, endDate: Date): Promise<(TimeEntryWithWorksite & { user: User })[]> => {
    if (!user?.company_id) return [];

    const { data, error } = await supabase
      .from('time_entries')
      .select(`
        *,
        worksite:worksites(*),
        user:users(*)
      `)
      .eq('company_id', user.company_id)
      .gte('work_date', format(startDate, 'yyyy-MM-dd'))
      .lte('work_date', format(endDate, 'yyyy-MM-dd'))
      .order('work_date', { ascending: false })
      .order('user_id');

    if (error) throw error;
    return data || [];
  };

  const exportToExcel = async () => {
    setLoading(true);
    try {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const entries = await fetchEntries(weekStart, weekEnd);

      if (entries.length === 0) {
        toast.error('Aucune saisie pour cette semaine');
        setLoading(false);
        return;
      }

      const rows = entries.map((entry) => ({
        'Date': format(parseISO(entry.work_date), 'dd/MM/yyyy'),
        'Salarié': `${entry.user?.first_name} ${entry.user?.last_name}`,
        'Client': entry.worksite?.client_name || '-',
        'Ville': entry.worksite?.city || '-',
        'Début': entry.start_time?.substring(0, 5) || '-',
        'Fin': entry.end_time?.substring(0, 5) || '-',
        'Pause (min)': entry.break_minutes,
        'Total heures': formatMinutesToHours(entry.total_minutes),
        'Panier repas': entry.meal_allowance ? 'Oui' : 'Non',
        'Statut': entry.status === 'submitted' ? 'Envoyé' : entry.status === 'validated' ? 'Validé' : 'Brouillon',
        'Observation': entry.observation || '-',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Saisies');

      const colWidths = [
        { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 15 },
        { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 30 },
      ];
      ws['!cols'] = colWidths;

      const fileName = `battime-export-${format(weekStart, 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success('Export Excel téléchargé');
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      toast.error('Erreur lors de l\'export');
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    setLoading(true);
    try {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const entries = await fetchEntries(weekStart, weekEnd);

      if (entries.length === 0) {
        toast.error('Aucune saisie pour cette semaine');
        setLoading(false);
        return;
      }

      const doc = new jsPDF('landscape');

      doc.setFontSize(18);
      doc.text('Battime - Rapport hebdomadaire', 14, 20);

      doc.setFontSize(11);
      doc.text(`Période : ${format(weekStart, 'dd/MM/yyyy')} au ${format(weekEnd, 'dd/MM/yyyy')}`, 14, 30);
      doc.text(`Entreprise : ${user?.company_id}`, 14, 36);

      const totalMinutes = entries.reduce((sum, e) => sum + e.total_minutes, 0);
      const totalMealAllowance = entries.filter(e => e.meal_allowance).length;

      doc.text(`Total heures : ${formatMinutesToHours(totalMinutes)}`, 14, 42);
      doc.text(`Paniers repas : ${totalMealAllowance}`, 100, 42);

      const rows = entries.map((entry) => [
        format(parseISO(entry.work_date), 'dd/MM/yyyy'),
        `${entry.user?.first_name} ${entry.user?.last_name}`,
        entry.worksite?.client_name || '-',
        entry.worksite?.city || '-',
        entry.start_time?.substring(0, 5) || '-',
        entry.end_time?.substring(0, 5) || '-',
        `${entry.break_minutes} min`,
        formatMinutesToHours(entry.total_minutes),
        entry.meal_allowance ? 'Oui' : 'Non',
        entry.status === 'submitted' ? 'Envoyé' : entry.status === 'validated' ? 'Validé' : 'Brouillon',
      ]);

      autoTable(doc, {
        startY: 50,
        head: [['Date', 'Salarié', 'Client', 'Ville', 'Début', 'Fin', 'Pause', 'Total', 'Panier', 'Statut']],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [220, 38, 38] },
      });

      const fileName = `battime-rapport-${format(weekStart, 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);

      toast.success('Export PDF téléchargé');
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      toast.error('Erreur lors de l\'export');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Export</h2>
        <p className="text-muted-foreground">Téléchargez les saisies de la semaine</p>
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
                onChange={(e) => setWeekStart(startOfWeek(parseISO(e.target.value), { weekStartsOn: 1 }))}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <Button onClick={exportToExcel} disabled={loading} className="w-full">
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
                onChange={(e) => setWeekStart(startOfWeek(parseISO(e.target.value), { weekStartsOn: 1 }))}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <Button onClick={exportToPDF} disabled={loading} className="w-full" variant="outline">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Télécharger PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
