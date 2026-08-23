/**
 * Bank CSV Upload Screen
 * Pick a CSV file, preview it, upload to API,
 * and optionally run auto-match after import.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { bankTransactionsApi } from '../../src/services/api';
import { InContentBack } from '../../src/components/InContentBack';

interface SelectedFile {
  name: string;
  size: number | undefined;
  uri: string;
}

interface UploadResult {
  imported: number;
  duplicates: number;
  batch_id?: string;
}

export default function BankUploadScreen() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [autoMatchResult, setAutoMatchResult] = useState<{ matched: number } | null>(null);

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          name: asset.name,
          size: asset.size ?? undefined,
          uri: asset.uri,
        });
        // Reset previous results when a new file is picked
        setUploadResult(null);
        setAutoMatchResult(null);
      }
    } catch (error) {
      console.error('File picker error:', error);
      Alert.alert('Error', 'Failed to select file. Please try again.');
    }
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const content = await FileSystem.readAsStringAsync(selectedFile.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await bankTransactionsApi.upload(content, selectedFile.name);

      if (response.data.success) {
        const data = response.data.data;
        setUploadResult({
          imported: data.imported ?? 0,
          duplicates: data.duplicates ?? 0,
          batch_id: data.batch_id,
        });
      }
    } catch (error: unknown) {
      console.error('Upload failed:', error);
      const message =
        error instanceof Error ? error.message : 'Upload failed. Please check the file format and try again.';
      Alert.alert('Upload Failed', message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAutoMatch() {
    setIsAutoMatching(true);
    try {
      const response = await bankTransactionsApi.autoMatch();
      if (response.data.success) {
        const data = response.data.data;
        setAutoMatchResult({ matched: data.matched ?? 0 });
      }
    } catch (error) {
      console.error('Auto-match failed:', error);
      Alert.alert('Error', 'Auto-match failed. Please try again.');
    } finally {
      setIsAutoMatching(false);
    }
  }

  function formatFileSize(bytes: number | undefined): string {
    if (bytes === undefined) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <InContentBack fallback="/(tabs)/money" />
      {/* Header Info */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color="#FF6B35" />
        <Text style={styles.infoText}>
          Upload a CSV export from your bank (e.g. Wise, ASB, ANZ). Transactions
          will be imported and can be matched against your invoices.
        </Text>
      </View>

      {/* File Picker */}
      {!uploadResult && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select File</Text>

          <TouchableOpacity
            style={styles.filePickerButton}
            onPress={handlePickFile}
          >
            <View style={styles.filePickerIcon}>
              <Ionicons name="document-text-outline" size={32} color="#FF6B35" />
            </View>
            <Text style={styles.filePickerText}>
              {selectedFile ? 'Change File' : 'Select CSV File'}
            </Text>
            <Text style={styles.filePickerHint}>
              Tap to browse your files
            </Text>
          </TouchableOpacity>

          {/* Selected File Preview */}
          {selectedFile && (
            <View style={styles.filePreview}>
              <View style={styles.filePreviewIcon}>
                <Ionicons name="document-attach" size={24} color="#FF6B35" />
              </View>
              <View style={styles.filePreviewInfo}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {selectedFile.name}
                </Text>
                <Text style={styles.fileSize}>
                  {formatFileSize(selectedFile.size)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSelectedFile(null);
                  setUploadResult(null);
                }}
              >
                <Ionicons name="close-circle" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {/* Upload Button */}
          {selectedFile && (
            <TouchableOpacity
              style={[styles.primaryButton, isUploading && styles.primaryButtonDisabled]}
              onPress={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="cloud-upload" size={20} color="#fff" />
              )}
              <Text style={styles.primaryButtonText}>
                {isUploading ? 'Uploading...' : 'Upload'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <View style={styles.section}>
          <View style={styles.resultCard}>
            <View style={styles.resultIconContainer}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            </View>
            <Text style={styles.resultTitle}>Upload Complete</Text>
            <Text style={styles.resultFilename}>{selectedFile?.name}</Text>

            <View style={styles.resultStats}>
              <View style={styles.resultStatItem}>
                <Text style={styles.resultStatValue}>{uploadResult.imported}</Text>
                <Text style={styles.resultStatLabel}>Imported</Text>
              </View>
              <View style={styles.resultStatDivider} />
              <View style={styles.resultStatItem}>
                <Text style={[styles.resultStatValue, { color: '#6B7280' }]}>
                  {uploadResult.duplicates}
                </Text>
                <Text style={styles.resultStatLabel}>Duplicates Skipped</Text>
              </View>
            </View>
          </View>

          {/* Auto-Match Button */}
          {!autoMatchResult && (
            <TouchableOpacity
              style={[styles.primaryButton, isAutoMatching && styles.primaryButtonDisabled]}
              onPress={handleAutoMatch}
              disabled={isAutoMatching}
            >
              {isAutoMatching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="git-compare-outline" size={20} color="#fff" />
              )}
              <Text style={styles.primaryButtonText}>
                {isAutoMatching ? 'Matching...' : 'Run Auto-Match'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Auto-Match Result */}
          {autoMatchResult && (
            <View style={styles.matchResultCard}>
              <Ionicons name="git-compare" size={24} color="#FF6B35" />
              <Text style={styles.matchResultText}>
                Matched{' '}
                <Text style={styles.matchResultCount}>{autoMatchResult.matched}</Text>
                {' '}transaction{autoMatchResult.matched !== 1 ? 's' : ''} to invoices.
              </Text>
            </View>
          )}

          {/* Navigation Buttons */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/bank/' as any)}
          >
            <Ionicons name="list" size={20} color="#FF6B35" />
            <Text style={styles.secondaryButtonText}>View Transactions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineButton}
            onPress={() => {
              setSelectedFile(null);
              setUploadResult(null);
              setAutoMatchResult(null);
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color="#6B7280" />
            <Text style={styles.outlineButtonText}>Upload Another File</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },

  // Info Box
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },

  // File Picker
  filePickerButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePickerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  filePickerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B35',
  },
  filePickerHint: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },

  // File Preview
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  filePreviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePreviewInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  fileSize: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  outlineButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
  },

  // Upload Result
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  resultIconContainer: {
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  resultFilename: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  resultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  resultStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  resultStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#10B981',
  },
  resultStatLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  resultStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },

  // Auto-Match Result
  matchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  matchResultText: {
    flex: 1,
    fontSize: 15,
    color: '#1E40AF',
    lineHeight: 20,
  },
  matchResultCount: {
    fontWeight: '700',
  },
});
