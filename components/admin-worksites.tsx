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
  Building2,
  Plus,
  MapPin,
  Phone,
  Package,
  Pencil,
  Power,
  PowerOff,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminWorksites() {
  const { user } = useAuth();
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Worksite | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setClientName('');
    setProductType('');
    setClientPhone('');
    setCity('');
    setAddress('');
    setDescription('');
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (worksite: Worksite) => {
    setEditing(worksite);
    setClientName(worksite.client_name || '');
    setProductType(worksite.product_type || '');
    setClientPhone(worksite.client_phone || '');
    setCity(worksite.city || '');
    setAddress(worksite.address || '');
    setDescription(worksite.description || '');
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditing(null);
      resetForm();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;

    if (!clientName.trim()) {
      toast.error('Le nom du client est requis');
      return;
    }

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
        toast.success('Chantier modifie');
      } else {
        const { error } = await supabase
          .from('worksites')
          .insert({
            ...payload,
            company_id: user.company_id,
            is_active: true,
          });

        if (error) throw error;
        toast.success('Chantier cree');
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

  const handleToggleActive = async (worksite: Worksite) => {
    if (!user?.company_id) return;

    setTogglingId(worksite.id);
    try {
      const { error } = await supabase
        .from('worksites')
        .update({ is_active: !worksite.is_active })
        .eq('id', worksite.id)
        .eq('company_id', user.company_id);

      if (error) throw error;
      toast.success(worksite.is_active ? 'Chantier desactive' : 'Chantier active');
      fetchData();
    } catch (err) {
      console.error('Error toggling worksite:', err);
      toast.error('Impossible de mettre a jour le chantier');
    } finally {
      setTogglingId(null);
    }
  };

  const activeCount = worksites.filter((w) => w.is_active).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
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
            {worksites.length - activeCount > 0
              ? `, ${worksites.length - activeCount} inactif${worksites.length - activeCount > 1 ? 's' : ''}`
              : ''}
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau chantier
        </Button>
      </div>

      {worksites.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Aucun chantier</p>
            <p className="text-sm text-muted-foreground mt-2">
              Creez votre premier chantier pour pouvoir l&apos;affecter dans le planning
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau chantier
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {worksites.map((worksite) => (
            <Card key={worksite.id} className={worksite.is_active ? '' : 'opacity-60'}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{worksite.client_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {worksite.product_type && (
                        <Badge variant="outline" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />
                          {worksite.product_type}
                        </Badge>
                      )}
                      {worksite.is_active ? (
                        <Badge variant="default" className="text-xs bg-green-600">
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Inactif
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  {(worksite.address || worksite.city) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        {[worksite.address, worksite.city].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                  {worksite.client_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0" />
                      {worksite.client_phone}
                    </div>
                  )}
                </div>

                {worksite.description && (
                  <p className="text-sm text-muted-foreground border-t pt-2">
                    {worksite.description}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(worksite)}
                    disabled={togglingId === worksite.id}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(worksite)}
                    disabled={togglingId === worksite.id}
                  >
                    {togglingId === worksite.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : worksite.is_active ? (
                      <PowerOff className="h-4 w-4" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                    <span className="ml-2">{worksite.is_active ? 'Desactiver' : 'Activer'}</span>
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
              <Input
                id="ws-client"
                placeholder="Nom du client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-product">Type de produit</Label>
              <Input
                id="ws-product"
                placeholder="Stores, volets, pergola..."
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-phone">Telephone client</Label>
              <Input
                id="ws-phone"
                type="tel"
                placeholder="06 12 34 56 78"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-address">Adresse</Label>
              <Input
                id="ws-address"
                placeholder="12 rue des Lilas"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-city">Ville</Label>
              <Input
                id="ws-city"
                placeholder="Ville"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-description">Description</Label>
              <Textarea
                id="ws-description"
                placeholder="Details du chantier..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
                rows={3}
              />
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? 'Enregistrer' : 'Creer le chantier'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
