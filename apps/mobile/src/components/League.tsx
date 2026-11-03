import { SEASON_WEEKS, type CrewMemberView, type CrewView } from '@sandbag/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, errorText } from '@/api/client';
import { useSession } from '@/auth/session';
import { formatDate, plural } from '@/domain/format';
import { colors, fonts, space } from '@/theme';
import { Avatar } from './Avatar';
import { confirm } from './confirm';
import { Icon } from './icons';
import { celebrate } from './Celebrate';
import { CountUp, FadeIn, feel, Pop, Stamp } from './motion';
import { Sheet } from './Sheet';
import { toast } from './Toast';
import { Button, Card, Chip, Field, Heading, Label, ListGroup, ListRow, Loading, Muted, Row, Segments } from './ui';

const trendText = (trend: number) => (trend > 0 ? `+${trend}` : trend < 0 ? `−${Math.abs(trend)}` : '');

function NoCrew() {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const done = () => client.invalidateQueries({ queryKey: ['crew'] });
  const create = useMutation({ mutationFn: () => api.createCrew(name.trim()), onSuccess: () => { celebrate('CREW’S UP'); return done(); }, onError: (error) => toast(errorText(error)) });
  const join = useMutation({ mutationFn: () => api.joinCrew(code.trim()), onSuccess: () => { celebrate('YOU’RE IN'); return done(); }, onError: (error) => toast(errorText(error)) });
  return (
    <>
      <Card>
        <Heading>Start a crew</Heading>
        <Muted>Eight-week seasons. A different opponent each week, everyone on one table.</Muted>
        <Field label="Crew name" placeholder="Basement Lifters" maxLength={40} value={name} onChangeText={setName} />
        <Button title="Start it" disabled={!name.trim()} busy={create.isPending} onPress={() => create.mutate()} />
      </Card>
      <Card>
        <Heading>Join one</Heading>
        <Field label="A member’s invite code" autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} />
        <Button title="Join" variant="ghost" disabled={!code.trim()} busy={join.isPending} onPress={() => join.mutate()} />
      </Card>
    </>
  );
}

export function Match({ crew, myId }: { crew: CrewView; myId: string | undefined }) {
  const me = crew.members.find((member) => member.user.id === myId)?.user ?? null;
  const { match } = crew;
  if (!match) {
    return (
      <Card>
        <Label>This week</Label>
        <Muted>{crew.week ? 'You joined this week, so your first match is on Monday.' : `The season starts on ${formatDate(crew.startsOn)}. Get people in before then.`}</Muted>
      </Card>
    );
  }
  if (match.note === 'bye' || !match.opponent) {
    return (
      <Card>
        <Label>This week</Label>
        <Heading>No match</Heading>
        <Muted>Odd numbers, so you sit this one out. Your rating’s safe, unless you don’t train at all.</Muted>
      </Card>
    );
  }
  const winning = match.myScore > match.theirScore;
  return (
    <Card style={styles.match}>
      <Label>{match.note === 'paused' ? 'This week, paused' : 'This week’s match'}</Label>
      <Row style={styles.versus}>
        <Pop delay={80} style={styles.side}>
          <Avatar user={me} size={56} />
          <CountUp value={match.myScore} delay={200} style={[styles.matchScore, winning && styles.matchLead]} />
          <Text numberOfLines={1} style={styles.matchName}>You</Text>
        </Pop>
        <Stamp delay={320}><Text style={styles.vs}>VS</Text></Stamp>
        <Pop delay={160} style={styles.side}>
          <Avatar user={match.opponent} size={56} />
          <CountUp value={match.theirScore} delay={200} style={[styles.matchScore, match.theirScore > match.myScore && styles.matchLead]} />
          <Text numberOfLines={1} style={styles.matchName}>{match.opponent.displayName}</Text>
        </Pop>
      </Row>
    </Card>
  );
}

export function League() {
  const client = useQueryClient();
  const me = useSession((state) => state.me);
  const crew = useQuery({ queryKey: ['crew'], queryFn: api.crew });
  const [member, setMember] = useState<CrewMemberView | null>(null);
  const [pausing, setPausing] = useState(false);
  const [weeks, setWeeks] = useState(1);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const done = () => client.invalidateQueries({ queryKey: ['crew'] });
  const fail = (error: unknown) => toast(errorText(error));
  const leave = useMutation({ mutationFn: api.leaveCrew, onSuccess: done, onError: fail });
  const remove = useMutation({ mutationFn: api.removeFromCrew, onSuccess: () => { setMember(null); return done(); }, onError: fail });
  const decide = useMutation({ mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api.decidePause(id, approve), onSuccess: done, onError: fail });
  const ask = useMutation({ mutationFn: () => api.askForPause(weeks), onSuccess: () => { setPausing(false); toast('Asked. Your crew decides.'); return done(); }, onError: fail });
  const rename = useMutation({ mutationFn: () => api.renameCrew(name.trim()), onSuccess: () => { setRenaming(false); return done(); }, onError: fail });

  if (crew.isPending) return <Loading />;
  if (crew.isError) return <Muted>Can’t load your crew right now.</Muted>;
  const data = crew.data;
  if (!data) return <NoCrew />;
  const mine = data.pauses.find((pause) => pause.user.id === me?.id);
  const toDecide = data.pauses.filter((pause) => pause.canDecide);

  return (
    <>
      <FadeIn>
        <Row style={styles.head}>
          <View style={styles.flex}>
            <Heading>{data.name}</Heading>
            <Muted>{data.week ? `Season ${data.season}, week ${data.week} of ${SEASON_WEEKS}` : `Season ${data.season} starts ${formatDate(data.startsOn)}`}</Muted>
          </View>
          {data.isAdmin ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Rename crew" hitSlop={6} onPress={() => { setName(data.name); setRenaming(true); }} style={styles.iconButton}>
              <Icon name="gear" size={22} color={colors.ink2} />
            </Pressable>
          ) : null}
        </Row>
        {data.week ? <View style={styles.segments}><Segments total={SEASON_WEEKS} done={data.week} /></View> : null}
      </FadeIn>

      {data.lastChampion ? (
        <Row>
          <Icon name="crown" size={18} color={colors.volt} />
          <Muted style={styles.flex}>Last season’s champion: {data.lastChampion.displayName}. It won’t let you forget.</Muted>
        </Row>
      ) : null}

      {toDecide.map((pause) => (
        <Card key={pause.id} style={styles.ask}>
          <Heading>{pause.user.displayName} asked for a pause</Heading>
          <Muted>{plural(pause.weeks, 'week')} off, starting now. No reason needed.</Muted>
          <Row>
            <View style={styles.flex}><Button title="Allow" busy={decide.isPending} onPress={() => { feel.tap(); decide.mutate({ id: pause.id, approve: true }); }} /></View>
            <View style={styles.flex}><Button title="Say no" variant="ghost" onPress={() => decide.mutate({ id: pause.id, approve: false })} /></View>
          </Row>
        </Card>
      ))}

      <FadeIn delay={80}><Match crew={data} myId={me?.id} /></FadeIn>

      {data.lastMatch?.note === 'match' && data.lastMatch.opponent ? (
        <Muted>Last week against {data.lastMatch.opponent.displayName}: {data.lastMatch.myScore} to {data.lastMatch.theirScore}{data.lastMatch.ratingChange ? `, ${trendText(data.lastMatch.ratingChange)} rating` : ''}.</Muted>
      ) : null}
      {data.lastMatch?.note === 'forfeit' && data.lastMatch.opponent ? (
        <Muted>{(data.lastMatch.ratingChange ?? 0) > 0 ? `${data.lastMatch.opponent.displayName} walked out last week, so that one’s yours` : `You walked out on ${data.lastMatch.opponent.displayName} last week`}{data.lastMatch.ratingChange ? `, ${trendText(data.lastMatch.ratingChange)}.` : '.'}</Muted>
      ) : null}
      {data.lastMatch?.note === 'idle' ? <Muted>Last week you didn’t train at all, and your rating paid for it.</Muted> : null}

      <FadeIn delay={140}>
        <ListGroup>
          {data.members.map((row) => (
            <Pressable
              key={row.user.id}
              accessibilityRole={data.isAdmin && row.user.id !== me?.id ? 'button' : undefined}
              accessibilityLabel={`${row.rank}. ${row.user.displayName}, rating ${row.rating}`}
              disabled={!data.isAdmin || row.user.id === me?.id}
              onPress={() => setMember(row)}
              style={({ pressed }) => [styles.member, row.user.id === me?.id && styles.memberMine, pressed && styles.memberPressed]}
            >
              {row.rank === 1
                ? <Stamp delay={500} style={styles.crown}><Icon name="crown" size={20} color={colors.volt} /></Stamp>
                : <Text style={styles.rank}>{row.rank}</Text>}
              <Avatar user={row.user} size={36} />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={styles.memberName}>{row.user.displayName}{row.admin ? ' ·' : ''}{row.admin ? <Text style={styles.adminTag}> ADMIN</Text> : null}</Text>
                {row.paused ? <Muted>Paused</Muted> : row.waiting ? <Muted>Starts Monday</Muted> : null}
              </View>
              {row.trend ? <Text style={[styles.trend, row.trend > 0 ? styles.up : styles.down]}>{trendText(row.trend)}</Text> : null}
              <CountUp value={row.rating} style={styles.rating} />
            </Pressable>
          ))}
        </ListGroup>
      </FadeIn>

      <ListGroup>
        <ListRow title="Bring witnesses" body="Your invite code adds people to this crew" onPress={() => router.push('/invites')} />
        <ListRow
          title="Pause my streak"
          body={mine ? (mine.status === 'pending' ? 'Waiting for your crew' : `Paused for ${plural(mine.weeks, 'week')}`) : 'Injured or away? Your crew can allow it'}
          {...(mine ? {} : { onPress: () => setPausing(true) })}
        />
        <ListRow title="Leave crew" danger onPress={async () => {
          if (await confirm(`Leave ${data.name}?`, 'You forfeit this week’s match and stop seeing their posts. If you come back this season, your rating is still here.', 'Leave', 'logout')) leave.mutate();
        }} />
      </ListGroup>

      <Sheet visible={pausing} onClose={() => setPausing(false)} title="Pause my streak" footer={<Button title="Ask my crew" busy={ask.isPending} onPress={() => ask.mutate()} />}>
        <Muted>Your streak holds, open calls wait, and you earn no bonus while it lasts. Your crew has to say yes, and you don’t have to say why.</Muted>
        <Row>
          {[1, 2, 3, 4].map((count) => <Chip key={count} title={plural(count, 'week')} active={weeks === count} onPress={() => setWeeks(count)} />)}
        </Row>
      </Sheet>

      <Sheet visible={Boolean(member)} onClose={() => setMember(null)} title={member?.user.displayName ?? ''}>
        <Muted>Removing someone stops them playing and cuts them off from everyone’s posts. They can come back with a member’s code, so get a new code too if you mean it.</Muted>
        <Button title="Remove from crew" variant="danger" busy={remove.isPending} onPress={() => { if (member) remove.mutate(member.user.id); }} />
      </Sheet>

      <Sheet visible={renaming} onClose={() => setRenaming(false)} title="Rename crew" footer={<Button title="Save" disabled={!name.trim()} busy={rename.isPending} onPress={() => rename.mutate()} />}>
        <Field label="Crew name" maxLength={40} value={name} onChangeText={setName} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  segments: { marginTop: space.sm },
  ask: { borderColor: colors.volt },
  match: { gap: space.md },
  versus: { justifyContent: 'space-around' },
  side: { alignItems: 'center', gap: space.xs, flex: 1 },
  vs: { fontFamily: fonts.display, fontSize: 20, color: colors.ink3 },
  matchScore: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.ink2 },
  matchLead: { color: colors.volt },
  matchName: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  member: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 60, paddingHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  memberMine: { backgroundColor: colors.doneBg },
  memberPressed: { opacity: 0.7 },
  crown: { width: 22, alignItems: 'center' },
  rank: { width: 22, textAlign: 'center', fontFamily: fonts.display, fontSize: 20, color: colors.ink3 },
  memberName: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.ink },
  adminTag: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.ink3 },
  trend: { fontFamily: fonts.label, fontSize: 15 },
  up: { color: colors.volt },
  down: { color: colors.danger },
  rating: { minWidth: 56, textAlign: 'right', fontFamily: fonts.display, fontSize: 24, color: colors.ink },
});
