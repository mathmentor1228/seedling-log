import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { CalendarDays, Receipt, AlertTriangle, Settings } from 'lucide-react';
import { TuitionCalendarDashboard } from './TuitionCalendarDashboard';
import { PaymentRecords } from './PaymentRecords';
import { OverdueList } from './OverdueList';
import { BillingGenerator } from './BillingGenerator';

export function TuitionDashboard() {
  const [tab, setTab] = useState('calendar');

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold">수강료 관리</h1>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="calendar" className="gap-1.5">
              <CalendarDays className="w-4 h-4" />달력
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <Receipt className="w-4 h-4" />납부이력
            </TabsTrigger>
            <TabsTrigger value="overdue" className="gap-1.5">
              <AlertTriangle className="w-4 h-4" />미납
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-1.5">
              <Settings className="w-4 h-4" />청구설정
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar"><TuitionCalendarDashboard /></TabsContent>
          <TabsContent value="payments"><PaymentRecords /></TabsContent>
          <TabsContent value="overdue"><OverdueList /></TabsContent>
          <TabsContent value="billing"><BillingGenerator /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
