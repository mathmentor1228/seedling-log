import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, BookMarked, CreditCard } from 'lucide-react';
import { TextbookOrderTab } from './TextbookOrderTab';
import { TextbookDistributionTab } from './TextbookDistributionTab';
import { TextbookPaymentTab } from './TextbookPaymentTab';
import { useAuth } from '@/lib/auth';

const PAYMENT_ALLOWED_EMAILS = ['bfkor8810@naver.com'];

export function TextbookManagement() {
  const { user, role } = useAuth();
  const canSeePayment = role === 'admin' || role === 'assistant' || PAYMENT_ALLOWED_EMAILS.includes(user?.email || '');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">교재 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {canSeePayment ? '교재 신청 · 배부 · 수납을 한 곳에서 관리합니다' : '교재 신청 · 배부를 관리합니다'}
        </p>
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="mb-4">
          <TabsTrigger value="orders" className="gap-1.5"><Package className="w-3.5 h-3.5" />신청/입고</TabsTrigger>
          <TabsTrigger value="distribution" className="gap-1.5"><BookMarked className="w-3.5 h-3.5" />배부</TabsTrigger>
          {canSeePayment && (
            <TabsTrigger value="payment" className="gap-1.5"><CreditCard className="w-3.5 h-3.5" />수납</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="orders"><TextbookOrderTab /></TabsContent>
        <TabsContent value="distribution"><TextbookDistributionTab /></TabsContent>
        {canSeePayment && (
          <TabsContent value="payment"><TextbookPaymentTab /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
