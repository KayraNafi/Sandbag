import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text } from 'react-native';
import { api } from '@/api/client';
import { Card, Loading, Muted, Screen, Segments, Title } from '@/components/ui';
import { colors, fonts } from '@/theme';

export default function Trophies() {
  const trophies = useQuery({ queryKey: ['trophies'], queryFn: api.trophies });
  // Earned first, then whatever's closest.
  const rows = [...(trophies.data ?? [])].sort((a, b) =>
    Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt)) || b.progress / b.goal - a.progress / a.goal);

  return (
    <Screen padTop={false} onRefresh={() => trophies.refetch()}>
      <Title>Trophies</Title>
      <Muted>Once you’ve earned one, it’s yours. A bad month can’t take it back.</Muted>
      {trophies.isPending ? <Loading /> : null}
      {trophies.isError ? <Muted>Can’t load trophies right now.</Muted> : null}
      {rows.map((trophy) => (
        <Card key={trophy.id} style={trophy.earnedAt ? styles.earned : undefined}>
          <Text style={[styles.name, trophy.earnedAt ? styles.earnedName : null]}>{trophy.name}</Text>
          <Muted>{trophy.detail}</Muted>
          {trophy.earnedAt ? <Muted>Earned {new Date(trophy.earnedAt).toLocaleDateString()}</Muted> : null}
          {!trophy.earnedAt && trophy.goal > 1 ? (
            <>
              <Segments total={trophy.goal} done={trophy.progress} />
              <Muted>{trophy.progress} of {trophy.goal}</Muted>
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  earned: { borderColor: colors.volt },
  name: { fontFamily: fonts.bodyStrong, fontSize: 17, color: colors.ink },
  earnedName: { color: colors.volt },
});
