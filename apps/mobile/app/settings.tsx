import { changePasswordSchema, streakBonus } from '@sandbag/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { forgetSession, useSession } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { confirm } from '@/components/confirm';
import { feel, Pop } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Toast';
import { Button, Field, ListGroup, ListRow, Muted, Screen } from '@/components/ui';
import { useData } from '@/data/store';
import { syncNow } from '@/data/sync';
import { plural, toIsoDate } from '@/domain/format';
import { colors, fonts, radius, space } from '@/theme';

const WEEK = [1, 2, 3, 4, 5, 6, 7];
const MIN_GOAL = 2;
const LONG_STREAK = 12;

/** Seven days, with the goal lit. Tap a day to set it, instead of reading a list of numbers. */
function GoalBars({ goal, onPick }: { goal: number; onPick?: (days: number) => void }) {
  return (
    <View style={styles.bars}>
      {WEEK.map((day) => {
        const bar = <Pop key={`${day}-${day <= goal}`} delay={onPick ? 0 : day * 40}><View style={[styles.bar, day <= goal && styles.barOn, { height: 18 + day * 6 }]} /></Pop>;
        return onPick ? (
          <Pressable
            key={day}
            accessibilityRole="radio"
            accessibilityState={{ checked: goal === day, disabled: day < MIN_GOAL }}
            accessibilityLabel={plural(day, 'day')}
            hitSlop={6}
            disabled={day < MIN_GOAL}
            onPress={() => { feel.tap(); onPick(day); }}
            style={styles.barCell}
          >
            {bar}
          </Pressable>
        ) : <View key={day} style={styles.barCell}>{bar}</View>;
      })}
    </View>
  );
}

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

type Panel = 'name' | 'goal' | 'password' | 'delete' | null;

export default function Settings() {
  const me = useSession((state) => state.me);
  const [panel, setPanel] = useState<Panel>(null);
  const [displayName, setDisplayName] = useState('');
  const [goal, setGoal] = useState(me?.weeklyTarget ?? 3);
  const hasLogged = useData((state) => Object.keys(state.logged).length > 0);
  const goalWaiting = (me?.goalHistory?.at(-1)?.from ?? '') > toIsoDate(new Date());
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [passwordError, setPasswordError] = useState<string>();
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const close = () => setPanel(null);

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

  const saveName = () => run('name', async () => {
    useSession.getState().setMe(await api.updateMe({ displayName: displayName.trim() || (me?.displayName ?? '') }));
    close();
    toast('Saved.');
  });

  const saveGoal = () => run('goal', async () => {
    const changed = goal !== me?.weeklyTarget;
    const updated = await api.updateMe({ weeklyTarget: goal });
    useSession.getState().setMe(updated);
    close();
    toast(changed && updated.goalHistory.length ? 'Saved. It starts next Monday.' : 'Saved.');
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
        close();
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
    const warning = unsynced ? `${plural(unsynced, 'unsynced change')} will be lost.` : 'Your data is safe on the server.';
    if (await confirm('Sign out?', warning, 'Sign out', 'logout')) await useSession.getState().signOut();
  });

  const deleteAccount = async () => {
    if (!deletePassword) {
      toast('Enter your password first.');
      return;
    }
    close();
    const sure = await confirm('Delete your account?', 'Every workout, post and reply goes, for good. Export your data first if you want it.', 'Continue');
    if (!sure || !(await confirm('Really delete it?', 'There’s no undo, and no one can bring it back.', 'Delete everything'))) return;
    await run('delete', async () => {
      await api.deleteAccount(deletePassword);
      await forgetSession();
    });
  };

  return (
    <Screen padTop={false}>
      <Pressable accessibilityRole="button" accessibilityLabel="Change your character" onPress={() => { feel.tap(); router.push('/avatar'); }} style={styles.identity}>
        <Pop><Avatar user={me} size={96} /></Pop>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={styles.name}>{(me?.displayName ?? '').toUpperCase()}</Text>
          <Text style={styles.change}>Change your character</Text>
        </View>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel={`Weekly goal, ${plural(me?.weeklyTarget ?? 3, 'day')}. Change it.`} onPress={() => { feel.tap(); setGoal(me?.weeklyTarget ?? 3); setPanel('goal'); }} style={styles.goalCard}>
        <View style={styles.goalTop}>
          <Text style={styles.goalNumber}>{me?.weeklyTarget ?? 3}</Text>
          <Text style={styles.goalLabel}>DAYS A WEEK{'\n'}{goalWaiting ? 'STARTS NEXT MONDAY' : 'THAT’S THE DEAL'}</Text>
        </View>
        <GoalBars goal={me?.weeklyTarget ?? 3} />
      </Pressable>

      <ListGroup>
        <ListRow icon="user" title="Your name" body={me?.displayName ?? ''} onPress={() => { setDisplayName(me?.displayName ?? ''); setPanel('name'); }} />
        <ListRow icon="lock" title="Change password" onPress={() => setPanel('password')} />
      </ListGroup>
      <ListGroup>
        <ListRow icon="download" title="Export your data" body={busy === 'export' ? 'Getting it ready' : 'Workouts and posts, as one JSON file'} onPress={() => run('export', exportData)} />
        <ListRow icon="key" title="API keys" body="For your own scripts and tools" onPress={() => router.push('/api-keys')} />
      </ListGroup>
      <ListGroup>
        <ListRow icon="logout" title="Sign out" onPress={signOut} />
        <ListRow icon="trash" title="Delete account" danger onPress={() => setPanel('delete')} />
      </ListGroup>

      <Sheet visible={panel === 'name'} onClose={close} title="Your name" footer={<Button title="Save" busy={busy === 'name'} onPress={saveName} />}>
        <Field label="Your crew sees this" maxLength={40} value={displayName} onChangeText={setDisplayName} />
      </Sheet>

      <Sheet visible={panel === 'goal'} onClose={close} title="Weekly goal" footer={<Button title="Save" busy={busy === 'goal'} onPress={saveGoal} />}>
        <Text style={styles.goalBig}>{goal} DAYS</Text>
        <GoalBars goal={goal} onPick={setGoal} />
        <Muted>Hit it each week and your streak grows. Twelve weeks at this goal pays +{streakBonus(LONG_STREAK, goal)} a week, and a bigger goal pays more.{hasLogged ? ' A new goal starts next Monday, so this week and the ones behind you stay as they were.' : ''}</Muted>
      </Sheet>

      <Sheet visible={panel === 'password'} onClose={close} title="Change password" footer={<Button title="Change password" busy={busy === 'password'} onPress={changePassword} />}>
        <Field label="Current password" secureTextEntry autoComplete="current-password" value={current} onChangeText={setCurrent} />
        <Field label="New password" secureTextEntry autoComplete="new-password" value={next} onChangeText={setNext} error={passwordError} />
      </Sheet>

      <Sheet visible={panel === 'delete'} onClose={close} title="Delete account">
        <Muted>Every workout, post and reply goes for good. Export your data first if you want it.</Muted>
        <Field label="Your password" secureTextEntry autoComplete="current-password" value={deletePassword} onChangeText={setDeletePassword} />
        <Button title="Delete account" variant="danger" busy={busy === 'delete'} onPress={deleteAccount} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.ink },
  change: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.volt },
  goalCard: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  goalTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  goalNumber: { fontFamily: fonts.display, fontSize: 56, lineHeight: 68, color: colors.volt },
  goalLabel: { fontFamily: fonts.label, fontSize: 15, lineHeight: 18, letterSpacing: 1, color: colors.ink2 },
  goalBig: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, color: colors.volt },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, minHeight: 64 },
  barCell: { flex: 1, justifyContent: 'flex-end' },
  bar: { backgroundColor: colors.surface2, transform: [{ skewX: '-10deg' }] },
  barOn: { backgroundColor: colors.volt },
});
