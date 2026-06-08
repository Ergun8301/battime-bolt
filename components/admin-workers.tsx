'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { User, Invitation } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Phone, Mail, Clock, CheckCircle, UserCheck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

export default function AdminWorkers() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user?.company_id) return;

    try {
      const [workersRes, invitationsRes] = await Promise.all([
        supabase
          .from('users')
          .select('*')
          .eq('company_id', user.company_id)
          .eq('role', 'worker')
          .order('created_at', { ascending: false }),
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

      const activeWorkerEmails = new Set((workersRes.data || []).map(w => w.email.toLowerCase()));
      const pendingInvites = (invitationsRes.data || []).filter(
        inv => !activeWorkerEmails.has(inv.email.toLowerCase())
      );

      setWorkers(workersRes.data || []);
      setInvitations(pendingInvites);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger les donnees');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.company_id) return;

    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('invite-worker', {
        body: {
          email,
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          company_id: user.company_id,
          role: 'worker',
        },
      });

      if (error) throw error;

      toast.success('Invitation envoyee');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error('Error inviting worker:', err);
      toast.error('Impossible d\'envoyer l\'invitation');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
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
            {workers.length} actif{workers.length > 1 ? 's' : ''}, {invitations.length} invitation{invitations.length > 1 ? 's' : ''} en attente
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Inviter un poseur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un nouveau poseur</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prenom</Label>
                  <Input
                    placeholder="Prenom"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input
                    placeholder="Nom"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="email@exemple.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>Telephone (optionnel)</Label>
                <Input
                  type="tel"
                  placeholder="06 12 34 56 78"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={saving}
                />
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Envoi...' : 'Envoyer l\'invitation'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {invitation.first_name} {invitation.last_name}
                      </p>
                      <Badge variant="secondary" className="mt-1">
                        <Clock className="h-3 w-3 mr-1" />
                        En attente
                      </Badge>
                    </div>
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

                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    Invite le {format(parseISO(invitation.created_at), 'd MMMM yyyy', { locale: fr })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-muted-foreground" />
          Comptes actifs
        </h3>
        {workers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucun poseur configure</p>
              <p className="text-sm text-muted-foreground mt-2">
                Invitez votre premier poseur pour commencer
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workers.map((worker) => (
              <Card key={worker.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {worker.first_name} {worker.last_name}
                      </p>
                      {worker.is_active ? (
                        <Badge variant="default" className="mt-1 bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="mt-1">
                          Inactif
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {worker.email}
                    </div>
                    {worker.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {worker.phone}
                      </div>
                    )}
                  </div>

                  {worker.last_seen_at && (
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Derniere connexion : {format(parseISO(worker.last_seen_at), 'd MMMM yyyy a HH:mm', { locale: fr })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
