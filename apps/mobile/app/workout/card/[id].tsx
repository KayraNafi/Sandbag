import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SessionCards, useCardData } from '@/components/SessionCards';
import { useData } from '@/data/store';
import { colors, space } from '@/theme';

/** The same cards the finish ends on, for any session, whenever you decide it deserves one. */
export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const workout = useData((state) => (id ? state.logged[id] : undefined));
  const data = useCardData(workout);
  if (!workout || workout.deleted || !data) return null;
  return (
    <View style={[styles.host, { paddingBottom: insets.bottom + space.md }]}>
      <SessionCards data={data} seed={workout.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: space.lg, backgroundColor: colors.bg },
});
