import type { NotificationKind } from '@sandbag/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { Icon, type IconName } from '@/components/icons';
import { Card, Empty, Loading, Muted, Screen } from '@/components/ui';
import { agoShort } from '@/domain/format';
import { hrefFor } from '@/domain/routes';
import { colors, fonts, space } from '@/theme';

/** Volt is good news for you, warn is a challenge, ink is just news. */
const LOOK: Record<NotificationKind, { icon: IconName; color: string }> = {
  call: { icon: 'bag', color: colors.warn },
  confirmed: { icon: 'bag', color: colors.volt },
  answered: { icon: 'shield', color: colors.ink2 },
  overtaken: { icon: 'flame', color: colors.warn },
  trophy: { icon: 'crown', color: colors.volt },
  recruit: { icon: 'people', color: colors.volt },
  reply: { icon: 'reply', color: colors.ink },
  saved: { icon: 'share', color: colors.ink },
};

export default function Notifications() {
  const client = useQueryClient();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: api.notifications });
  const unread = notifications.data?.some((item) => !item.read);

  useEffect(() => {
    if (unread) void api.markNotificationsRead().catch(() => {});
    return () => void client.invalidateQueries({ queryKey: ['notifications'] });
  }, [unread, client]);

  return (
    <Screen padTop={false} onRefresh={() => notifications.refetch()}>
      {notifications.isPending ? <Loading /> : null}
      {notifications.isSuccess && !notifications.data.length ? <Empty title="All quiet" body="Nobody’s talking about you. Yet." /> : null}
      {notifications.data?.map((item) => {
        const href = hrefFor(item.route);
        const look = LOOK[item.kind];
        return (
          <Card key={item.id} style={item.read ? undefined : styles.unread} label={item.title} {...(href ? { onPress: () => router.push(href) } : {})}>
            <View style={styles.row}>
              <Icon name={look.icon} color={look.color} size={26} />
              <View style={styles.text}>
                <Text style={styles.title}>{item.title} <Text style={styles.time}>{agoShort(item.createdAt)}</Text></Text>
                <Muted>{item.body}</Muted>
              </View>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  unread: { borderColor: colors.volt },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
});
