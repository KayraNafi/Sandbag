import { registerSchema } from '@sandbag/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, type TextInputProps } from 'react-native';
import { api, ApiError, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { FadeIn, feel } from '@/components/motion';
import { Button, Field, Muted, Screen, Segments, Title } from '@/components/ui';
import { colors, fonts, space } from '@/theme';

type Key = 'inviteCode' | 'displayName' | 'username' | 'password';

const STEPS: { key: Key; title: string; hint: string; label: string; input: TextInputProps }[] = [
  {
    key: 'inviteCode',
    title: 'Who let you in?',
    hint: 'It’s invite-only, so somebody already thinks you’re good for it.',
    label: 'Invite code',
    input: { autoCapitalize: 'none', autoCorrect: false },
  },
  {
    key: 'displayName',
    title: 'What do they call you?',
    hint: 'Your crew sees this. It’ll be next to your numbers, so choose wisely.',
    label: 'Your name',
    input: { autoComplete: 'name' },
  },
  {
    key: 'username',
    title: 'Pick a username',
    hint: 'This is how you sign in.',
    label: 'Username',
    input: { autoCapitalize: 'none', autoCorrect: false, autoComplete: 'username-new', textContentType: 'username' },
  },
  {
    key: 'password',
    title: 'Last thing',
    hint: 'There’s no email on file, so keep this password somewhere safe. If you lose it, whoever runs your server can reset it.',
    label: 'Password',
    input: { secureTextEntry: true, autoComplete: 'new-password', textContentType: 'newPassword' },
  },
];

const firstWords = (message: string) => (message.startsWith('Invalid') || message.startsWith('Too') ? 'That doesn’t look right' : message);

/** One question a screen. A form with four boxes looks like work. Four small questions don't. */
export default function SignUp() {
  const [form, setForm] = useState<Record<Key, string>>({ inviteCode: '', displayName: '', username: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(0);
  const step = STEPS[at]!;
  const last = at === STEPS.length - 1;

  const submit = async () => {
    const input = registerSchema.safeParse(form);
    if (!input.success) {
      const found = Object.fromEntries(input.error.issues.map((issue) => [String(issue.path[0]), issue.message.startsWith('Invalid') || issue.message.startsWith('Too') ? 'Fill this in' : issue.message]));
      setErrors(found);
      // Back to the first answer that needs fixing, rather than an error for a box that isn't on screen.
      const first = STEPS.findIndex((item) => found[item.key]);
      if (first >= 0) setAt(first);
      return;
    }
    setErrors({});
    setFailure(undefined);
    setBusy(true);
    try {
      await useSession.getState().signIn(await api.register(input.data));
    } catch (error) {
      setBusy(false);
      const text = errorText(error);
      // Someone can take the username or use up the code while you're typing, so go back to whichever it was.
      const back: Key | null = error instanceof ApiError && error.status === 409 ? 'username' : /invite/i.test(text) ? 'inviteCode' : null;
      if (back) {
        setErrors({ [back]: text });
        setAt(STEPS.findIndex((item) => item.key === back));
      } else setFailure(text);
    }
  };

  // Each answer is checked on its own screen, so nobody fills in four boxes to learn the first was wrong.
  const onward = async () => {
    feel.tap();
    if (last) {
      void submit();
      return;
    }
    const value = form[step.key];
    const fail = (message: string) => setErrors((current) => ({ ...current, [step.key]: message }));
    if (!value.trim()) {
      fail('Fill this in');
      return;
    }
    const parsed = registerSchema.shape[step.key].safeParse(value);
    if (!parsed.success) {
      fail(firstWords(parsed.error.issues[0]?.message ?? 'That doesn’t look right'));
      return;
    }
    setErrors((current) => ({ ...current, [step.key]: undefined }));
    if (step.key === 'inviteCode' || step.key === 'username') {
      setBusy(true);
      // A failed check isn't a no. Being offline here shouldn't stop anyone, and the last step checks again.
      const check = await api.checkSignUp({ [step.key]: parsed.data as string }).catch(() => null);
      setBusy(false);
      if (check?.[step.key] === false) {
        fail(step.key === 'inviteCode' ? 'That invite code isn’t working. Check it with whoever sent it.' : 'That username’s taken. Somebody got there first.');
        return;
      }
    }
    setAt(at + 1);
  };

  return (
    <Screen>
      <Segments total={STEPS.length} done={at + 1} />
      <FadeIn key={step.key} style={styles.step}>
        <Title style={styles.title}>{step.title}</Title>
        <Muted>{step.hint}</Muted>
        <Field
          {...step.input}
          label={step.label}
          value={form[step.key]}
          onChangeText={(value) => setForm((current) => ({ ...current, [step.key]: value }))}
          onSubmitEditing={() => void onward()}
          returnKeyType={last ? 'done' : 'next'}
          autoFocus
          error={errors[step.key] ?? (last ? failure : undefined)}
        />
      </FadeIn>
      <Button title={last ? 'Create account' : 'Next'} busy={busy} onPress={() => void onward()} />
      {at > 0 ? <Button title="Back" variant="ghost" onPress={() => setAt(at - 1)} /> : null}
      {at === 0 ? (
        <Text style={styles.about}>Sandbagging: looking weaker than you are, on purpose. Here your friends can call you on it, and your next session settles it.</Text>
      ) : null}
      <Link href="/" style={styles.link}>Already in? Sign in</Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { gap: space.md, marginTop: space.xl },
  title: { color: colors.volt },
  about: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: colors.ink3 },
  link: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt, paddingVertical: space.sm },
});
