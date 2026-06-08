'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LogOut, Clock, Calendar } from 'lucide-react';
import PoseurDay from '@/components/poseur-day';
import PoseurHistory from '@/components/poseur-history';

export default function PoseurPage() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('day');

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground rounded-lg p-1.5">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-base">Battime</h1>
              <p className="text-xs text-muted-foreground">
                {user?.first_name} {user?.last_name}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="day" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Ma journee
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value="day">
            <PoseurDay />
          </TabsContent>
          <TabsContent value="history">
            <PoseurHistory />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
