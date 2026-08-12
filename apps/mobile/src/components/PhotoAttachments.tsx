/**
 * PhotoAttachments - Universal photo attachment component
 * Drop into any entity detail screen (SWMS, invoices, expenses, job logs)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { photosApi, getAuthToken } from '../services/api';

interface PhotoItem {
  id: string;
  filename: string;
  original_filename: string | null;
  caption: string | null;
  mime_type: string;
  file_size: number | null;
  url: string;
  created_at: string;
}

interface PhotoAttachmentsProps {
  entityType: 'swms' | 'invoice' | 'expense' | 'job_log' | 'quote';
  entityId: string;
  editable?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_WIDTH - 32 - 24) / 4; // 4 per row with gaps

export default function PhotoAttachments({
  entityType,
  entityId,
  editable = true,
}: PhotoAttachmentsProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  /** Local file URIs with auth already applied — remote /file needs Bearer. */
  const [localUris, setLocalUris] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoItem | null>(null);

  const hydrateLocalUris = useCallback(async (list: PhotoItem[]) => {
    const token = getAuthToken();
    const next: Record<string, string> = {};
    await Promise.all(
      list.map(async (photo) => {
        try {
          const dest = `${FileSystem.cacheDirectory}photo-${photo.id}`;
          const result = await FileSystem.downloadAsync(
            photosApi.getFileUrl(photo.id),
            dest,
            token ? { headers: { Authorization: `Bearer ${token}` } } : {}
          );
          if (result.status === 200) {
            next[photo.id] = result.uri;
          }
        } catch {
          // leave missing — UI shows placeholder
        }
      })
    );
    setLocalUris(next);
  }, []);

  const loadPhotos = useCallback(async () => {
    try {
      const response = await photosApi.listByEntity(entityType, entityId);
      if (response.data.success) {
        const list = response.data.data.photos || [];
        setPhotos(list);
        void hydrateLocalUris(list);
      }
    } catch {
      // Silently fail - photos are supplementary
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId, hydrateLocalUris]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  async function pickPhoto(source: 'camera' | 'gallery') {
    try {
      // Camera still requires an explicit permission; the gallery/photo-picker
      // path uses the Android Photo Picker (API 33+) or ACTION_GET_CONTENT
      // (older), neither of which needs READ_MEDIA_IMAGES or READ_EXTERNAL_STORAGE.
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to take photos.');
          return;
        }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: false,
            allowsMultipleSelection: false,
          });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setIsUploading(true);

      try {
        await photosApi.upload(entityType, entityId, asset.uri);
        await loadPhotos();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Upload failed';
        Alert.alert('Upload Error', msg);
      } finally {
        setIsUploading(false);
      }
    } catch {
      Alert.alert('Error', 'Could not access photos');
    }
  }

  function showAddOptions() {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => pickPhoto('camera') },
      { text: 'Photo Library', onPress: () => pickPhoto('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function handleDelete(photo: PhotoItem) {
    Alert.alert('Delete Photo', 'Remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await photosApi.delete(photo.id);
            setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
            setPreviewPhoto(null);
          } catch {
            Alert.alert('Error', 'Could not delete photo');
          }
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#FF6B35" />
        </View>
      </View>
    );
  }

  // Don't show the section at all if not editable and no photos
  if (!editable && photos.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Photos ({photos.length})</Text>
        {editable && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={showAddOptions}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#FF6B35" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={18} color="#FF6B35" />
                <Text style={styles.addButtonText}>Add</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {photos.length === 0 ? (
        editable ? (
          <TouchableOpacity
            style={styles.emptyCard}
            onPress={showAddOptions}
            disabled={isUploading}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
          >
            <Ionicons name="images-outline" size={32} color="#9CA3AF" />
            <Text style={styles.emptyText}>Tap to add photos</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No photos</Text>
          </View>
        )
      ) : (
        <View style={styles.card}>
          <View style={styles.grid}>
            {photos.map((photo) => {
              const uri = localUris[photo.id];
              return (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.thumb}
                  onPress={() => setPreviewPhoto(photo)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="View photo"
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumbImage, styles.thumbPlaceholder]}>
                      <ActivityIndicator size="small" color="#9CA3AF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Full-screen preview modal */}
      <Modal
        visible={!!previewPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setPreviewPhoto(null)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {editable && previewPhoto && (
              <TouchableOpacity
                style={styles.modalDelete}
                onPress={() => handleDelete(previewPhoto)}
              >
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
          {previewPhoto && (
            localUris[previewPhoto.id] ? (
              <Image
                source={{ uri: localUris[previewPhoto.id] }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <ActivityIndicator size="large" color="#fff" />
            )
          )}
          {previewPhoto?.caption && (
            <Text style={styles.captionText}>{previewPhoto.caption}</Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF6B35',
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  thumbPlaceholder: {
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  // Preview modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  modalClose: {
    padding: 8,
  },
  modalDelete: {
    padding: 8,
  },
  previewImage: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_WIDTH - 32,
    borderRadius: 8,
  },
  captionText: {
    color: '#D1D5DB',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
