import type { NotificationKind, NotificationView } from '@sandbag/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { Icon, type IconName } from '@/components/icons';
import { FadeIn, feel, Pop } from '@/components/motion';
import { toast } from '@/components/Toast';
import { Button, Card, Empty, Label, Loading, Muted, Screen } from '@/components/ui';
import { agoShort } from '@/domain/format';
import { hrefFor } from '@/domain/routes';
import { useWebPush } from '@/push/webPush';
import { colors, fonts, space } from '@/theme';

/** Volt is good news for you, warn is a challenge, ink is just news. */
const LOOK: Record<NotificationKind, { icon: IconName; color: string }> = {
  call: { icon: 'bag', color: colors.warn },
  confirmed: { icon: 'bag', color: colors.volt },
  answered: { icon: 'shield', color: colors.ink2 },
  watching: { icon: 'clock', color: colors.ink2 },
  honest: { icon: 'shield', color: colors.ink },
  overtaken: { icon: 'flame', color: colors.warn },
  trophy: { icon: 'crown', color: colors.volt },
  recruit: { icon: 'people', color: colors.volt },
  reply: { icon: 'reply', color: colors.ink },
  saved: { icon: 'share', color: colors.ink },
  nudge: { icon: 'bell', color: colors.warn },
};

/** Rows arrive one after another, but only the first few wait their turn. */
const STAGGER_MS = 45;
const delayFor = (index: number) => Math.min(index, 8) * STAGGER_MS;

function Row({ item, index }: { item: NotificationView; index: number }) {
  const href = hrefFor(item.route);
  const look = LOOK[item.kind];
  const open = href ? () => { feel.tap(); router.push(href); } : undefined;
  return (
    <FadeIn delay={delayFor(index)}>
      <Card style={item.read ? undefined : styles.unread} label={item.title} {...(open ? { onPress: open } : {})}>
        <View style={styles.row}>
          <Pop delay={120 + delayFor(index)}><Icon name={look.icon} color={look.color} size={26} /></Pop>
          <View style={styles.text}>
            <Text style={styles.title}>{item.title} <Text style={styles.time}>{agoShort(item.createdAt)}</Text></Text>
            <Muted>{item.body}</Muted>
          </View>
        </View>
      </Card>
    </FadeIn>
  );
}

/** The web app can't ask by itself, so it asks here, where you see what you'd be getting. */
function WebPushCard() {
  const { state, enable } = useWebPush();
  const [busy, setBusy] = useState(false);
  if (state === 'unsupported' || state === 'on') return null;
  const turnOn = async () => {
    setBusy(true);
    try {
      await enable();
    } catch {
      toast('Couldn’t turn them on. Try again in a bit.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={styles.pushCard}>
      <View style={styles.row}>
        <Icon name="bell" color={colors.volt} size={26} />
        <View style={styles.text}>
          {state === 'ask' ? <>
            <Text style={styles.title}>Hear about it right away</Text>
            <Muted>Calls on you, replies and nudges, as they happen.</Muted>
          </> : null}
          {state === 'install' ? <>
            <Text style={styles.title}>Want these on your lock screen?</Text>
            <Muted>On iPhone, add Sandbag to your Home Screen first: tap Share, then Add to Home Screen. Open it from there and turn them on.</Muted>
          </> : null}
          {state === 'blocked' ? <>
            <Text style={styles.title}>Notifications are blocked</Text>
            <Muted>Turn them back on for Sandbag in your phone’s or browser’s settings.</Muted>
          </> : null}
        </View>
      </View>
      {state === 'ask' ? <Button title="Turn on notifications" busy={busy} onPress={() => void turnOn()} /> : null}
    </Card>
  );
}

export default function Notifications() {
  const client = useQueryClient();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });
  const items = notifications.data ?? [];
  const fresh = items.filter((item) => !item.read);
  const older = items.filter((item) => item.read);
  const unread = fresh.length > 0;

  useEffect(() => {
    if (unread) void api.markNotificationsRead().catch(() => {});
    return () => void client.invalidateQueries({ queryKey: ['notifications'] });
  }, [unread, client]);

  return (
    <Screen padTop={false} onRefresh={() => notifications.refetch()}>
      <WebPushCard />
      {notifications.isPending ? <Loading /> : null}
      {notifications.isSuccess && !items.length ? <Empty title="All quiet" body="Nobody’s talking about you. Yet." /> : null}
      {fresh.length ? <Label style={styles.newLabel}>New</Label> : null}
      {fresh.map((item, index) => <Row key={item.id} item={item} index={index} />)}
      {fresh.length && older.length ? <Label>Earlier</Label> : null}
      {older.map((item, index) => <Row key={item.id} item={item} index={fresh.length + index} />)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  newLabel: { color: colors.volt },
  pushCard: { gap: space.md },
  unread: { borderColor: colors.volt },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
});
