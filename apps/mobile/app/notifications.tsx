import type { NotificationView } from '@sandbag/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { Icon, type IconName } from '@/components/icons';
import { FadeIn, feel, Pop } from '@/components/motion';
import { Empty, Label, Loading, Screen, Title } from '@/components/ui';
import { agoShort } from '@/domain/format';
import { hrefFor } from '@/domain/routes';
import { colors, fonts, radius, space } from '@/theme';

/** What kind of news it is, at a glance, before reading a word of it. */
function lookOf(item: NotificationView): { icon: IconName; color: string } {
  const title = item.title.toLowerCase();
  if (title.includes('trophy')) return { icon: 'crown', color: colors.volt };
  if (title.includes('not guilty') || title.includes('honest') || title.includes('answered')) return { icon: 'shield', color: colors.volt };
  if (title.includes('sandbag')) return { icon: 'bag', color: colors.warn };
  if (title.includes('replied')) return { icon: 'reply', color: colors.ink };
  if (title.includes('recruit') || title.includes('crew')) return { icon: 'people', color: colors.volt };
  if (title.includes('week') || title.includes('season')) return { icon: 'crown', color: colors.ink };
  if (title.includes('pause')) return { icon: 'clock', color: colors.ink };
  if (title.includes('saved')) return { icon: 'share', color: colors.ink };
  return { icon: 'bell', color: colors.ink2 };
}

function Row({ item, index }: { item: NotificationView; index: number }) {
  const href = hrefFor(item.route);
  const look = lookOf(item);
  return (
    <FadeIn delay={Math.min(index, 8) * 45}>
      <Pressable
        accessibilityRole={href ? 'button' : undefined}
        accessibilityLabel={`${item.title}. ${item.body}`}
        disabled={!href}
        onPress={() => {
          feel.tap();
          if (href) router.push(href);
        }}
        style={[styles.row, !item.read && styles.unread]}
      >
        <Pop delay={120 + Math.min(index, 8) * 45}><Icon name={look.icon} size={26} color={look.color} /></Pop>
        <View style={styles.text}>
          <View style={styles.top}>
            <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
            <Text style={styles.time}>{agoShort(item.createdAt)}</Text>
          </View>
          <Text style={styles.body}>{item.body}</Text>
        </View>
      </Pressable>
    </FadeIn>
  );
}

export default function Notifications() {
  const client = useQueryClient();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });
  const unread = notifications.data?.some((item) => !item.read);

  useEffect(() => {
    if (unread) void api.markNotificationsRead().catch(() => {});
    return () => void client.invalidateQueries({ queryKey: ['notifications'] });
  }, [unread, client]);

  const items = notifications.data ?? [];
  const fresh = items.filter((item) => !item.read);
  const older = items.filter((item) => item.read);

  return (
    <Screen padTop={false} onRefresh={() => notifications.refetch()}>
      <Title>News</Title>
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  unread: { backgroundColor: colors.doneBg, borderWidth: 1, borderColor: colors.doneLine },
  text: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  title: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  time: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.5, color: colors.ink3 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink2 },
});
