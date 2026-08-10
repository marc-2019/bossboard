/**
 * Create / Edit Product Screen
 * Form for creating new or editing existing products & services
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi } from '../../src/services/api';

type ProductType = 'fixed' | 'variable';

export default function CreateProductScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unitPriceDisplay, setUnitPriceDisplay] = useState('');
  const [costDisplay, setCostDisplay] = useState('');
  const [marginDisplay, setMarginDisplay] = useState('');
  const [type, setType] = useState<ProductType>('fixed');
  const [isGstApplicable, setIsGstApplicable] = useState(true);

  // Load existing product when editing
  useEffect(() => {
    if (isEditing && id) {
      loadProduct(id);
    }
  }, [id, isEditing]);

  async function loadProduct(productId: string) {
    setIsLoading(true);
    try {
      const response = await productsApi.get(productId);
      if (response.data.success) {
        const product = response.data.data.product;
        setName(product.name || '');
        setDescription(product.description || '');
        setUnitPriceDisplay(
          (product.unit_price / 100).toFixed(2)
        );
        setCostDisplay(
          product.unit_cost != null
            ? (Number(product.unit_cost) / 100).toFixed(2)
            : ''
        );
        setMarginDisplay(
          product.default_margin_percent != null
            ? String(product.default_margin_percent)
            : ''
        );
        setType(product.type || 'fixed');
        setIsGstApplicable(
          product.is_gst_applicable !== undefined ? product.is_gst_applicable : true
        );
      }
    } catch (error) {
      console.error('Failed to load product:', error);
      Alert.alert('Error', 'Failed to load product details.');
      router.back();
    } finally {
      setIsLoading(false);
    }
  }

  function parsePriceToCents(dollarStr: string): number {
    const cleaned = dollarStr.replace(/[^0-9.]/g, '');
    const dollars = parseFloat(cleaned) || 0;
    return Math.round(dollars * 100);
  }

  async function handleSubmit() {
    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a product name');
      return;
    }

    let unitPriceCents = parsePriceToCents(unitPriceDisplay);
    const unitCostCents = costDisplay.trim()
      ? parsePriceToCents(costDisplay)
      : null;
    const marginPct = marginDisplay.trim()
      ? parseFloat(marginDisplay.replace(/[^0-9.]/g, ''))
      : null;
    if (unitCostCents != null && marginPct != null && Number.isFinite(marginPct)) {
      unitPriceCents = Math.round(unitCostCents * (1 + marginPct / 100));
    }
    if (unitPriceCents <= 0 && unitCostCents == null) {
      Alert.alert('Error', 'Please enter a valid sell price or cost + margin %');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        unitPrice: unitPriceCents,
        unitCost: unitCostCents,
        defaultMarginPercent:
          marginPct != null && Number.isFinite(marginPct) ? marginPct : null,
        type,
        isGstApplicable: isGstApplicable,
      };

      if (isEditing && id) {
        const response = await productsApi.update(id, payload);
        if (response.data.success) {
          Alert.alert('Success', 'Product updated successfully', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        }
      } else {
        const response = await productsApi.create(payload);
        if (response.data.success) {
          Alert.alert('Success', 'Product created successfully', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        }
      }
    } catch (error) {
      console.error('Failed to save product:', error);
      Alert.alert('Error', `Failed to ${isEditing ? 'update' : 'create'} product. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!id) return;

    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await productsApi.delete(id);
              if (response.data.success) {
                Alert.alert('Deleted', 'Product has been deleted.', [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              }
            } catch (error) {
              console.error('Failed to delete product:', error);
              Alert.alert('Error', 'Failed to delete product. Please try again.');
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading product...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Product Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Standard Callout Fee"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Brief description of this product or service"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Pricing: cost + margin % → sell (internal cost never on customer PDF) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Cost (internal)</Text>
            <View style={styles.priceInputRow}>
              <Text style={styles.currencyPrefix}>$</Text>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={costDisplay}
                onChangeText={(t) => {
                  setCostDisplay(t);
                  const c = parsePriceToCents(t);
                  const m = parseFloat(marginDisplay.replace(/[^0-9.]/g, ''));
                  if (c > 0 && Number.isFinite(m) && marginDisplay.trim()) {
                    setUnitPriceDisplay((c * (1 + m / 100) / 100).toFixed(2));
                  }
                }}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Margin %</Text>
            <TextInput
              style={styles.input}
              value={marginDisplay}
              onChangeText={(t) => {
                setMarginDisplay(t);
                const c = parsePriceToCents(costDisplay);
                const m = parseFloat(t.replace(/[^0-9.]/g, ''));
                if (c > 0 && Number.isFinite(m) && t.trim()) {
                  setUnitPriceDisplay((c * (1 + m / 100) / 100).toFixed(2));
                }
              }}
              placeholder="30"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sell price *</Text>
            <View style={styles.priceInputRow}>
              <Text style={styles.currencyPrefix}>$</Text>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={unitPriceDisplay}
                onChangeText={setUnitPriceDisplay}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={styles.hint}>
              Customer sees sell price only. Cost + margin stay internal.
            </Text>
          </View>
        </View>

        {/* Product Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type</Text>

          <View style={styles.typeCardRow}>
            <TouchableOpacity
              style={[
                styles.typeCard,
                type === 'fixed' && styles.typeCardSelected,
              ]}
              onPress={() => setType('fixed')}
            >
              <View
                style={[
                  styles.typeIconContainer,
                  type === 'fixed' && styles.typeIconContainerSelected,
                ]}
              >
                <Ionicons
                  name="lock-closed"
                  size={24}
                  color={type === 'fixed' ? '#fff' : '#10B981'}
                />
              </View>
              <Text
                style={[
                  styles.typeCardTitle,
                  type === 'fixed' && styles.typeCardTitleSelected,
                ]}
              >
                Fixed
              </Text>
              <Text style={styles.typeCardDescription}>
                Same amount each time
              </Text>
              {type === 'fixed' && (
                <View style={styles.typeCheckmark}>
                  <Ionicons name="checkmark-circle" size={22} color="#FF6B35" />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeCard,
                type === 'variable' && styles.typeCardSelected,
              ]}
              onPress={() => setType('variable')}
            >
              <View
                style={[
                  styles.typeIconContainer,
                  type === 'variable' && styles.typeIconContainerSelected,
                ]}
              >
                <Ionicons
                  name="swap-horizontal"
                  size={24}
                  color={type === 'variable' ? '#fff' : '#F59E0B'}
                />
              </View>
              <Text
                style={[
                  styles.typeCardTitle,
                  type === 'variable' && styles.typeCardTitleSelected,
                ]}
              >
                Variable
              </Text>
              <Text style={styles.typeCardDescription}>
                Amount changes each time
              </Text>
              {type === 'variable' && (
                <View style={styles.typeCheckmark}>
                  <Ionicons name="checkmark-circle" size={22} color="#FF6B35" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* GST Toggle */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>GST Applicable</Text>
              <Text style={styles.toggleDescription}>
                Charge GST (15%) on this product
              </Text>
            </View>
            <Switch
              value={isGstApplicable}
              onValueChange={setIsGstApplicable}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={isGstApplicable ? '#FF6B35' : '#9CA3AF'}
            />
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting
              ? isEditing
                ? 'Updating...'
                : 'Creating...'
              : isEditing
              ? 'Update Product'
              : 'Create Product'}
          </Text>
        </TouchableOpacity>

        {/* Delete Button (edit mode only) */}
        {isEditing && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Delete Product</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
  },
  priceInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  typeCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    position: 'relative',
  },
  typeCardSelected: {
    borderColor: '#FF6B35',
    backgroundColor: '#EFF6FF',
  },
  typeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  typeIconContainerSelected: {
    backgroundColor: '#FF6B35',
  },
  typeCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  typeCardTitleSelected: {
    color: '#FF6B35',
  },
  typeCardDescription: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  typeCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  toggleDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  submitButton: {
    backgroundColor: '#FF6B35',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
});
