'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LogOut, Clock, CalendarDays, History } from 'lucide-react';
import PoseurDay from '@/components/poseur-day';
import PoseurWeek from '@/components/poseur-week';
import PoseurHistory from '@/components/poseur-history';

export default function PoseurPage() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('day');

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative bg-primary text-primary-foreground rounded-lg p-1.5">
              <Clock className="h-5 w-5" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
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

      <main className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4 lg:max-w-2xl lg:mx-auto">
            <TabsTrigger value="day" className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>Ma journée</span>
            </TabsTrigger>
            <TabsTrigger value="week" className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              <span>Ma semaine</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <History className="h-4 w-4" />
              <span>Historique</span>
            </TabsTrigger>
          </TabsList>

          {/* Day & history stay phone-width and centered even on desktop;
              only the week view uses the full width for its grid. */}
          <TabsContent value="day">
            <div className="lg:max-w-2xl lg:mx-auto">
              <PoseurDay />
            </div>
          </TabsContent>
          <TabsContent value="week">
            <PoseurWeek />
          </TabsContent>
          <TabsContent value="history">
            <div className="lg:max-w-2xl lg:mx-auto">
              <PoseurHistory />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
