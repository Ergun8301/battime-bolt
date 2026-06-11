'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { Worksite } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2, Plus, MapPin, Phone, Package, Pencil,
  Power, PowerOff, Loader2, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

type Filter = 'active' | 'all' | 'inactive';

export default function AdminWorksites() {
  const { user } = useAuth();
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Worksite | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [productType, setProductType] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');

  const fetchData = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const { data, error } = await supabase
        .from('worksites')
        .select('*')
        .eq('company_id', user.company_id)
        .order('is_active', { ascending: false })
        .order('client_name');
      if (error) throw error;
      setWorksites(data || []);
    } catch (err) {
      console.error('Error fetching worksites:', err);
      toast.error('Impossible de charger les chantiers');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetForm = () => {
    setClientName('');
    setProductType('');
    setClientPhone('');
    setCity('');
    setAddress('');
    setDescription('');
  };

  const openCreate = () => { setEditing(null); resetForm(); setDialogOpen(true); };

  const openEdit = (ws: Worksite) => {
    setEditing(ws);
    setClientName(ws.client_name || '');
    setProductType(ws.product_type || '');
    setClientPhone(ws.client_phone || '');
    setCity(ws.city || '');
    setAddress(ws.address || '');
    setDescription(ws.description || '');
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) { setEditing(null); resetForm(); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;
    if (!clientName.trim()) { toast.error('Le nom du client est requis'); return; }

    setSaving(true);
    try {
      const payload = {
        client_name: clientName.trim(),
        product_type: productType.trim() || null,
        client_phone: clientPhone.trim() || null,
        city: city.trim() || null,
        address: address.trim() || null,
        description: description.trim() || null,
      };

      if (editing) {
        const { error } = await supabase
          .from('worksites')
          .update(payload)
          .eq('id', editing.id)
          .eq('company_id', user.company_id);
        if (error) throw error;
        toast.success('Chantier modifié');
      } else {
        const { error } = await supabase
          .from('worksites')
          .insert({ ...payload, company_id: user.company_id, is_active: true });
        if (error) throw error;
        toast.success('Chantier créé');
      }

      handleDialogChange(false);
      fetchData();
    } catch (err) {
      console.error('Error saving worksite:', err);
      toast.error("Impossible d'enregistrer le chantier");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (ws: Worksite) => {
    if (!user?.company_id) return;
    setTogglingId(ws.id);
    try {
      const { error } = await supabase
        .from('worksites')
        .update({ is_active: !ws.is_active })
        .eq('id', ws.id)
        .eq('company_id', user.company_id);
      if (error) throw error;
      toast.success(ws.is_active ? 'Chantier archivé' : 'Chantier réactivé');
      fetchData();
    } catch (err) {
      console.error('Error toggling worksite:', err);
      toast.error('Impossible de mettre à jour le chantier');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (ws: Worksite) => {
    if (!user?.company_id) return;
    setDeletingId(ws.id);
    try {
      const { count, error: countErr } = await supabase
        .from('time_entries')
        .select('*', { count: 'exact', head: true })
        .eq('worksite_id', ws.id);
      if (countErr) throw countErr;
      if (count && count > 0) {
        toast.error(`Ce chantier a ${count} saisie${count > 1 ? 's' : ''}. Archivez-le plutôt.`);
        return;
      }
      const { error } = await supabase
        .from('worksites')
        .delete()
        .eq('id', ws.id)
        .eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Chantier supprimé');
      fetchData();
    } catch (err) {
      console.error('Error deleting worksite:', err);
      toast.error('Impossible de supprimer le chantier');
    } finally {
      setDeletingId(null);
    }
  };

  const displayed = worksites.filter(w => {
    if (filter === 'active') return w.is_active;
    if (filter === 'inactive') return !w.is_active;
    return true;
  });

  const activeCount = worksites.filter(w => w.is_active).length;
  const inactiveCount = worksites.length - activeCount;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Chantiers</h2>
          <p className="text-muted-foreground">
            {activeCount} actif{activeCount > 1 ? 's' : ''}
            {inactiveCount > 0 ? `, ${inactiveCount} archivé${inactiveCount > 1 ? 's' : ''}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            {(['active', 'all', 'inactive'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-sm transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {f === 'active' ? `Actifs (${activeCount})` : f === 'inactive' ? `Archivés (${inactiveCount})` : 'Tous'}
              </button>
            ))}
          </div>

          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau
          </Button>
        </div>
      </div>

      {displayed.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {filter === 'active' ? 'Aucun chantier actif' : filter === 'inactive' ? 'Aucun chantier archivé' : 'Aucun chantier'}
            </p>
            {filter === 'active' && (
              <>
                <p className="text-sm text-muted-foreground mt-2">
                  Créez votre premier chantier pour l&apos;affecter dans le planning
                </p>
                <Button className="mt-4" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nouveau chantier
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayed.map((ws) => (
            <Card key={ws.id} className={ws.is_active ? '' : 'opacity-60'}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{ws.client_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {ws.product_type && (
                        <Badge variant="outline" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />
                          {ws.product_type}
                        </Badge>
                      )}
                      {ws.is_active ? (
                        <Badge variant="default" className="text-xs bg-green-600">Actif</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Archivé</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  {(ws.address || ws.city) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{[ws.address, ws.city].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {ws.client_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0" />
                      {ws.client_phone}
                    </div>
                  )}
                </div>

                {ws.description && (
                  <p className="text-sm text-muted-foreground border-t pt-2 line-clamp-2">{ws.description}</p>
                )}

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(ws)}
                    disabled={togglingId === ws.id || deletingId === ws.id}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(ws)}
                    disabled={togglingId === ws.id || deletingId === ws.id}
                  >
                    {togglingId === ws.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : ws.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(ws)}
                    disabled={togglingId === ws.id || deletingId === ws.id}
                    title="Supprimer (seulement si aucune saisie)"
                  >
                    {deletingId === ws.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le chantier' : 'Nouveau chantier'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="ws-client">Nom du client *</Label>
              <Input id="ws-client" placeholder="Nom du client" value={clientName} onChange={(e) => setClientName(e.target.value)} required disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-product">Type de produit</Label>
              <Input id="ws-product" placeholder="Stores, volets, pergola..." value={productType} onChange={(e) => setProductType(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-phone">Téléphone client</Label>
              <Input id="ws-phone" type="tel" placeholder="06 12 34 56 78" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-address">Adresse</Label>
              <Input id="ws-address" placeholder="12 rue des Lilas" value={address} onChange={(e) => setAddress(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-city">Ville</Label>
              <Input id="ws-city" placeholder="Ville" value={city} onChange={(e) => setCity(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-description">Description</Label>
              <Textarea id="ws-description" placeholder="Détails du chantier..." value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} rows={3} />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? 'Enregistrer' : 'Créer le chantier'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
