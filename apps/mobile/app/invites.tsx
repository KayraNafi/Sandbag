import { INVITE_GOALS } from '@sandbag/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Animated, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { Avatar } from '@/components/Avatar';
import { celebrate } from '@/components/Celebrate';
import { confirm } from '@/components/confirm';
import { Medal } from '@/components/Medal';
import { CountUp, feel, GrowBar, Pop, usePulse } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Toast';
import { Button, Field, Heading, ListGroup, ListRow, Loading, Muted, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, space } from '@/theme';

/** The code as a ticket stub: the one thing on this screen you came for. */
function Ticket({ code, onCopy, onShare }: { code: string; onCopy: () => void; onShare: () => void }) {
  const [copies, setCopies] = useState(0);
  const scale = usePulse(copies, 1.06);
  return (
    <View style={styles.ticket}>
      <View style={[styles.notch, styles.notchLeft]} />
      <View style={[styles.notch, styles.notchRight]} />
      <Text style={styles.ticketLabel}>ADMIT ONE WITNESS</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Your invite code, ${code}. Copy it.`}
        onPress={() => {
          feel.tick();
          setCopies(copies + 1);
          onCopy();
        }}
      >
        <Animated.Text selectable style={[styles.code, { transform: [{ scale }] }]}>{code}</Animated.Text>
        <Text style={styles.copy}>TAP TO COPY</Text>
      </Pressable>
      <View style={styles.tear} />
      <Button title="Share it" variant="ghost" style={styles.ticketButton} onPress={onShare} />
    </View>
  );
}

export default function Invites() {
  const client = useQueryClient();
  const invites = useQuery({ queryKey: ['invites'], queryFn: api.invites });
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const refresh = () => Promise.all(['invites', 'friends', 'feed', 'rankings'].map((key) => client.invalidateQueries({ queryKey: [key] })));
  const add = useMutation({
    mutationFn: () => api.addFriend(code),
    onSuccess: (friend) => {
      setCode('');
      setAdding(false);
      celebrate('WITNESS ADDED');
      toast(`You and ${friend.displayName} can see each other’s posts.`);
      return refresh();
    },
    onError: (error) => toast(errorText(error)),
  });
  const myId = useSession((state) => state.me?.id);
  const rotate = useMutation({
    mutationFn: api.rotateInviteCode,
    onSuccess: () => {
      toast('New code. The old one is dead.');
      return refresh();
    },
    onError: (error) => toast(errorText(error)),
  });
  const remove = useMutation({
    mutationFn: api.removeFriend,
    onSuccess: refresh,
    onError: (error) => toast(errorText(error)),
  });
  const askToRotate = async () => {
    if (await confirm('Get a new code?', 'Your old code stops working. Everyone who already used it stays.', 'New code', 'key')) rotate.mutate();
  };
  const askToRemove = async (id: string, name: string) => {
    const sure = await confirm(`Remove ${name}?`, 'You stop seeing each other’s posts. They can come back with your code, so get a new one if you mean it.', 'Remove');
    if (sure) remove.mutate(id);
  };

  const data = invites.data;
  const copy = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.code);
    toast('Copied. Now use it on someone.');
  };
  const share = () => data && Share.share({ message: `I log my lifts on Sandbag and I need witnesses. Invite code: ${data.code}` }).catch(() => copy());
  const topRecruits = Math.max(1, ...(data?.recruiters.map((row) => row.joined) ?? [1]));

  return (
    <Screen padTop={false} onRefresh={() => invites.refetch()}>
      <Title>Bring witnesses</Title>
      <Muted>A personal record nobody saw is just a rumour.</Muted>
      {invites.isPending ? <Loading /> : null}
      {invites.isError ? <Muted>Can’t load your invites right now.</Muted> : null}
      {data ? (
        <>
          <Ticket code={data.code} onCopy={() => void copy()} onShare={share} />
          <Muted>Anyone with this code can join your crew and see everyone’s posts in it, not only yours. Only give it to people you know.</Muted>

          <View style={styles.joined}>
            <CountUp value={data.joined} style={styles.count} />
            <View style={styles.flex}>
              <Text style={styles.countLabel}>{data.joined === 1 ? 'PERSON' : 'PEOPLE'} JOINED THROUGH YOU</Text>
              <Muted>{data.nextGoal ? `${data.nextGoal.count - data.joined} more to ${data.nextGoal.name}.` : 'You’ve hit every goal. Maybe consider a hobby.'} Only real sign-ups count.</Muted>
            </View>
          </View>

          <View style={styles.ladder}>
            {INVITE_GOALS.map((goal, index) => {
              const earned = data.joined >= goal.count;
              return (
                <View key={goal.name} style={styles.rung}>
                  <Pop delay={150 + index * 110}><Medal id={`invites_${goal.count}`} earned={earned} progress={data.joined / goal.count} size={84} /></Pop>
                  <Text numberOfLines={1} style={[styles.rungName, earned && styles.rungEarned]}>{goal.name}</Text>
                  <Text style={styles.rungCount}>{earned ? 'EARNED' : `${goal.count} RECRUITS`}</Text>
                </View>
              );
            })}
          </View>

          {/* A table of one isn't a leaderboard. */}
          {data.recruiters.some((row) => row.user.id !== myId) ? <Heading section>Top recruiters</Heading> : null}
          {data.recruiters.some((row) => row.user.id !== myId) && data.recruiters.map((row, index) => (
            <Pressable
              key={row.user.id}
              accessibilityRole={row.user.id === myId ? undefined : 'button'}
              accessibilityLabel={row.user.id === myId ? `You, ${row.joined} recruits` : `${row.user.displayName}, ${row.joined} recruits. Remove from your friends.`}
              disabled={row.user.id === myId}
              onPress={() => void askToRemove(row.user.id, row.user.displayName)}
              style={styles.recruiter}
            >
              <Avatar user={row.user} size={40} />
              <View style={styles.bar}>
                <Text numberOfLines={1} style={styles.name}>{row.user.displayName}</Text>
                <GrowBar ratio={row.joined / topRecruits} color={row.user.id === myId ? colors.volt : colors.ink3} delay={100 + index * 70} />
              </View>
              <Text style={styles.recruited}>{row.joined}</Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <ListGroup>
        <ListRow icon="people" title="Already on Sandbag?" body="Add someone with their code" onPress={() => setAdding(true)} />
        <ListRow icon="key" title="Get a new invite code" body="The old one stops working" onPress={() => void askToRotate()} />
      </ListGroup>

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add a witness" footer={<Button title="Add them" disabled={!code.trim()} busy={add.isPending} onPress={() => add.mutate()} />}>
        <Field label="Their invite code" autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  ticket: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.volt, overflow: 'hidden' },
  notch: { position: 'absolute', top: '62%', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.bg },
  notchLeft: { left: -13 },
  notchRight: { right: -13 },
  ticketLabel: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.voltInk },
  code: { fontFamily: fonts.display, fontSize: 48, lineHeight: 54, letterSpacing: 2, color: colors.voltInk },
  copy: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.voltInk, opacity: 0.6 },
  tear: { height: 0, marginVertical: space.sm, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(13, 16, 2, 0.35)' },
  ticketButton: { backgroundColor: colors.voltInk, borderColor: colors.voltInk, minHeight: 56 },
  joined: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  count: { fontFamily: fonts.display, fontSize: 72, lineHeight: 76, color: colors.volt },
  countLabel: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.ink },
  ladder: { flexDirection: 'row', justifyContent: 'space-between' },
  rung: { flex: 1, alignItems: 'center', gap: 2 },
  rungName: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink3 },
  rungEarned: { color: colors.ink },
  rungCount: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.ink3 },
  recruiter: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56 },
  bar: { flex: 1, gap: 6 },
  name: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  recruited: { minWidth: 32, textAlign: 'right', fontFamily: fonts.display, fontSize: 28, color: colors.ink },
});
