import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import { api } from '@/api/client';
import { Card, Empty, Loading, Muted, Screen } from '@/components/ui';
import { agoShort } from '@/domain/format';
import { hrefFor } from '@/domain/routes';
import { colors, fonts } from '@/theme';

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
        return (
          <Card key={item.id} style={item.read ? undefined : styles.unread} label={item.title} {...(href ? { onPress: () => router.push(href) } : {})}>
            <Text style={styles.title}>{item.title} <Text style={styles.time}>{agoShort(item.createdAt)}</Text></Text>
            <Muted>{item.body}</Muted>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  unread: { borderColor: colors.volt },
  title: { fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.ink3 },
});
