import type { TrophyView } from '@sandbag/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import { NextTrophy, TrophyGrid, TrophySheet } from '@/components/Medal';
import { CountUp } from '@/components/motion';
import { Card, Loading, Muted, Screen, Segments, Title } from '@/components/ui';
import { colors, fonts } from '@/theme';

export default function Trophies() {
  const trophies = useQuery({ queryKey: ['trophies'], queryFn: api.trophies });
  const [open, setOpen] = useState<TrophyView | null>(null);
  const rows = trophies.data ?? [];
  const earned = rows.filter((trophy) => trophy.earnedAt).length;

  return (
    <Screen padTop={false} onRefresh={() => trophies.refetch()}>
      <Title>Trophies</Title>
      {trophies.isPending ? <Loading /> : null}
      {trophies.isError ? <Muted>Can’t load trophies right now.</Muted> : null}
      {rows.length ? (
        <>
          <View style={styles.count}>
            <CountUp value={earned} style={styles.big} />
            <Text style={styles.of}>OF {rows.length} ON THE SHELF</Text>
          </View>
          <Segments total={rows.length} done={earned} />
          <Card><NextTrophy trophies={rows} onOpen={setOpen} /></Card>
          <TrophyGrid trophies={rows} onOpen={setOpen} />
          <Muted style={styles.note}>Once you’ve earned one, it’s yours. A bad month can’t take it back.</Muted>
        </>
      ) : null}
      <TrophySheet trophy={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  big: { fontFamily: fonts.display, fontSize: 56, lineHeight: 68, color: colors.volt },
  of: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.ink3, marginBottom: 12 },
  note: { textAlign: 'center' },
});
