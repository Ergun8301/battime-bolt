'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, User as CompanyUser } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, MapPin, Clock, Utensils, Loader2, CheckCircle, Send } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite;
}

function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins.toString().padStart(2, '0')}`;
}

export default function PoseurHistory() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      const [entriesRes, companyRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select('*, worksite:worksites(*)')
          .eq('user_id', user.id)
          .order('work_date', { ascending: false }),
        supabase
          .from('companies')
          .select('name')
          .eq('id', user.company_id)
          .single(),
      ]);

      if (entriesRes.error) throw entriesRes.error;

      setEntries(entriesRes.data || []);
      setCompanyName(companyRes.data?.name || '');
    } catch (err) {
      console.error('Error fetching history:', err);
      toast.error('Impossible de charger l\'historique');
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (entries.length === 0) {
      toast.error('Aucune saisie a exporter');
      return;
    }

    setExporting(true);
    try {
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text('Battime - Historique des heures', 14, 20);

      doc.setFontSize(11);
      doc.text(`Poseur : ${user?.first_name} ${user?.last_name}`, 14, 32);
      doc.text(`Entreprise : ${companyName}`, 14, 38);

      const totalMinutes = entries.reduce((sum, e) => sum + e.total_minutes, 0);
      const totalMealAllowance = entries.filter(e => e.meal_allowance).length;

      doc.text(`Total : ${formatMinutesToHours(totalMinutes)}`, 14, 44);
      doc.text(`Paniers repas : ${totalMealAllowance}`, 100, 44);

      const rows = entries.map((entry) => [
        format(parseISO(entry.work_date), 'dd/MM/yyyy'),
        entry.worksite?.client_name || '-',
        entry.worksite?.city || '-',
        `${entry.start_time?.substring(0, 5) || '-'} - ${entry.end_time?.substring(0, 5) || '-'}`,
        formatMinutesToHours(entry.total_minutes),
        entry.meal_allowance ? 'Oui' : 'Non',
        entry.status === 'submitted' ? 'Envoye' : entry.status === 'validated' ? 'Valide' : 'Brouillon',
      ]);

      autoTable(doc, {
        startY: 55,
        head: [['Date', 'Client', 'Ville', 'Heures', 'Total', 'Panier', 'Statut']],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 64, 175] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 45 },
          2: { cellWidth: 30 },
          3: { cellWidth: 30 },
          4: { cellWidth: 20 },
          5: { cellWidth: 15 },
          6: { cellWidth: 20 },
        },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Page ${i}/${pageCount} - Genere le ${format(new Date(), 'dd/MM/yyyy a HH:mm')}`,
          14,
          doc.internal.pageSize.height - 10
        );
      }

      const fileName = `battime-historique-${user?.first_name}-${user?.last_name}.pdf`;
      doc.save(fileName);

      toast.success('PDF telecharge');
    } catch (err) {
      console.error('Error exporting PDF:', err);
      toast.error('Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  const groupedEntries = entries.reduce((groups, entry) => {
    const date = entry.work_date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, TimeEntryWithWorksite[]>);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Historique</h2>
        <Button variant="outline" size="sm" onClick={exportToPDF} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
          PDF
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucune saisie dans l'historique</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedEntries).map(([date, dayEntries]) => (
            <Card key={date}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    {format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}
                  </p>
                  <div className="text-right">
                    <p className="font-bold text-primary">
                      {formatMinutesToHours(dayEntries.reduce((sum, e) => sum + e.total_minutes, 0))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dayEntries.filter(e => e.meal_allowance).length} panier{dayEntries.filter(e => e.meal_allowance).length > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {dayEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between py-2 border-t first:border-t-0">
                      <div className="flex-1">
                        <p className="font-medium">{entry.worksite?.client_name || 'Chantier inconnu'}</p>
                        {entry.worksite?.city && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {entry.worksite.city}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm">
                            {entry.start_time?.substring(0, 5)} - {entry.end_time?.substring(0, 5)}
                          </p>
                          <div className="flex items-center gap-2 justify-end">
                            {entry.meal_allowance && (
                              <Badge variant="secondary" className="text-xs">
                                <Utensils className="h-3 w-3 mr-1" />
                                Panier
                              </Badge>
                            )}
                            {entry.status === 'submitted' && (
                              <Badge variant="default" className="text-xs">
                                <Send className="h-3 w-3 mr-1" />
                                Envoye
                              </Badge>
                            )}
                            {entry.status === 'validated' && (
                              <Badge variant="default" className="text-xs bg-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Valide
                              </Badge>
                            )}
                          </div>
                        </div>
                        <span className="font-bold">{formatMinutesToHours(entry.total_minutes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
