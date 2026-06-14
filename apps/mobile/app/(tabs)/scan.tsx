import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Animated, ScrollView, TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  assetsApi, checklistsApi, workOrdersApi, uploadApi,
  Asset, Checklist, AssetHistory,
} from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { useOfflineStore } from '../../stores/offline.store';
import { useNetwork } from '../../hooks/useNetwork';
import { ExecutionFlow } from '../../components/ChecklistExecutionFlow';
import { analyzeScoreTrend, getRiskItems, getSuggestedAnswers } from '../../utils/assetIntelligence';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ScanView = 'camera' | 'asset' | 'executing' | 'reporting';
type AssetTab = 'checklists' | 'history' | 'actions';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo', INACTIVE: 'Inativo', MAINTENANCE: 'Em manutenção', DECOMMISSIONED: 'Desativado',
};
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: '#dcfce7', text: '#16a34a' },
  INACTIVE: { bg: '#f3f4f6', text: '#6b7280' },
  MAINTENANCE: { bg: '#fef9c3', text: '#ca8a04' },
  DECOMMISSIONED: { bg: '#fee2e2', text: '#dc2626' },
};
const WO_STATUS_COLORS: Record<string, string> = {
  OPEN: '#3b82f6', ASSIGNED: '#8b5cf6', IN_PROGRESS: '#f59e0b',
  WAITING_PARTS: '#f97316', COMPLETED: '#16a34a', CANCELLED: '#6b7280',
};
const WO_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta', ASSIGNED: 'Atribuída', IN_PROGRESS: 'Em andamento',
  WAITING_PARTS: 'Aguardando peças', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
};
const CHECKLIST_TYPE: Record<string, string> = {
  PREVENTIVE: 'Preventiva', CORRECTIVE: 'Corretiva', INSPECTION: 'Inspeção', AUDIT: 'Auditoria',
};

// ─── Tela principal ────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ScanView>('camera');
  const [activeTab, setActiveTab] = useState<AssetTab>('checklists');
  const [asset, setAsset] = useState<Asset | null>(null);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [history, setHistory] = useState<AssetHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeChecklist, setActiveChecklist] = useState<Checklist | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);

  // Reportar problema
  const [reportDescription, setReportDescription] = useState('');
  const [reportPhoto, setReportPhoto] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const scanAnim = useRef(new Animated.Value(0)).current;
  const { isOnline } = useNetwork();
  const { findAssetByQR, refreshAssetCache, cacheChecklistsForAsset, getCachedChecklists } = useOfflineStore();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (isOnline) refreshAssetCache();
  }, [isOnline]);

  // Carrega histórico do equipamento em segundo plano (alimenta os alertas inteligentes)
  useEffect(() => {
    if (asset && isOnline && !history) loadHistory();
  }, [asset, isOnline]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  function resetScan() {
    setScanned(false);
    setView('camera');
    setAsset(null);
    setChecklists([]);
    setHistory(null);
    setActiveChecklist(null);
    setExecutionId(null);
    setActiveTab('checklists');
    setReportDescription('');
    setReportPhoto(null);
  }

  // ── Passo 1: Scanner QR ────────────────────────────────────────────────────

  async function handleQRScanned({ data }: BarcodeScanningResult) {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    let qrCode = data;
    if (data.includes('visao360://asset/')) {
      const parts = data.split('?qr=');
      qrCode = parts[1] ?? data.split('/').pop() ?? data;
    }

    try {
      let foundAsset = isOnline ? null : findAssetByQR(qrCode);
      let fetchedChecklists: Checklist[] = [];

      if (isOnline) {
        const assetRes = await assetsApi.findByQRCode(qrCode).catch(() => null);

        if (!assetRes) {
          const cached = findAssetByQR(qrCode);
          if (!cached) {
            Alert.alert('Equipamento não encontrado', `QR Code não reconhecido.`,
              [{ text: 'Tentar novamente', onPress: resetScan }]);
            return;
          }
          foundAsset = cached;
        } else {
          foundAsset = assetRes.data;
        }

        // Buscar checklists específicos do ativo
        const clRes = await assetsApi.getChecklists(foundAsset.id).catch(() => null);
        if (clRes) {
          fetchedChecklists = clRes.data;
          setChecklists(fetchedChecklists);
          cacheChecklistsForAsset(foundAsset.id, fetchedChecklists);
        } else {
          fetchedChecklists = getCachedChecklists(foundAsset.id);
          setChecklists(fetchedChecklists);
        }
      } else if (foundAsset) {
        fetchedChecklists = getCachedChecklists(foundAsset.id);
        setChecklists(fetchedChecklists);
        Alert.alert('Modo offline', 'Usando dados salvos.', [{ text: 'OK' }]);
      } else {
        Alert.alert('Sem conexão', 'Conecte-se e tente novamente.',
          [{ text: 'OK', onPress: resetScan }]);
        return;
      }

      if (!foundAsset) {
        Alert.alert('Não encontrado', 'QR Code não reconhecido.',
          [{ text: 'Tentar novamente', onPress: resetScan }]);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAsset(foundAsset);

      // Equipamento com apenas 1 checklist disponível: pula a tela de detalhes e inicia direto
      if (fetchedChecklists.length === 1) {
        await startChecklist(fetchedChecklists[0], foundAsset.id);
        return;
      }

      setView('asset');
    } catch {
      Alert.alert('Erro', 'Falha ao buscar equipamento.',
        [{ text: 'OK', onPress: resetScan }]);
    } finally {
      setLoading(false);
    }
  }

  // ── Histórico ─────────────────────────────────────────────────────────────

  async function loadHistory() {
    if (!asset || history) return;
    setHistoryLoading(true);
    try {
      const res = await assetsApi.getHistory(asset.id);
      setHistory(res.data);
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleTabChange(tab: AssetTab) {
    setActiveTab(tab);
    if (tab === 'history') loadHistory();
  }

  // ── Alterar status ─────────────────────────────────────────────────────────

  function promptStatusChange() {
    if (!asset) return;
    const options = Object.entries(STATUS_LABELS)
      .filter(([key]) => key !== asset.status)
      .map(([key, label]) => ({
        text: label,
        onPress: async () => {
          try {
            const res = await assetsApi.updateStatus(asset.id, key);
            setAsset(res.data);
            Alert.alert('✅ Status atualizado', `Equipamento agora: ${label}`);
          } catch {
            Alert.alert('Erro', 'Não foi possível alterar o status.');
          }
        },
      }));
    Alert.alert('Alterar status', `Status atual: ${STATUS_LABELS[asset.status]}`, [
      ...options,
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  // ── Executar checklist ─────────────────────────────────────────────────────

  async function startChecklist(cl: Checklist, assetIdOverride?: string) {
    setLoading(true);
    setActiveChecklist(cl);
    if (isOnline) {
      try {
        const res = await checklistsApi.startExecution(cl.id, assetIdOverride ?? asset?.id);
        setExecutionId(res.data.id);
      } catch {
        setExecutionId(null);
      }
    }
    setLoading(false);
    setView('executing');
  }

  // ── Reportar problema ─────────────────────────────────────────────────────

  async function pickPhoto() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setReportPhoto(result.assets[0].uri);
    }
  }

  async function submitReport() {
    if (!asset || !user) return;
    if (!reportDescription.trim()) {
      Alert.alert('Descrição obrigatória', 'Descreva o problema encontrado.');
      return;
    }
    setReportSubmitting(true);
    try {
      let photoUrls: string[] = [];
      if (reportPhoto && isOnline) {
        const url = await uploadApi.uploadPhoto(reportPhoto, 'incidents').catch(() => null);
        if (url) photoUrls = [url];
      }
      await workOrdersApi.create({
        title: `Ocorrência — ${asset.name}`,
        description: reportDescription.trim(),
        unitId: asset.unit.id,
        assetId: asset.id,
        priority: 'HIGH',
        photoUrls,
      });
      Alert.alert('✅ Ocorrência registrada', 'A equipe será notificada.', [
        { text: 'OK', onPress: () => { setView('asset'); setActiveTab('actions'); setReportDescription(''); setReportPhoto(null); } },
      ]);
    } catch {
      Alert.alert('Erro', 'Falha ao registrar ocorrência. Tente novamente.');
    } finally {
      setReportSubmitting(false);
    }
  }

  // ── Abrir OS ───────────────────────────────────────────────────────────────

  async function openWorkOrder() {
    if (!asset || !user) return;
    Alert.alert('Abrir Ordem de Serviço', `Criar OS para: ${asset.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Criar OS',
        onPress: async () => {
          try {
            await workOrdersApi.create({
              title: `Manutenção — ${asset.name}`,
              description: `OS criada via scanner QR Code do equipamento ${asset.code ?? asset.id}`,
              unitId: asset.unit.id,
              assetId: asset.id,
              priority: 'MEDIUM',
            });
            Alert.alert('✅ OS criada!', 'A ordem de serviço foi criada com sucesso.',
              [{ text: 'OK', onPress: resetScan }]);
          } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            Alert.alert('Erro', msg ?? 'Falha ao criar OS');
          }
        },
      },
    ]);
  }

  // ─── Render: Camera ────────────────────────────────────────────────────────

  if (!permission) return <View style={s.center}><ActivityIndicator color="#2563eb" size="large" /></View>;

  if (!permission.granted) {
    return (
      <View style={s.permContainer}>
        <Ionicons name="camera-outline" size={64} color="#2563eb" />
        <Text style={s.permTitle}>Câmera necessária</Text>
        <Text style={s.permText}>O Visão360 usa a câmera para escanear QR Codes dos equipamentos.</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Permitir câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (view === 'camera') {
    const scanY = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleQRScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={s.overlay}>
          <View style={s.topMask} />
          <View style={s.midRow}>
            <View style={s.sideMask} />
            <View style={s.scanWindow}>
              {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
                <View key={c} style={[s.corner,
                  c[0] === 't' ? { top: 0 } : { bottom: 0 },
                  c[1] === 'l' ? { left: 0 } : { right: 0 },
                  c[0] === 't' ? { borderTopWidth: 3 } : { borderBottomWidth: 3 },
                  c[1] === 'l' ? { borderLeftWidth: 3 } : { borderRightWidth: 3 },
                ]} />
              ))}
              <Animated.View style={[s.scanLine, { transform: [{ translateY: scanY }] }]} />
            </View>
            <View style={s.sideMask} />
          </View>
          <View style={s.botMask}>
            <Text style={s.scanHint}>Aponte para o QR Code do equipamento</Text>
            {loading && <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />}
          </View>
        </View>
      </View>
    );
  }

  // ─── Render: Asset ─────────────────────────────────────────────────────────

  if (view === 'asset' && asset) {
    const statusColor = STATUS_COLORS[asset.status] ?? STATUS_COLORS.INACTIVE;

    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        {/* Header */}
        <View style={[s.header, { paddingTop: 56 }]}>
          <TouchableOpacity onPress={resetScan} style={s.closeBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{asset.name}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Card do asset */}
        <View style={s.assetCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={s.assetIcon}>
              <Ionicons name="hardware-chip-outline" size={28} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.assetName} numberOfLines={1}>{asset.name}</Text>
              <Text style={s.assetCode}>{asset.category}{asset.brand ? ` · ${asset.brand}` : ''}</Text>
              <Text style={{ fontSize: 12, color: '#9ca3af' }}>{asset.unit.name}</Text>
            </View>
            <TouchableOpacity onPress={promptStatusChange}
              style={[s.badge, { backgroundColor: statusColor.bg }]}>
              <Text style={{ color: statusColor.text, fontWeight: '700', fontSize: 11 }}>
                {STATUS_LABELS[asset.status] ?? asset.status}
              </Text>
              <Ionicons name="chevron-down" size={12} color={statusColor.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={s.tabBar}>
          {(['checklists', 'history', 'actions'] as AssetTab[]).map((tab) => (
            <TouchableOpacity key={tab} style={[s.tabBtn, activeTab === tab && s.tabBtnActive]}
              onPress={() => handleTabChange(tab)}>
              <Text style={[s.tabBtnText, activeTab === tab && s.tabBtnTextActive]}>
                {tab === 'checklists' ? '📋 Checklists' : tab === 'history' ? '📅 Histórico' : '⚡ Ações'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Conteúdo das tabs */}
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>

          {/* ── Tab: Checklists ── */}
          {activeTab === 'checklists' && (
            <>
              {/* Alerta de tendência de score */}
              {(() => {
                const trend = history ? analyzeScoreTrend(history.executions) : null;
                if (!trend) return null;
                return (
                  <View style={[s.scoreTrendBanner, trend.level === 'danger' ? s.scoreTrendDanger : s.scoreTrendWarning]}>
                    <Ionicons
                      name={trend.level === 'danger' ? 'alert-circle' : 'trending-down'}
                      size={18}
                      color={trend.level === 'danger' ? '#dc2626' : '#ca8a04'}
                    />
                    <Text style={[s.scoreTrendText, { color: trend.level === 'danger' ? '#dc2626' : '#ca8a04' }]}>
                      {trend.message}
                    </Text>
                  </View>
                );
              })()}

              {checklists.length === 0 ? (
                <View style={s.emptyBox}>
                  <Ionicons name="clipboard-outline" size={40} color="#d1d5db" />
                  <Text style={s.emptyText}>Nenhum checklist vinculado</Text>
                  <Text style={s.emptySubtext}>Associe checklists a este equipamento no painel web</Text>
                </View>
              ) : (
                checklists.map((cl) => (
                  <TouchableOpacity key={cl.id} style={s.checklistRow} onPress={() => startChecklist(cl)}
                    disabled={loading}>
                    <View style={s.checklistIcon}>
                      <Ionicons name="clipboard-outline" size={20} color="#2563eb" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.checklistName}>{cl.name}</Text>
                      <Text style={s.checklistMeta}>
                        {cl.items.length} itens · {CHECKLIST_TYPE[cl.type] ?? cl.type}
                        {cl.intervalDays ? ` · a cada ${cl.intervalDays}d` : ''}
                      </Text>
                    </View>
                    {loading ? <ActivityIndicator size="small" color="#2563eb" />
                      : <Ionicons name="chevron-forward" size={18} color="#2563eb" />}
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* ── Tab: Histórico ── */}
          {activeTab === 'history' && (
            <>
              {historyLoading ? (
                <View style={s.center}>
                  <ActivityIndicator color="#2563eb" size="large" style={{ marginTop: 40 }} />
                </View>
              ) : !history ? (
                <View style={s.emptyBox}>
                  <Ionicons name="time-outline" size={40} color="#d1d5db" />
                  <Text style={s.emptyText}>Sem histórico disponível</Text>
                </View>
              ) : (
                <>
                  {/* Inspeções */}
                  <Text style={s.sectionTitle}>Inspeções realizadas</Text>
                  {history.executions.length === 0 ? (
                    <Text style={s.emptySubtext}>Nenhuma inspeção realizada ainda</Text>
                  ) : history.executions.map((ex) => (
                    <View key={ex.id} style={s.historyRow}>
                      <View style={[s.scoreBadge, {
                        backgroundColor: (ex.score ?? 0) >= 80 ? '#dcfce7' : (ex.score ?? 0) >= 60 ? '#fef9c3' : '#fee2e2',
                      }]}>
                        <Text style={{
                          fontWeight: '800', fontSize: 15,
                          color: (ex.score ?? 0) >= 80 ? '#16a34a' : (ex.score ?? 0) >= 60 ? '#ca8a04' : '#dc2626',
                        }}>{ex.score ?? 0}%</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.historyTitle} numberOfLines={1}>{ex.checklist.name}</Text>
                        <Text style={s.historyMeta}>
                          {ex.user.name} · {ex.completedAt ? new Date(ex.completedAt).toLocaleDateString('pt-BR') : '—'}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {/* Ordens de Serviço */}
                  <Text style={[s.sectionTitle, { marginTop: 8 }]}>Ordens de Serviço</Text>
                  {history.workOrders.length === 0 ? (
                    <Text style={s.emptySubtext}>Nenhuma OS registrada ainda</Text>
                  ) : history.workOrders.map((wo) => (
                    <View key={wo.id} style={s.historyRow}>
                      <View style={[s.woBadge, { backgroundColor: WO_STATUS_COLORS[wo.status] + '20' }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: WO_STATUS_COLORS[wo.status] }}>
                          {WO_STATUS_LABELS[wo.status] ?? wo.status}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.historyTitle} numberOfLines={1}>{wo.title}</Text>
                        <Text style={s.historyMeta}>
                          {wo.code} · {new Date(wo.createdAt).toLocaleDateString('pt-BR')}
                          {wo.assignee ? ` · ${wo.assignee.name}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {/* ── Tab: Ações ── */}
          {activeTab === 'actions' && (
            <>
              <TouchableOpacity style={s.actionBtn} onPress={() => setView('reporting')}>
                <View style={[s.actionIcon, { backgroundColor: '#fee2e2' }]}>
                  <Ionicons name="warning-outline" size={22} color="#dc2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.actionTitle}>Reportar problema</Text>
                  <Text style={s.actionDesc}>Registrar ocorrência com foto e descrição</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>

              <TouchableOpacity style={s.actionBtn} onPress={openWorkOrder}>
                <View style={[s.actionIcon, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="construct-outline" size={22} color="#2563eb" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.actionTitle}>Abrir Ordem de Serviço</Text>
                  <Text style={s.actionDesc}>Criar OS de manutenção para este equipamento</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>

              <TouchableOpacity style={s.actionBtn} onPress={promptStatusChange}>
                <View style={[s.actionIcon, { backgroundColor: '#f3f4f6' }]}>
                  <Ionicons name="swap-horizontal-outline" size={22} color="#6b7280" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.actionTitle}>Alterar status</Text>
                  <Text style={s.actionDesc}>
                    Atual: {STATUS_LABELS[asset.status] ?? asset.status}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>

              <TouchableOpacity style={[s.actionBtn, { borderColor: '#e2e8f0' }]} onPress={resetScan}>
                <View style={[s.actionIcon, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="qr-code-outline" size={22} color="#16a34a" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.actionTitle}>Escanear outro equipamento</Text>
                  <Text style={s.actionDesc}>Voltar para a câmera</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── Render: Reportar Problema ─────────────────────────────────────────────

  if (view === 'reporting' && asset) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={[s.header, { paddingTop: 56 }]}>
          <TouchableOpacity onPress={() => setView('asset')} style={s.closeBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Reportar Problema</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
              <Ionicons name="hardware-chip-outline" size={16} color="#2563eb" />
              <Text style={{ fontSize: 13, color: '#6b7280' }}>{asset.name} · {asset.unit.name}</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.questionText}>Descrição do problema *</Text>
            <TextInput
              style={s.textArea}
              placeholder="Descreva detalhadamente o problema encontrado..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={5}
              value={reportDescription}
              onChangeText={setReportDescription}
              textAlignVertical="top"
            />
          </View>

          <View style={s.card}>
            <Text style={s.questionText}>Foto (opcional)</Text>
            {reportPhoto ? (
              <View style={{ marginTop: 8, gap: 8 }}>
                <View style={[s.photoThumb, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                  <Text style={{ color: '#16a34a', fontSize: 13, fontWeight: '600' }}>Foto adicionada</Text>
                </View>
                <TouchableOpacity onPress={() => setReportPhoto(null)} style={{ alignSelf: 'flex-start' }}>
                  <Text style={{ color: '#dc2626', fontSize: 13 }}>Remover foto</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
                <Ionicons name="camera-outline" size={22} color="#2563eb" />
                <Text style={{ color: '#2563eb', fontWeight: '600', fontSize: 14 }}>Tirar foto</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[s.submitBtn, reportSubmitting && { opacity: 0.6 }]}
            onPress={submitReport}
            disabled={reportSubmitting}>
            {reportSubmitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                <Ionicons name="send-outline" size={18} color="#fff" />
                <Text style={s.submitBtnText}>Registrar Ocorrência</Text>
              </>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── Render: Executando checklist ──────────────────────────────────────────

  if (view === 'executing' && activeChecklist) {
    const itemHistory = history?.itemHistory ?? [];
    return (
      <ExecutionFlow
        checklist={activeChecklist}
        executionId={executionId}
        isOnline={isOnline}
        riskItems={getRiskItems(itemHistory, activeChecklist.id)}
        suggestedAnswers={getSuggestedAnswers(itemHistory, activeChecklist.id)}
        onClose={() => {
          setActiveChecklist(null);
          setExecutionId(null);
          setHistory(null);
          setActiveTab('history');
          setView('asset');
        }}
      />
    );
  }

  return null;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const SCAN_SIZE = 220;
const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  permContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f8fafc', gap: 16 },
  permTitle: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  permText: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  permBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  overlay: { flex: 1 },
  topMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  midRow: { flexDirection: 'row', height: SCAN_SIZE },
  sideMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  botMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', paddingTop: 24, paddingHorizontal: 32 },
  scanHint: { color: '#fff', fontSize: 14, textAlign: 'center' },
  scanWindow: { width: SCAN_SIZE, height: SCAN_SIZE, position: 'relative', overflow: 'hidden' },
  corner: { position: 'absolute', width: 20, height: 20, borderColor: '#fff' },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#2563eb', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6 },

  header: { backgroundColor: '#1e40af', paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center', flex: 1, marginHorizontal: 8 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  assetCard: { backgroundColor: '#fff', padding: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  assetIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  assetName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  assetCode: { fontSize: 12, color: '#6b7280' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#2563eb' },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  tabBtnTextActive: { color: '#2563eb' },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#9ca3af' },
  emptySubtext: { fontSize: 13, color: '#d1d5db', textAlign: 'center' },

  scoreTrendBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  scoreTrendDanger: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
  scoreTrendWarning: { backgroundColor: '#fef9c3', borderColor: '#fde68a' },
  scoreTrendText: { flex: 1, fontSize: 13, fontWeight: '700' },

  checklistRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  checklistIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  checklistName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  checklistMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  scoreBadge: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  woBadge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 72 },
  historyTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  historyMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#f1f5f9' },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  actionDesc: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 4 },
  questionText: { fontSize: 15, fontWeight: '600', color: '#111827', alignSelf: 'flex-start' },
  questionDesc: { fontSize: 13, color: '#6b7280', alignSelf: 'flex-start' },

  textArea: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 14, color: '#111827', minHeight: 100, width: '100%' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#2563eb', borderRadius: 10, padding: 12, marginTop: 8, justifyContent: 'center' },
  photoThumb: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12, marginTop: 8, justifyContent: 'center' },

  submitBtn: { backgroundColor: '#dc2626', borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
