'use client';

import { useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../lib/supabase';

type RefreshFn = () => void | Promise<void>;

/**
 * useRealtimeDashboard
 *
 * Se Supabase estiver configurado (NEXT_PUBLIC_SUPABASE_URL):
 *   → Assina as tabelas work_orders, executions e incidents via Realtime
 *   → Chama onRefresh() a cada mudança detectada (debounced 1s)
 *
 * Se não estiver configurado:
 *   → Usa polling de 30 segundos como fallback
 */
export function useRealtimeDashboard(onRefresh: RefreshFn, companyId: string) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void onRefresh();
    }, 1000);
  }, [onRefresh]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      // Fallback: polling a cada 30s
      const interval = setInterval(() => void onRefresh(), 30_000);
      return () => clearInterval(interval);
    }

    // Supabase Realtime — assina mudanças nas tabelas críticas
    const channel = supabase
      .channel(`dashboard:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${companyId}` },
        debouncedRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'executions', filter: `company_id=eq.${companyId}` },
        debouncedRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents', filter: `company_id=eq.${companyId}` },
        debouncedRefresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Dashboard inscrito para empresa ${companyId}`);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [companyId, debouncedRefresh, onRefresh]);
}
