import type { NotificationKind, NotificationView } from '@sandbag/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { Icon, type IconName } from '@/components/icons';
import { FadeIn, feel, Pop } from '@/components/motion';
import { Card, Empty, Label, Loading, Muted, Screen } from '@/components/ui';
import { agoShort } from '@/domain/format';
import { hrefFor } from '@/domain/routes';
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
  unread: { borderColor: colors.volt },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
});
