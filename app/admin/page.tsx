'use client';

import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { LogOut, Clock } from 'lucide-react';
import AdminPlanning from '@/components/admin-planning';

export default function AdminPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative bg-primary text-primary-foreground rounded-lg p-2">
              <Clock className="h-5 w-5" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Battime</h1>
              <p className="text-sm text-muted-foreground">
                {user?.first_name} {user?.last_name}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Deconnexion
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <AdminPlanning />
      </main>
    </div>
  );
}
