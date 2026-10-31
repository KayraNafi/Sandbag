import { loginSchema } from '@sandbag/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { Logo } from '@/components/Logo';
import { Body, Button, Field, Screen, Title } from '@/components/ui';
import { colors, fonts, space } from '@/theme';

export default function SignIn() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const input = loginSchema.safeParse({ username, password });
    if (!input.success) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await useSession.getState().signIn(await api.login(input.data));
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <Screen>
        <Logo size={112} />
        <Title style={styles.brand}>Sandbag</Title>
        <Body>Log your lifts. Prove you’re not holding back.</Body>
        <Field label="Username" autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" value={username} onChangeText={setUsername} />
        <Field label="Password" secureTextEntry autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={submit} error={error} />
        <Button title="Sign in" busy={busy} onPress={submit} />
        <Link href="/sign-up" style={styles.link}>Got an invite? Create your account</Link>
        <Link href="/about" style={styles.link}>What’s sandbagging?</Link>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  brand: { fontSize: 64, lineHeight: 66, color: colors.volt },
  link: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt, paddingVertical: space.sm },
});
