import { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

/** Catches render errors so one screen cannot take down the whole app. */
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    Sentry.captureException(error, { tags: { boundary: this.props.label || 'screen' } });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap} testID="screen-error-boundary">
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>This screen hit an error. Please try again.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => this.setState({ error: null })}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 8 },
  body: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: '#FF6B35', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
});
