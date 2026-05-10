import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Animated, ScrollView, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { assetsApi, checklistsApi, workOrdersApi, Asset, Checklist } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { useOfflineStore } from '../../stores/offline.store';
import { useNetwork } from '../../hooks/useNetwork';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ScanView = 'camera' | 'asset' | 'checklists' | 'executing' | 'done';

interface ExecutionStep {
  checklistItemId: string;
  answer: boolean | null;
  notes: string;
}

// ─── Tela principal ────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ScanView>('camera');
  const [asset, setAsset] = useState<Asset | null>(null);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [activeChecklist, setActiveChecklist] = useState<Checklist | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [globalNotes, setGlobalNotes] = useState('');
  const [finalScore, setFinalScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const { isOnline } = useNetwork();
  const { enqueue, findAssetByQR, refreshAssetCache } = useOfflineStore();
  const user = useAuthStore((s) => s.user);

  // Atualizar cache de assets ao montar (se online)
  useEffect(() => {
    if (isOnline) refreshAssetCache();
  }, [isOnline]);

  // Animação da linha de scan
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
    setActiveChecklist(null);
    setExecutionId(null);
    setSteps([]);
    setCurrentStep(0);
    setGlobalNotes('');
  }

  // ── Passo 1: Scanner QR ────────────────────────────────────────────────────

  async function handleQRScanned({ data }: BarcodeScanningResult) {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    // Extrair qrCode da URL ou usar diretamente
    let qrCode = data;
    if (data.includes('visao360://asset/')) {
      const parts = data.split('?qr=');
      qrCode = parts[1] ?? data.split('/').pop() ?? data;
    }

    try {
      let foundAsset = isOnline ? null : findAssetByQR(qrCode);

      if (isOnline) {
        const [assetRes, clRes] = await Promise.allSettled([
          assetsApi.findByQRCode(qrCode),
          checklistsApi.list(),
        ]);

        if (assetRes.status === 'rejected') {
          // Tentar cache como fallback
          const cached = findAssetByQR(qrCode);
          if (!cached) {
            Alert.alert('Equipamento não encontrado',
              `QR Code "${qrCode.substring(0, 20)}..." não encontrado.`,
              [{ text: 'Tentar novamente', onPress: resetScan }]);
            return;
          }
          foundAsset = cached;
        } else {
          foundAsset = assetRes.value.data;
        }

        if (clRes.status === 'fulfilled') {
          const allChecklists = clRes.value.data.data;
          const relevant = allChecklists.filter(
            (cl) => !cl.unit || cl.unit.id === foundAsset!.unit.id,
          );
          setChecklists(relevant.length > 0 ? relevant : allChecklists.slice(0, 5));
        }
      } else if (foundAsset) {
        // Offline: usa apenas o cache
        Alert.alert('Modo offline', 'Usando dados salvos. Algumas informações podem estar desatualizadas.', [{ text: 'OK' }]);
      } else {
        Alert.alert('Sem conexão', 'Não há dados em cache para este equipamento. Conecte-se e tente novamente.',
          [{ text: 'OK', onPress: resetScan }]);
        return;
      }

      if (!foundAsset) {
        Alert.alert('Equipamento não encontrado', `QR Code não reconhecido.`,
          [{ text: 'Tentar novamente', onPress: resetScan }]);
        return;
      }

      setView('asset');
    } catch {
      Alert.alert('Erro', 'Falha ao buscar equipamento. Verifique a conexão.',
        [{ text: 'OK', onPress: resetScan }]);
    } finally {
      setLoading(false);
    }
  }

  // ── Passo 2: Selecionar checklist ─────────────────────────────────────────

  async function startChecklist(cl: Checklist) {
    setLoading(true);
    setActiveChecklist(cl);

    const sortedItems = [...cl.items].sort((a, b) => a.order - b.order);
    setSteps(sortedItems.map((i) => ({ checklistItemId: i.id, answer: null, notes: '' })));
    setCurrentStep(0);

    if (isOnline) {
      try {
        const res = await checklistsApi.startExecution(cl.id, asset?.id);
        setExecutionId(res.data.id);
      } catch {
        setExecutionId(null); // modo offline
      }
    }

    setLoading(false);
    setView('executing');
  }

  // ── Passo 3: Abrir OS com asset pré-selecionado ───────────────────────────

  async function openWorkOrder() {
    if (!asset || !user) return;
    Alert.alert(
      'Abrir Ordem de Serviço',
      `Criar OS para: ${asset.name}?`,
      [
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
              Alert.alert('✅ OS criada!', 'A ordem de serviço foi criada com sucesso.', [
                { text: 'OK', onPress: resetScan },
              ]);
            } catch (e: unknown) {
              const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
              Alert.alert('Erro', msg ?? 'Falha ao criar OS');
            }
          },
        },
      ],
    );
  }

  // ── Passo 4: Executar checklist ────────────────────────────────────────────

  function setAnswer(idx: number, answer: boolean) {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, answer } : s));
  }

  function setNote(idx: number, notes: string) {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, notes } : s));
  }

  async function submitExecution() {
    if (!activeChecklist) return;
    setSubmitting(true);

    const payload = steps.map((s) => ({
      checklistItemId: s.checklistItemId,
      answer: s.answer ?? false,
      notes: s.notes || undefined,
    }));

    const score = Math.round(
      (steps.filter((s) => s.answer === true).length / steps.length) * 100,
    );
    setFinalScore(score);

    if (isOnline && executionId) {
      try {
        await checklistsApi.submitExecution(executionId, payload, globalNotes || undefined);
      } catch {
        enqueue({
          checklistId: activeChecklist.id,
          checklistName: activeChecklist.name,
          items: payload,
          notes: globalNotes || undefined,
        });
      }
    } else {
      enqueue({
        checklistId: activeChecklist.id,
        checklistName: activeChecklist.name,
        items: payload,
        notes: globalNotes || undefined,
      });
    }

    setSubmitting(false);
    setView('done');
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
              {['tl', 'tr', 'bl', 'br'].map((c) => (
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

  // ─── Render: Asset encontrado ──────────────────────────────────────────────

  if (view === 'asset' && asset) {
    const STATUS_LABELS: Record<string, string> = {
      ACTIVE: 'Ativo', INACTIVE: 'Inativo', MAINTENANCE: 'Em manutenção', DECOMMISSIONED: 'Desativado',
    };
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        {/* Header */}
        <View style={[s.header, { paddingTop: 56 }]}>
          <TouchableOpacity onPress={resetScan} style={s.closeBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Equipamento Encontrado ✅</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          {/* Card do asset */}
          <View style={s.card}>
            <View style={s.assetIcon}><Ionicons name="hardware-chip-outline" size={36} color="#2563eb" /></View>
            <Text style={s.assetName}>{asset.name}</Text>
            {asset.code && <Text style={s.assetCode}>{asset.code}</Text>}
            <View style={[s.badge, { backgroundColor: '#dcfce7', marginTop: 8 }]}>
              <Text style={{ color: '#16a34a', fontWeight: '700', fontSize: 12 }}>
                {STATUS_LABELS[asset.status] ?? asset.status}
              </Text>
            </View>
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={s.infoText}>🏢 {asset.unit.name}</Text>
              <Text style={s.infoText}>🏷️ {asset.category}{asset.brand ? ` · ${asset.brand}` : ''}</Text>
              {asset.model && <Text style={s.infoText}>⚙️ {asset.model}</Text>}
            </View>
          </View>

          {/* Ações */}
          <Text style={s.sectionTitle}>O que deseja fazer?</Text>

          {checklists.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={s.sectionSubtitle}>📋 Executar checklist</Text>
              {checklists.map((cl) => (
                <TouchableOpacity key={cl.id} style={s.checklistRow} onPress={() => startChecklist(cl)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.checklistName}>{cl.name}</Text>
                    <Text style={s.checklistMeta}>{cl.items.length} itens · {cl.type}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#2563eb" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.osBtn} onPress={openWorkOrder}>
            <Ionicons name="construct-outline" size={22} color="#fff" />
            <Text style={s.osBtnText}>Abrir Ordem de Serviço</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelBtn} onPress={resetScan}>
            <Text style={s.cancelBtnText}>🔄 Escanear outro QR Code</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ─── Render: Executando checklist ──────────────────────────────────────────

  if (view === 'executing' && activeChecklist) {
    const sortedItems = [...activeChecklist.items].sort((a, b) => a.order - b.order);
    const item = sortedItems[currentStep];
    const step = steps[currentStep];
    const isLast = currentStep === sortedItems.length - 1;
    const progress = ((currentStep + 1) / sortedItems.length) * 100;

    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => Alert.alert('Cancelar?', 'As respostas serão perdidas.', [
            { text: 'Continuar', style: 'cancel' },
            { text: 'Cancelar', style: 'destructive', onPress: resetScan },
          ])} style={s.closeBtn}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={s.headerTitle} numberOfLines={1}>{activeChecklist.name}</Text>
            <Text style={[s.headerTitle, { fontSize: 12, fontWeight: '400', opacity: 0.8 }]}>
              Item {currentStep + 1} de {sortedItems.length}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Progress bar */}
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%` as `${number}%` }]} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
          {/* Pergunta */}
          <View style={s.card}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{item.order}</Text></View>
            <Text style={s.questionText}>{item.question}</Text>
            {item.description && <Text style={s.questionDesc}>{item.description}</Text>}

            {/* Resposta */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {[true, false].map((val) => (
                <TouchableOpacity key={String(val)} onPress={() => setAnswer(currentStep, val)}
                  style={[s.ansBtn, step?.answer === val && (val ? s.ansBtnYes : s.ansBtnNo)]}>
                  <Ionicons name={val ? 'checkmark-circle' : 'close-circle'} size={22}
                    color={step?.answer === val ? '#fff' : val ? '#16a34a' : '#dc2626'} />
                  <Text style={[s.ansBtnText, step?.answer === val && { color: '#fff' }]}>
                    {val ? 'Sim / OK' : 'Não / NOK'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Nota */}
            {(item.requiresNote || step?.answer === false) && (
              <View style={{ marginTop: 12, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 12 }}>
                <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                  {item.requiresNote ? 'Observação obrigatória *' : 'Descreva o problema:'}
                </Text>
                <Text style={{ color: '#374151', fontSize: 14 }}
                  onPress={() => Alert.prompt?.('Observação', '', (text) => text && setNote(currentStep, text))}>
                  {step?.notes || 'Toque para adicionar nota...'}
                </Text>
              </View>
            )}
          </View>

          {/* Notas gerais (último item) */}
          {isLast && (
            <View style={s.card}>
              <Text style={s.questionText}>Observações gerais (opcional)</Text>
              <Text style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}
                onPress={() => Alert.prompt?.('Observações', '', (text) => text !== undefined && setGlobalNotes(text))}>
                {globalNotes || 'Toque para adicionar...'}
              </Text>
            </View>
          )}

          {/* Navegação */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity disabled={currentStep === 0} onPress={() => setCurrentStep(c => c - 1)}
              style={[s.navBtn, currentStep === 0 && { opacity: 0.3 }]}>
              <Text style={s.navBtnText}>← Anterior</Text>
            </TouchableOpacity>

            {!isLast ? (
              <TouchableOpacity onPress={() => setCurrentStep(c => c + 1)} style={s.navBtnNext}>
                <Text style={s.navBtnNextText}>Próximo →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={submitExecution} disabled={submitting} style={[s.navBtnNext, { backgroundColor: '#16a34a' }]}>
                {submitting ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.navBtnNextText}>✓ Concluir</Text>}
              </TouchableOpacity>
            )}
          </View>

          {/* Dots */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {sortedItems.map((_, idx) => (
              <TouchableOpacity key={idx} onPress={() => setCurrentStep(idx)}
                style={[s.dot,
                  idx === currentStep && s.dotActive,
                  steps[idx]?.answer !== null && s.dotAnswered,
                ]} />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── Render: Concluído ─────────────────────────────────────────────────────

  if (view === 'done') {
    const savedOffline = !isOnline || !executionId;
    return (
      <View style={s.doneContainer}>
        <Text style={{ fontSize: 72 }}>{finalScore >= 80 ? '✅' : finalScore >= 60 ? '⚠️' : '❌'}</Text>
        <Text style={s.doneTitle}>{savedOffline ? 'Salvo offline!' : 'Checklist concluído!'}</Text>
        <View style={{ alignItems: 'center', marginVertical: 8 }}>
          <Text style={[s.assetName, { fontSize: 48, color: '#2563eb' }]}>{finalScore}%</Text>
          <Text style={{ color: '#6b7280', fontSize: 14 }}>de conformidade</Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '600', textAlign: 'center', color: finalScore >= 80 ? '#16a34a' : finalScore >= 60 ? '#ca8a04' : '#dc2626' }}>
          {finalScore >= 80 ? 'Excelente conformidade' : finalScore >= 60 ? 'Atenção: itens pendentes' : 'Crítico: intervenção necessária'}
        </Text>
        {savedOffline && (
          <View style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bfdbfe', marginTop: 8 }}>
            <Text style={{ color: '#1e40af', fontSize: 13, textAlign: 'center' }}>
              📵 Dados salvos localmente e serão sincronizados ao reconectar.
            </Text>
          </View>
        )}
        <TouchableOpacity style={[s.osBtn, { marginTop: 12 }]} onPress={resetScan}>
          <Text style={s.osBtnText}>🔄 Escanear outro equipamento</Text>
        </TouchableOpacity>
      </View>
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
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  progressBar: { height: 4, backgroundColor: '#e2e8f0' },
  progressFill: { height: 4, backgroundColor: '#2563eb' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', gap: 8 },
  assetIcon: { width: 72, height: 72, borderRadius: 18, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  assetName: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  assetCode: { fontSize: 13, color: '#6b7280', fontFamily: 'monospace' },
  badge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  infoText: { fontSize: 13, color: '#6b7280', textAlign: 'center' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionSubtitle: { fontSize: 13, color: '#6b7280', fontWeight: '600', marginBottom: 4 },

  checklistRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  checklistName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  checklistMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  osBtn: { backgroundColor: '#2563eb', borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  osBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },

  stepNum: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  stepNumText: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  questionText: { fontSize: 15, fontWeight: '600', color: '#111827', alignSelf: 'flex-start', lineHeight: 22 },
  questionDesc: { fontSize: 13, color: '#6b7280', alignSelf: 'flex-start' },

  ansBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  ansBtnYes: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  ansBtnNo: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  ansBtnText: { fontSize: 13, fontWeight: '700', color: '#374151' },

  navBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#2563eb', alignItems: 'center' },
  navBtnText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  navBtnNext: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  navBtnNextText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e2e8f0' },
  dotActive: { backgroundColor: '#2563eb', transform: [{ scale: 1.3 }] },
  dotAnswered: { backgroundColor: '#86efac' },

  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: '#fff' },
  doneTitle: { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center' },
});
