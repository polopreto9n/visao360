import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../stores/auth.store';
import { Company } from '../../services/api';

type Step = 'email' | 'company' | 'password';

export default function LoginScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const { companies, isLoading, error, findCompanies, login, clearError } = useAuthStore();

  async function handleFindCompanies() {
    clearError();
    const found = await findCompanies(email.trim().toLowerCase());
    if (found.length === 0) return;
    if (found.length === 1) {
      setSelectedCompany(found[0]);
      setStep('password');
    } else {
      setStep('company');
    }
  }

  async function handleLogin() {
    if (!selectedCompany) return;
    clearError();
    try {
      await login(email, password, selectedCompany.id);
      router.replace('/(tabs)');
    } catch {
      // Erro já está no store
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoLetter}>V</Text>
          </View>
          <Text style={styles.brandName}>
            Visão<Text style={styles.brandAccent}>360</Text>
          </Text>
          <Text style={styles.tagline}>Gestão Predial Inteligente</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* STEP: E-mail */}
          {step === 'email' && (
            <>
              <Text style={styles.title}>Bem-vindo de volta</Text>
              <Text style={styles.subtitle}>Informe seu e-mail para continuar</Text>

              <Text style={styles.label}>E-mail</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com.br"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleFindCompanies}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleFindCompanies}
                disabled={isLoading || !email.trim()}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Continuar →</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* STEP: Seleção de empresa */}
          {step === 'company' && (
            <>
              <TouchableOpacity onPress={() => setStep('email')} style={styles.backBtn}>
                <Text style={styles.backText}>← Voltar</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Selecione a empresa</Text>
              <Text style={styles.subtitle}>
                {email} está em {companies.length} empresa(s)
              </Text>

              {companies.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.companyCard}
                  onPress={() => {
                    setSelectedCompany(c);
                    setStep('password');
                  }}
                >
                  <View style={styles.companyAvatar}>
                    <Text style={styles.companyAvatarText}>{c.name.charAt(0)}</Text>
                  </View>
                  <Text style={styles.companyName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* STEP: Senha */}
          {step === 'password' && selectedCompany && (
            <>
              <TouchableOpacity
                onPress={() => setStep(companies.length > 1 ? 'company' : 'email')}
                style={styles.backBtn}
              >
                <Text style={styles.backText}>← Voltar</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Entrar</Text>
              <View style={styles.companyBadge}>
                <View style={styles.companyAvatarSm}>
                  <Text style={styles.companyAvatarSmText}>
                    {selectedCompany.name.charAt(0)}
                  </Text>
                </View>
                <Text style={styles.companyBadgeText}>{selectedCompany.name}</Text>
              </View>

              <Text style={styles.label}>E-mail</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={email}
                editable={false}
              />

              <Text style={styles.label}>Senha</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={isLoading || !password}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Entrar na plataforma</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {__DEV__ && (
          <View style={styles.devHint}>
            <Text style={styles.devHintTitle}>🔑 Credenciais de dev</Text>
            <Text style={styles.devHintText}>admin@visao360.com.br / admin@123</Text>
            <Text style={styles.devHintText}>tecnico@visao360.com.br / tecnico@123</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  logoLetter: { fontSize: 36, fontWeight: '900', color: '#fff' },
  brandName: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  brandAccent: { color: '#60a5fa' },
  tagline: { fontSize: 14, color: '#94a3b8', marginTop: 4 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },

  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  inputDisabled: { color: '#9ca3af', backgroundColor: '#f3f4f6' },

  button: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  errorText: {
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 12,
    backgroundColor: '#fef2f2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },

  backBtn: { marginBottom: 16 },
  backText: { color: '#6b7280', fontSize: 14 },

  companyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: 10,
  },
  companyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyAvatarText: { fontSize: 18, fontWeight: '700', color: '#2563eb' },
  companyName: { fontSize: 15, fontWeight: '600', color: '#111827' },

  companyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  companyAvatarSm: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyAvatarSmText: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
  companyBadgeText: { fontSize: 13, color: '#6b7280' },

  devHint: {
    marginTop: 20,
    padding: 14,
    backgroundColor: 'rgba(234,179,8,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.3)',
  },
  devHintTitle: { color: '#ca8a04', fontWeight: '700', fontSize: 12, marginBottom: 4 },
  devHintText: { color: '#a16207', fontSize: 12 },
});
