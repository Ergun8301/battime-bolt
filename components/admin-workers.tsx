'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { User, Invitation } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Phone, Mail, Clock, CheckCircle, UserCheck,
  Pencil, Archive, ArchiveRestore, Trash2, RefreshCw, X, Loader2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import WorkerDetailDialog from '@/components/worker-detail';

export default function AdminWorkers() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<User | null>(null);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invFirstName, setInvFirstName] = useState('');
  const [invLastName, setInvLastName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invSaving, setInvSaving] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Per-row loading guards
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.company_id) return;
    try {
      const [workersRes, invitationsRes] = await Promise.all([
        supabase
          .from('users')
          .select('*')
          .eq('company_id', user.company_id)
          .eq('role', 'worker')
          .order('first_name'),
        supabase
          .from('invitations')
          .select('*')
          .eq('company_id', user.company_id)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }),
      ]);
      if (workersRes.error) throw workersRes.error;
      if (invitationsRes.error) throw invitationsRes.error;

      const activeEmails = new Set((workersRes.data || []).map(w => w.email.toLowerCase()));
      const pendingInvites = (invitationsRes.data || []).filter(
        inv => !activeEmails.has(inv.email.toLowerCase())
      );

      setWorkers(workersRes.data || []);
      setInvitations(pendingInvites);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger les donnees');
    } finally {
      setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Invite ----
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;
    setInvSaving(true);
    try {
      const { error } = await supabase.functions.invoke('invite-worker', {
        body: {
          email: invEmail,
          first_name: invFirstName,
          last_name: invLastName,
          phone: invPhone || null,
          company_id: user.company_id,
          role: 'worker',
        },
      });
      if (error) throw error;
      toast.success('Invitation envoyee');
      setInviteOpen(false);
      resetInviteForm();
      fetchData();
    } catch (err) {
      console.error('Error inviting worker:', err);
      toast.error("Impossible d'envoyer l'invitation");
    } finally {
      setInvSaving(false);
    }
  };

  const resetInviteForm = () => {
    setInvFirstName('');
    setInvLastName('');
    setInvEmail('');
    setInvPhone('');
  };

  // ---- Edit ----
  const openEdit = (worker: User) => {
    setEditingWorker(worker);
    setEditFirstName(worker.first_name);
    setEditLastName(worker.last_name);
    setEditPhone(worker.phone || '');
    setEditOpen(true);
  };

  const handleEditWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorker || !user?.company_id) return;
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          phone: editPhone.trim() || null,
        })
        .eq('id', editingWorker.id)
        .eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Informations mises a jour');
      setEditOpen(false);
      setEditingWorker(null);
      fetchData();
    } catch (err) {
      console.error('Error editing worker:', err);
      toast.error('Impossible de modifier le salarié');
    } finally {
      setEditSaving(false);
    }
  };

  // ---- Archive / Reactivate ----
  const handleToggleActive = async (worker: User) => {
    if (!user?.company_id) return;
    setTogglingId(worker.id);
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !worker.is_active })
        .eq('id', worker.id)
        .eq('company_id', user.company_id);
      if (error) throw error;
      toast.success(worker.is_active ? 'Salarié archivé' : 'Salarié réactivé');
      fetchData();
    } catch (err) {
      console.error('Error toggling worker:', err);
      toast.error('Impossible de mettre à jour le salarié');
    } finally {
      setTogglingId(null);
    }
  };

  // ---- Delete (if no entries) ----
  const handleDeleteWorker = async (worker: User) => {
    if (!user?.company_id) return;
    setDeletingId(worker.id);
    try {
      const { count, error: countErr } = await supabase
        .from('time_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', worker.id);
      if (countErr) throw countErr;
      if (count && count > 0) {
        toast.error(`Ce salarié a ${count} saisie${count > 1 ? 's' : ''}. Archivez-le plutôt.`);
        return;
      }
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', worker.id)
        .eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Salarié supprimé');
      fetchData();
    } catch (err) {
      console.error('Error deleting worker:', err);
      toast.error('Impossible de supprimer le salarié');
    } finally {
      setDeletingId(null);
    }
  };

  // ---- Resend invitation ----
  const handleResendInvitation = async (invitation: Invitation) => {
    if (!user?.company_id) return;
    setResendingId(invitation.id);
    try {
      const { error } = await supabase.functions.invoke('invite-worker', {
        body: {
          email: invitation.email,
          first_name: invitation.first_name,
          last_name: invitation.last_name,
          phone: invitation.phone || null,
          company_id: user.company_id,
          role: 'worker',
        },
      });
      if (error) throw error;
      toast.success('Invitation renvoyée');
      fetchData();
    } catch (err) {
      console.error('Error resending invitation:', err);
      toast.error("Impossible de renvoyer l'invitation");
    } finally {
      setResendingId(null);
    }
  };

  // ---- Cancel invitation ----
  const handleCancelInvitation = async (invitation: Invitation) => {
    if (!user?.company_id) return;
    setCancellingId(invitation.id);
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', invitation.id)
        .eq('company_id', user.company_id);
      if (error) throw error;
      toast.success('Invitation annulée');
      fetchData();
    } catch (err) {
      console.error('Error cancelling invitation:', err);
      toast.error("Impossible d'annuler l'invitation");
    } finally {
      setCancellingId(null);
    }
  };

  const activeCount = workers.filter(w => w.is_active).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Salaries</h2>
          <p className="text-muted-foreground">
            {activeCount} actif{activeCount > 1 ? 's' : ''}
            {workers.length - activeCount > 0 ? `, ${workers.length - activeCount} archivé${workers.length - activeCount > 1 ? 's' : ''}` : ''}
            {invitations.length > 0 ? `, ${invitations.length} invitation${invitations.length > 1 ? 's' : ''} en attente` : ''}
          </p>
        </div>

        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Inviter un poseur
        </Button>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Invitations en attente
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {invitations.map((invitation) => (
              <Card key={invitation.id} className="border-yellow-200 bg-yellow-50/50">
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <p className="font-semibold">{invitation.first_name} {invitation.last_name}</p>
                    <Badge variant="secondary" className="mt-1">
                      <Clock className="h-3 w-3 mr-1" />
                      En attente
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {invitation.email}
                    </div>
                    {invitation.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {invitation.phone}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    Invité le {format(parseISO(invitation.created_at), 'd MMMM yyyy', { locale: fr })}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleResendInvitation(invitation)}
                      disabled={resendingId === invitation.id || cancellingId === invitation.id}
                    >
                      {resendingId === invitation.id
                        ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        : <RefreshCw className="h-3 w-3 mr-1" />}
                      Renvoyer
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleCancelInvitation(invitation)}
                      disabled={resendingId === invitation.id || cancellingId === invitation.id}
                    >
                      {cancellingId === invitation.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <X className="h-3 w-3" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Workers list */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-muted-foreground" />
          Poseurs
        </h3>
        {workers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucun poseur configuré</p>
              <p className="text-sm text-muted-foreground mt-2">
                Invitez votre premier poseur pour commencer
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workers.map((worker) => (
              <Card
                key={worker.id}
                className={`cursor-pointer transition-colors hover:bg-muted/40 ${worker.is_active ? '' : 'opacity-60'}`}
                onClick={() => setSelectedWorker(worker)}
              >
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{worker.first_name} {worker.last_name}</p>
                      {worker.is_active ? (
                        <Badge variant="default" className="mt-1 bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="mt-1">Archivé</Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{worker.email}</span>
                    </div>
                    {worker.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0" />
                        {worker.phone}
                      </div>
                    )}
                  </div>

                  {worker.last_seen_at && (
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      Vu le {format(parseISO(worker.last_seen_at), 'd MMM yyyy à HH:mm', { locale: fr })}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); openEdit(worker); }}
                      disabled={togglingId === worker.id || deletingId === worker.id}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Modifier
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleToggleActive(worker); }}
                      disabled={togglingId === worker.id || deletingId === worker.id}
                    >
                      {togglingId === worker.id
                        ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        : worker.is_active
                          ? <Archive className="h-3 w-3 mr-1" />
                          : <ArchiveRestore className="h-3 w-3 mr-1" />}
                      {worker.is_active ? 'Archiver' : 'Réactiver'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={(e) => { e.stopPropagation(); handleDeleteWorker(worker); }}
                      disabled={togglingId === worker.id || deletingId === worker.id}
                      title="Supprimer (seulement si aucune saisie)"
                    >
                      {deletingId === worker.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) resetInviteForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un nouveau poseur</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prénom *</Label>
                <Input placeholder="Prénom" value={invFirstName} onChange={(e) => setInvFirstName(e.target.value)} required disabled={invSaving} />
              </div>
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input placeholder="Nom" value={invLastName} onChange={(e) => setInvLastName(e.target.value)} required disabled={invSaving} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" placeholder="email@exemple.fr" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} required disabled={invSaving} />
            </div>
            <div className="space-y-2">
              <Label>Téléphone (optionnel)</Label>
              <Input type="tel" placeholder="06 12 34 56 78" value={invPhone} onChange={(e) => setInvPhone(e.target.value)} disabled={invSaving} />
            </div>
            <Button type="submit" className="w-full" disabled={invSaving}>
              {invSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Envoyer l'invitation
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditingWorker(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le salarié</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditWorker} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prénom *</Label>
                <Input placeholder="Prénom" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} required disabled={editSaving} />
              </div>
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input placeholder="Nom" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} required disabled={editSaving} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input type="tel" placeholder="06 12 34 56 78" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} disabled={editSaving} />
            </div>
            <Button type="submit" className="w-full" disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <WorkerDetailDialog
        worker={selectedWorker}
        onOpenChange={(open) => { if (!open) setSelectedWorker(null); }}
      />
    </div>
  );
}
