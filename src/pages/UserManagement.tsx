import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, isAdmin } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCog, Shield, GraduationCap, Users } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface UserWithRole {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  roles: AppRole[];
}

export default function UserManagement() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, AppRole | 'none'>>({});

  const fetchUsers = async () => {
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, created_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const roles = (userRoles || [])
          .filter((ur) => ur.user_id === profile.id)
          .map((ur) => ur.role);
        return {
          ...profile,
          roles,
        };
      });

      setUsers(usersWithRoles);

      // Initialize selected roles state
      const initialSelected: Record<string, AppRole | 'none'> = {};
      usersWithRoles.forEach((user) => {
        if (user.roles.length > 0) {
          // Prioritize: admin > teacher > assistant
          if (user.roles.includes('admin')) {
            initialSelected[user.id] = 'admin';
          } else if (user.roles.includes('teacher')) {
            initialSelected[user.id] = 'teacher';
          } else if (user.roles.includes('assistant')) {
            initialSelected[user.id] = 'assistant';
          }
        } else {
          initialSelected[user.id] = 'none';
        }
      });
      setSelectedRoles(initialSelected);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: '오류',
        description: '사용자 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin(role)) {
      fetchUsers();
    }
  }, [role]);

  const handleRoleChange = (userId: string, newRole: AppRole | 'none') => {
    setSelectedRoles((prev) => ({ ...prev, [userId]: newRole }));
  };

  const handleSaveRole = async (userId: string) => {
    const newRole = selectedRoles[userId];
    if (!newRole) return;

    setSaving(userId);
    try {
      if (newRole === 'none') {
        // Remove all roles for this user
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId);

        if (error) throw error;

        toast({
          title: '완료',
          description: '사용자 권한이 제거되었습니다.',
        });
      } else {
        // First delete existing roles, then insert new one
        await supabase.from('user_roles').delete().eq('user_id', userId);

        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });

        if (error) throw error;

        toast({
          title: '완료',
          description: `${newRole} 권한이 부여되었습니다.`,
        });
      }

      // Refresh the user list
      await fetchUsers();
    } catch (error) {
      console.error('Error saving role:', error);
      toast({
        title: '오류',
        description: '권한 변경에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };

  const getRoleBadge = (roles: AppRole[]) => {
    if (roles.length === 0) {
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground">
          권한 미부여
        </Badge>
      );
    }

    return roles.map((r) => {
      switch (r) {
        case 'admin':
          return (
            <Badge key={r} className="bg-red-500 text-white">
              <Shield className="w-3 h-3 mr-1" />
              Admin
            </Badge>
          );
        case 'teacher':
          return (
            <Badge key={r} className="bg-blue-500 text-white">
              <GraduationCap className="w-3 h-3 mr-1" />
              Teacher
            </Badge>
          );
        case 'assistant':
          return (
            <Badge key={r} className="bg-green-500 text-white">
              <Users className="w-3 h-3 mr-1" />
              Assistant
            </Badge>
          );
        default:
          return null;
      }
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const hasRoleChanged = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return false;

    const currentSelected = selectedRoles[userId];
    const currentRole =
      user.roles.length > 0
        ? user.roles.includes('admin')
          ? 'admin'
          : user.roles.includes('teacher')
          ? 'teacher'
          : 'assistant'
        : 'none';

    return currentSelected !== currentRole;
  };

  if (!isAdmin(role)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">접근 권한이 없습니다.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
          <UserCog className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">사용자 관리</h1>
          <p className="text-muted-foreground">사용자 권한을 관리합니다</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            등록된 사용자 ({users.length}명)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>현재 권한</TableHead>
                <TableHead>권한 변경</TableHead>
                <TableHead className="w-[100px]">저장</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(user.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">{getRoleBadge(user.roles)}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={selectedRoles[user.id] || 'none'}
                      onValueChange={(value) =>
                        handleRoleChange(user.id, value as AppRole | 'none')
                      }
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="권한 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">권한 없음</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="assistant">Assistant</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => handleSaveRole(user.id)}
                      disabled={saving === user.id || !hasRoleChanged(user.id)}
                    >
                      {saving === user.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        '저장'
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    등록된 사용자가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
