import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checklistsApi, assetsApi, uploadApi, ExecutionItemPayload, Asset } from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Envia fotos ainda salvas localmente (uris file://) e devolve os itens com URLs remotas */
export async function resolvePendingPhotos(items: ExecutionItemPayload[]): Promise<ExecutionItemPayload[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.photoUrl || item.photoUrl.startsWith('http')) return item;
      const url = await uploadApi.uploadPhoto(item.photoUrl, 'executions');
      return { ...item, photoUrl: url };
    }),
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueuedExecution {
  localId: string;
  checklistId: string;
  assetId?: string;
  checklistName: string;
  items: ExecutionItemPayload[];
  notes?: string;
  signatureUrl?: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface OfflineState {
  queue: QueuedExecution[];
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  assetCache: Asset[];
  assetCacheAt: string | null;

  // Actions
  enqueue: (execution: Omit<QueuedExecution, 'localId' | 'queuedAt' | 'attempts'>) => string;
  removeFromQueue: (localId: string) => void;
  syncAll: () => Promise<{ synced: number; failed: number }>;
  getPendingCount: () => number;
  clearAll: () => void;

  // Asset cache
  refreshAssetCache: () => Promise<void>;
  findAssetByQR: (qrCode: string) => Asset | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      queue: [],
      syncStatus: 'idle',
      lastSyncAt: null,
      assetCache: [],
      assetCacheAt: null,

      enqueue: (execution) => {
        const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const item: QueuedExecution = {
          ...execution,
          localId,
          queuedAt: new Date().toISOString(),
          attempts: 0,
        };
        set((s) => ({ queue: [...s.queue, item] }));
        return localId;
      },

      removeFromQueue: (localId) => {
        set((s) => ({ queue: s.queue.filter((e) => e.localId !== localId) }));
      },

      syncAll: async () => {
        const { queue } = get();
        if (queue.length === 0) return { synced: 0, failed: 0 };

        set({ syncStatus: 'syncing' });

        let synced = 0;
        let failed = 0;

        for (const item of queue) {
          try {
            // 1. Enviar fotos pendentes (capturadas offline) e obter URLs definitivas
            const resolvedItems = await resolvePendingPhotos(item.items);

            // 2. Iniciar execução
            const startRes = await checklistsApi.startExecution(
              item.checklistId,
              item.assetId,
            );
            const executionId = startRes.data.id;

            // 3. Concluir com as respostas salvas offline
            await checklistsApi.submitExecution(
              executionId,
              resolvedItems,
              item.notes,
              item.signatureUrl,
            );

            // 3. Remover da fila
            get().removeFromQueue(item.localId);
            synced++;
          } catch (err: unknown) {
            const msg = String(
              (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'Erro de rede',
            );

            // Atualizar tentativas e erro
            set((s) => ({
              queue: s.queue.map((e) =>
                e.localId === item.localId
                  ? { ...e, attempts: e.attempts + 1, lastError: msg }
                  : e,
              ),
            }));
            failed++;
          }
        }

        set({
          syncStatus: failed > 0 ? 'error' : 'idle',
          lastSyncAt: new Date().toISOString(),
        });

        return { synced, failed };
      },

      getPendingCount: () => get().queue.length,

      clearAll: () => set({ queue: [], syncStatus: 'idle' }),

      refreshAssetCache: async () => {
        try {
          const res = await assetsApi.list(1, 200);
          set({
            assetCache: res.data.data,
            assetCacheAt: new Date().toISOString(),
          });
        } catch { /* silencioso — mantém cache anterior */ }
      },

      findAssetByQR: (qrCode: string) => {
        return get().assetCache.find((a) => a.qrCode === qrCode) ?? null;
      },
    }),
    {
      name: 'visao360-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
