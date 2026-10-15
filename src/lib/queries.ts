import { queryOptions, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PublicMenu, PublicSite } from '@shared/api-types';
import { openStatus, type OpenStatus } from '@shared/availability';
import { api } from './api';
import { fallbackMenu, isOutage, saveMenu, type MenuResult } from './menuFallback';

export const siteQuery = queryOptions({
  queryKey: ['site'],
  queryFn: () => api<PublicSite>('/api/public/site'),
  staleTime: 60_000,
  retry: 1,
});

export const menuQuery = queryOptions({
  queryKey: ['menu'],
  // During an outage the site still shows a menu, marked `offline` (see menuFallback).
  queryFn: async (): Promise<MenuResult> => {
    try {
      const menu = await api<PublicMenu>('/api/public/menu');
      saveMenu(menu);
      return menu;
    } catch (err) {
      if (!isOutage(err)) throw err;
      return fallbackMenu();
    }
  },
  staleTime: 60_000,
  retry: 1,
});

export const useSite = () => useQuery(siteQuery);
export const useMenu = () => useQuery(menuQuery);

/** Re-renders every minute so time-based labels stay current. */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function useOpenStatus(): OpenStatus | null {
  const { data } = useSite();
  const now = useMinuteTick();
  if (!data) return null;
  return openStatus(new Date(now), data.timeZone, data.hours, data.specialDays);
}
