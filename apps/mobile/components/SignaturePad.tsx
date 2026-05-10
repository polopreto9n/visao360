import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  Dimensions,
  GestureResponderEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

const { width: SCREEN_W } = Dimensions.get('window');
const PAD_WIDTH = SCREEN_W - 48;
const PAD_HEIGHT = 200;

interface Point { x: number; y: number }

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

/** Converte array de pontos para string de caminho SVG com curvas Bézier suaves */
function pointsToSmoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y} l0.1,0`;
  if (points.length === 2)
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const x_mid = (points[i].x + points[i + 1].x) / 2;
    const y_mid = (points[i].y + points[i + 1].y) / 2;
    d += ` Q${points[i].x},${points[i].y} ${x_mid},${y_mid}`;
  }
  const last = points[points.length - 1];
  d += ` L${last.x},${last.y}`;
  return d;
}

/** Serializa todos os traços em SVG base64 */
function strokesToDataUrl(strokes: Point[][]): string {
  const pathEls = strokes
    .map((pts) => pointsToSmoothPath(pts))
    .filter(Boolean)
    .map(
      (d) =>
        `<path d="${d}" stroke="#1e3a8a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('\n');

  const svg = `<svg width="${PAD_WIDTH}" height="${PAD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAD_WIDTH} ${PAD_HEIGHT}" style="background:white">${pathEls}</svg>`;

  // btoa com suporte a caracteres Unicode
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const currentStroke = useRef<Point[]>([]);
  const isDrawing = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        isDrawing.current = true;
        currentStroke.current = [{ x: locationX, y: locationY }];
        setStrokes((prev) => [...prev, [{ x: locationX, y: locationY }]]);
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (!isDrawing.current) return;
        const { locationX, locationY } = evt.nativeEvent;

        // Ignorar pontos muito próximos (suaviza a linha)
        const last = currentStroke.current[currentStroke.current.length - 1];
        const dist = Math.hypot(locationX - last.x, locationY - last.y);
        if (dist < 2) return;

        currentStroke.current = [...currentStroke.current, { x: locationX, y: locationY }];
        setStrokes((prev) => [
          ...prev.slice(0, -1),
          [...currentStroke.current],
        ]);
      },

      onPanResponderRelease: () => {
        isDrawing.current = false;
      },

      onPanResponderTerminate: () => {
        isDrawing.current = false;
      },
    }),
  ).current;

  function handleClear() {
    setStrokes([]);
    currentStroke.current = [];
  }

  function handleSave() {
    if (strokes.length === 0) return;
    const dataUrl = strokesToDataUrl(strokes);
    onSave(dataUrl);
  }

  const hasSignature = strokes.length > 0;

  return (
    <View style={s.container}>
      <Text style={s.title}>Assinatura Digital</Text>
      <Text style={s.subtitle}>Assine com o dedo no campo abaixo para confirmar a inspeção</Text>

      {/* Canvas de assinatura */}
      <View style={s.padWrapper} {...panResponder.panHandlers}>
        <Svg
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          style={StyleSheet.absoluteFillObject}
        >
          {strokes.map((pts, i) => (
            <Path
              key={i}
              d={pointsToSmoothPath(pts)}
              stroke="#1e3a8a"
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>

        {!hasSignature && (
          <View style={s.placeholder} pointerEvents="none">
            <Text style={s.placeholderIcon}>✍️</Text>
            <Text style={s.placeholderText}>Toque e arraste para assinar</Text>
          </View>
        )}

        {/* Linha de base */}
        <View style={s.baseLine} pointerEvents="none" />
      </View>

      {/* Label "Assinatura" */}
      <Text style={s.baseLabel}>Assinatura do responsável</Text>

      {/* Botões */}
      <View style={s.actions}>
        <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
          <Text style={s.clearBtnText}>🗑 Limpar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
          <Text style={s.cancelBtnText}>Cancelar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.saveBtn, !hasSignature && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!hasSignature}
        >
          <Text style={s.saveBtnText}>
            {hasSignature ? '✓ Confirmar' : 'Assine acima'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },

  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },

  padWrapper: {
    width: PAD_WIDTH,
    height: PAD_HEIGHT,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
    position: 'relative',
  },

  placeholder: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  placeholderIcon: { fontSize: 32 },

  placeholderText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },

  baseLine: {
    position: 'absolute',
    bottom: 48,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: '#cbd5e1',
  },

  baseLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: -8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
  },

  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },

  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },

  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveBtnDisabled: {
    backgroundColor: '#d1d5db',
  },

  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
