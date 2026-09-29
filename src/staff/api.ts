import { useQuery } from '@tanstack/react-query';
import type {
  StaffMe,
  StaffMenu,
  StaffOrder,
  StaffReservation,
  StaffSettings,
  StaffTable,
  StaffUser,
} from '@shared/api-types';
import { api } from '@/lib/api';

export const staffKeys = {
  all: ['staff'] as const,
  me: ['staff', 'me'] as const,
  reservations: ['staff', 'reservations'] as const,
  orders: ['staff', 'orders'] as const,
  tables: ['staff', 'tables'] as const,
  menu: ['staff', 'menu'] as const,
  settings: ['staff', 'settings'] as const,
  users: ['staff', 'users'] as const,
};

export type ReservationList = {
  reservations: StaffReservation[];
  counts: { pendingUpcoming: number; today: string };
};

export const useMe = () =>
  useQuery({ queryKey: staffKeys.me, queryFn: () => api<StaffMe>('/api/staff/me'), retry: false, staleTime: 5 * 60_000 });

export const useReservations = (params: Record<string, string | undefined>, opts: { live: boolean; enabled?: boolean }) => {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return useQuery({
    queryKey: [...staffKeys.reservations, qs],
    queryFn: () => api<ReservationList>(`/api/staff/reservations?${qs}`),
    refetchInterval: opts.live ? false : 30_000,
    enabled: opts.enabled ?? true,
  });
};

export const useReservationCounts = (live: boolean, enabled = true) =>
  useQuery({
    queryKey: [...staffKeys.reservations, 'counts'],
    queryFn: () => api<ReservationList['counts']>('/api/staff/reservations/counts'),
    refetchInterval: live ? false : 15_000,
    refetchIntervalInBackground: !live,
    enabled,
  });

export const useOrders = (scope: 'open' | 'today', live: boolean, enabled = true) =>
  useQuery({
    queryKey: [...staffKeys.orders, scope],
    queryFn: () => api<StaffOrder[]>(`/api/staff/orders?scope=${scope}`),
    // Without the live stream this poll is how new orders arrive: keep it quick, even in a background tab.
    refetchInterval: live ? false : 5_000,
    refetchIntervalInBackground: !live,
    enabled,
  });

export const useTables = () => useQuery({ queryKey: staffKeys.tables, queryFn: () => api<StaffTable[]>('/api/staff/tables') });
export const useStaffMenu = () => useQuery({ queryKey: staffKeys.menu, queryFn: () => api<StaffMenu>('/api/staff/menu') });
export const useSettings = () => useQuery({ queryKey: staffKeys.settings, queryFn: () => api<StaffSettings>('/api/staff/settings') });
export const useUsers = () => useQuery({ queryKey: staffKeys.users, queryFn: () => api<StaffUser[]>('/api/staff/users') });
