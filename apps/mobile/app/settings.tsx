import { changePasswordSchema } from '@sandbag/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';
import { api, errorText } from '@/api/client';
import { forgetSession, useSession } from '@/auth/session';
import { confirm } from '@/components/confirm';
import { toast } from '@/components/Toast';
import { Button, Card, Field, Heading, Muted, NumberField, Screen } from '@/components/ui';
import { useData } from '@/data/store';
import { syncNow } from '@/data/sync';

async function exportData(): Promise<void> {
  const text = JSON.stringify(await api.exportData(), null, 2);
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = 'sandbag-export.json';
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  await Share.share({ title: 'sandbag-export.json', message: text });
}

export default function Settings() {
  const me = useSession((state) => state.me);
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [target, setTarget] = useState<number | null>(me?.weeklyTarget ?? null);
  useEffect(() => {
    if (!me) return;
    setDisplayName((value) => value || me.displayName);
    setTarget((value) => value ?? me.weeklyTarget);
  }, [me]);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
    } catch (error) {
      toast(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = () => run('profile', async () => {
    const weeklyTarget = Math.max(1, Math.min(14, Math.round(target ?? 3)));
    const updated = await api.updateMe({ displayName: displayName.trim() || (me?.displayName ?? ''), weeklyTarget });
    useSession.getState().setMe(updated);
    setTarget(weeklyTarget);
    toast('Saved.');
  });

  const changePassword = () => {
    const input = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!input.success) {
      setPasswordError(input.error.issues[0]?.path[0] === 'newPassword' ? 'Use at least 10 characters.' : 'Enter your current password.');
      return;
    }
    setPasswordError(undefined);
    void run('password', async () => {
      try {
        await api.changePassword(current, next);
        setCurrent('');
        setNext('');
        toast('Password changed. Your other devices are signed out.');
      } catch (error) {
        setPasswordError(errorText(error));
      }
    });
  };

  const signOut = () => run('signOut', async () => {
    await syncNow();
    const { dirtyLogged, dirtySaved, outbox } = useData.getState();
    const unsynced = dirtyLogged.length + dirtySaved.length + outbox.length;
    const warning = unsynced ? `${unsynced} unsynced changes will be lost.` : 'Your data is safe on the server.';
    if (await confirm('Sign out?', warning, 'Sign out')) await useSession.getState().signOut();
  });

  const deleteAccount = async () => {
    if (!deletePassword) {
      toast('Enter your password first.');
      return;
    }
    const sure = await confirm('Delete your account?', 'Every workout, post and reply goes, for good. Export your data first if you want it.', 'Continue');
    if (!sure || !(await confirm('Really delete it?', 'There’s no undo, and no one can bring it back.', 'Delete everything'))) return;
    await run('delete', async () => {
      await api.deleteAccount(deletePassword);
      await forgetSession();
    });
  };

  return (
    <Screen padTop={false}>
      <Card>
        <Heading>Profile</Heading>
        <Field label="Your name" maxLength={40} value={displayName} onChangeText={setDisplayName} />
        <NumberField label="Workouts per week" decimals={false} value={target} max={14} onChange={setTarget} />
        <Muted>Consistency in the rankings is measured against this. Setting it low is noted.</Muted>
        <Button title="Save" variant="ghost" busy={busy === 'profile'} onPress={saveProfile} />
      </Card>
      <Card>
        <Heading>Password</Heading>
        <Field label="Current password" secureTextEntry autoComplete="current-password" value={current} onChangeText={setCurrent} />
        <Field label="New password" secureTextEntry autoComplete="new-password" value={next} onChangeText={setNext} error={passwordError} />
        <Button title="Change password" variant="ghost" busy={busy === 'password'} onPress={changePassword} />
      </Card>
      <Card>
        <Heading>Your data</Heading>
        <Muted>Your workouts, saved workouts and posts, as one JSON file.</Muted>
        <Button title="Export" variant="ghost" busy={busy === 'export'} onPress={() => run('export', exportData)} />
      </Card>
      <Card label="API keys" onPress={() => router.push('/api-keys')}>
        <Heading>API keys</Heading>
        <Muted>Add or read your workouts from your own scripts and tools.</Muted>
      </Card>
      <Button title="Sign out" variant="ghost" busy={busy === 'signOut'} onPress={signOut} />
      <Card>
        <Heading>Delete account</Heading>
        <Field label="Your password" secureTextEntry autoComplete="current-password" value={deletePassword} onChangeText={setDeletePassword} />
        <Button title="Delete account" variant="danger" busy={busy === 'delete'} onPress={deleteAccount} />
      </Card>
    </Screen>
  );
}
