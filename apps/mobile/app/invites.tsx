import { INVITE_GOALS } from '@sandbag/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { confirm } from '@/components/confirm';
import { toast } from '@/components/Toast';
import { useSession } from '@/auth/session';
import { Button, Card, Field, Heading, Label, Loading, Muted, Row, Screen, Segments, Title } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { colors, fonts, space } from '@/theme';

export default function Invites() {
  const client = useQueryClient();
  const invites = useQuery({ queryKey: ['invites'], queryFn: api.invites });
  const [code, setCode] = useState('');
  const add = useMutation({
    mutationFn: () => api.addFriend(code),
    onSuccess: (friend) => {
      setCode('');
      toast(`${friend.displayName} is in your crew.`);
      return Promise.all(['invites', 'friends', 'feed', 'rankings'].map((key) => client.invalidateQueries({ queryKey: [key] })));
    },
    onError: (error) => toast(errorText(error)),
  });

  const refresh = () => Promise.all(['invites', 'friends', 'feed', 'rankings'].map((key) => client.invalidateQueries({ queryKey: [key] })));
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
    if (await confirm('Get a new code?', 'Your old code stops working. Everyone already in your crew stays.', 'New code')) rotate.mutate();
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

  return (
    <Screen padTop={false} onRefresh={() => invites.refetch()}>
      <Title>Bring witnesses</Title>
      <Muted>A personal record nobody saw is just a rumour.</Muted>
      {invites.isPending ? <Loading /> : null}
      {invites.isError ? <Muted>Can’t load your invites right now.</Muted> : null}
      {data ? (
        <>
          <Card>
            <Label>Your invite code</Label>
            <Text selectable style={styles.code}>{data.code}</Text>
            <Row>
              <View style={styles.flex}><Button title="Share" onPress={share} /></View>
              <View style={styles.flex}><Button title="Copy" variant="ghost" onPress={copy} /></View>
            </Row>
            <Muted>Anyone with this code can join and see your posts. Only give it to people you know.</Muted>
            <Button title="Get a new code" variant="ghost" busy={rotate.isPending} onPress={() => void askToRotate()} />
          </Card>
          <Card>
            <Text style={styles.count}>{data.joined}</Text>
            <Muted>{data.joined === 1 ? 'person joined' : 'people joined'} through you. Only real sign-ups count.</Muted>
            {data.nextGoal ? (
              <>
                <Segments total={data.nextGoal.count} done={data.joined} />
                <Muted>{data.nextGoal.count - data.joined} more to {data.nextGoal.name}</Muted>
              </>
            ) : <Muted>You’ve hit every goal. Maybe consider a hobby.</Muted>}
            {INVITE_GOALS.map((goal) => (
              <Row key={goal.name} style={styles.goal}>
                <Text style={[styles.goalName, data.joined >= goal.count && styles.earned]}>{goal.name}</Text>
                <Muted>{data.joined >= goal.count ? 'Earned' : `${goal.count} recruits`}</Muted>
              </Row>
            ))}
          </Card>
          <Heading>Top recruiters</Heading>
          {data.recruiters.length ? null : <Muted>Nobody yet. Easiest leaderboard you’ll ever top.</Muted>}
          {data.recruiters.map((row) => (
            <Row key={row.user.id}>
              <Avatar user={row.user} size={30} />
              <Text style={[styles.flex, styles.name]}>{row.user.displayName}</Text>
              <Text style={styles.recruited}>{row.joined}</Text>
              {row.user.id === myId ? null : <Button title={`Remove ${row.user.displayName}`} variant="ghost" style={styles.remove} onPress={() => void askToRemove(row.user.id, row.user.displayName)} />}
            </Row>
          ))}
        </>
      ) : null}
      <Heading style={styles.section}>Already on Sandbag?</Heading>
      <Field label="Their invite code" autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} />
      <Button title="Add to crew" variant="ghost" disabled={!code.trim()} busy={add.isPending} onPress={() => add.mutate()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  code: { fontFamily: fonts.display, fontSize: 34, color: colors.volt, letterSpacing: 2 },
  count: { fontFamily: fonts.display, fontSize: 64, lineHeight: 66, color: colors.ink },
  goal: { justifyContent: 'space-between' },
  goalName: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink2 },
  earned: { color: colors.volt },
  name: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  recruited: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  section: { marginTop: space.md },
  remove: { minHeight: 44, paddingHorizontal: space.sm, justifyContent: 'center' },
});
