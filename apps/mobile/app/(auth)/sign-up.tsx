import { registerSchema } from '@sandbag/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { Button, Field, Muted, Screen, Title } from '@/components/ui';
import { colors, fonts, space } from '@/theme';

export default function SignUp() {
  const [form, setForm] = useState({ inviteCode: '', displayName: '', username: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const input = registerSchema.safeParse(form);
    if (!input.success) {
      setErrors(Object.fromEntries(input.error.issues.map((issue) => [String(issue.path[0]), issue.message.startsWith('Invalid') || issue.message.startsWith('Too') ? 'Fill this in' : issue.message])));
      return;
    }
    setErrors({});
    setFailure(undefined);
    setBusy(true);
    try {
      // Only new accounts get the walkthrough. Signing in again goes straight to training.
      await useSession.getState().signIn(await api.register(input.data), { newAccount: true });
    } catch (error) {
      setFailure(errorText(error));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Join the crew</Title>
      <Muted>
        Sandbagging: looking weaker than you are, on purpose. Here your friends can call you on it, and your
        next session settles it. It’s invite-only, so somebody already thinks you’re good for it.
      </Muted>
      <Field label="Invite code" autoCapitalize="none" autoCorrect={false} value={form.inviteCode} onChangeText={set('inviteCode')} error={errors.inviteCode} />
      <Field label="Your name" autoComplete="name" value={form.displayName} onChangeText={set('displayName')} error={errors.displayName} />
      <Field label="Username" autoCapitalize="none" autoCorrect={false} autoComplete="username-new" textContentType="username" value={form.username} onChangeText={set('username')} error={errors.username} />
      <Field label="Password" secureTextEntry autoComplete="new-password" textContentType="newPassword" value={form.password} onChangeText={set('password')} error={errors.password ?? failure} />
      <Button title="Create account" busy={busy} onPress={submit} />
      <Muted>There’s no email on file, so keep this password somewhere safe. If you lose it, whoever runs your server can reset it.</Muted>
      <Link href="/" style={styles.link}>Already in? Sign in</Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt, paddingVertical: space.sm },
});
