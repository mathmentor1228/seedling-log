import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { CalendarDays, Receipt, AlertTriangle, Settings, Users, Wallet } from 'lucide-react';
import { TuitionCalendarDashboard } from './TuitionCalendarDashboard';
import { PaymentRecords } from './PaymentRecords';
import { OverdueList } from './OverdueList';
import { BillingGenerator } from './BillingGenerator';
import { SiblingGroupManager } from './SiblingGroupManager';
import { EnglishPayrollTab } from './EnglishPayrollTab';
import { useAuth } from '@/lib/auth';

export function TuitionDashboard() {
  const [tab, setTab] = useState('calendar');
  const { role, user } = useAuth();
  const isAdmin = role === 'admin' || user?.email === 'bfkor8810@naver.com';

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold">수강료 관리</h1>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className={`w-full grid ${isAdmin ? 'grid-cols-6' : 'grid-cols-5'}`}>
            <TabsTrigger value="calendar" className="gap-1.5">
              <CalendarDays className="w-4 h-4" />달력
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <Receipt className="w-4 h-4" />납부이력
            </TabsTrigger>
            <TabsTrigger value="overdue" className="gap-1.5">
              <AlertTriangle className="w-4 h-4" />미납
            </TabsTrigger>
            <TabsTrigger value="siblings" className="gap-1.5">
              <Users className="w-4 h-4" />형제연결
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-1.5">
              <Settings className="w-4 h-4" />청구설정
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="payroll" className="gap-1.5">
                <Wallet className="w-4 h-4" />영어 급여
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="calendar"><TuitionCalendarDashboard /></TabsContent>
          <TabsContent value="payments"><PaymentRecords /></TabsContent>
          <TabsContent value="overdue"><OverdueList /></TabsContent>
          <TabsContent value="siblings"><SiblingGroupManager /></TabsContent>
          <TabsContent value="billing"><BillingGenerator /></TabsContent>
          {isAdmin && <TabsContent value="payroll"><EnglishPayrollTab /></TabsContent>}
        </Tabs>
      </div>
    </AppLayout>
  );
}
