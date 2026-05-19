import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadApi } from '../services/api';

interface PhotoCaptureProps {
  photos: string[];                         // URLs das fotos já capturadas
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  label?: string;
  required?: boolean;
}

export function PhotoCapture({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  label = 'Fotos',
  required = false,
}: PhotoCaptureProps) {
  const [uploading, setUploading] = useState(false);

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para tirar fotos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  }

  async function uploadPhoto(uri: string) {
    setUploading(true);
    try {
      const url = await uploadApi.uploadPhoto(uri, 'executions');
      onPhotosChange([...photos, url]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro desconhecido';
      Alert.alert(
        'Falha no envio',
        `Não foi possível enviar a foto. Verifique a conexão e tente novamente.\n\nDetalhe: ${msg}`,
        [{ text: 'OK' }],
      );
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(index: number) {
    Alert.alert('Remover foto', 'Deseja remover esta foto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => onPhotosChange(photos.filter((_, i) => i !== index)),
      },
    ]);
  }

  function showAddOptions() {
    Alert.alert('Adicionar foto', '', [
      { text: '📷 Câmera', onPress: pickFromCamera },
      { text: '🖼️ Galeria', onPress: pickFromGallery },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  const canAdd = photos.length < maxPhotos && !uploading;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.label}>
          {label}
          {required && <Text style={s.required}> *</Text>}
        </Text>
        <Text style={s.count}>
          {photos.length}/{maxPhotos}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scroll}>
        <View style={s.photoRow}>
          {/* Fotos capturadas */}
          {photos.map((uri, i) => (
            <TouchableOpacity key={i} onPress={() => removePhoto(i)} style={s.photoWrapper}>
              <Image source={{ uri }} style={s.photo} resizeMode="cover" />
              <View style={s.removeOverlay}>
                <Text style={s.removeIcon}>✕</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Botão adicionar */}
          {canAdd && (
            <TouchableOpacity style={s.addBtn} onPress={showAddOptions}>
              {uploading ? (
                <ActivityIndicator color="#2563eb" />
              ) : (
                <>
                  <Text style={s.addIcon}>📷</Text>
                  <Text style={s.addText}>Adicionar</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {required && photos.length === 0 && (
        <Text style={s.requiredMsg}>⚠️ Foto obrigatória para este item</Text>
      )}
    </View>
  );
}

const PHOTO_SIZE = 80;

const s = StyleSheet.create({
  container: { gap: 8 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  required: { color: '#dc2626' },
  count: { fontSize: 12, color: '#9ca3af' },

  scroll: { flexGrow: 0 },

  photoRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },

  photoWrapper: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },

  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
  },

  removeOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  removeIcon: { color: '#fff', fontSize: 10, fontWeight: '700' },

  addBtn: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
  },

  addIcon: { fontSize: 22 },
  addText: { fontSize: 10, color: '#2563eb', fontWeight: '600' },

  requiredMsg: { fontSize: 12, color: '#dc2626' },
});
