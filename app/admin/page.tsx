'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LogOut, Clock, Calendar, Building2, Users, FileDown } from 'lucide-react';
import AdminDashboard from '@/components/admin-dashboard';
import AdminPlanning from '@/components/admin-planning';
import AdminWorksites from '@/components/admin-worksites';
import AdminWorkers from '@/components/admin-workers';
import AdminExport from '@/components/admin-export';

export default function AdminPage() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground rounded-lg p-2">
              <Clock className="h-5 w-5" />
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
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Tableau de bord</span>
              <span className="sm:hidden">Tableau</span>
            </TabsTrigger>
            <TabsTrigger value="planning" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Planning</span>
              <span className="sm:hidden">Planning</span>
            </TabsTrigger>
            <TabsTrigger value="worksites" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Chantiers</span>
              <span className="sm:hidden">Chantiers</span>
            </TabsTrigger>
            <TabsTrigger value="workers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Salaries</span>
              <span className="sm:hidden">Salaries</span>
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
              <span className="sm:hidden">Export</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <AdminDashboard />
          </TabsContent>
          <TabsContent value="planning">
            <AdminPlanning />
          </TabsContent>
          <TabsContent value="worksites">
            <AdminWorksites />
          </TabsContent>
          <TabsContent value="workers">
            <AdminWorkers />
          </TabsContent>
          <TabsContent value="export">
            <AdminExport />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
