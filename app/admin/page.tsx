'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LogOut, Clock, Calendar, LayoutDashboard } from 'lucide-react';
import AdminPlanning from '@/components/admin-planning';
import AdminDashboard from '@/components/admin-dashboard';

export default function AdminPage() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('planning');

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 max-w-md">
            <TabsTrigger value="planning" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Planning
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Tableau de bord</span>
              <span className="sm:hidden">Tableau</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planning">
            <AdminPlanning />
          </TabsContent>
          <TabsContent value="dashboard">
            <AdminDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
