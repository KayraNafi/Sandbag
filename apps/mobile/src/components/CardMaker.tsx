import * as ImagePicker from 'expo-image-picker';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CardData } from '@/domain/card';
import { colors, fonts, radius, space } from '@/theme';
import { feel, Pop } from './motion';
import { CARD_HEIGHT, CARD_WIDTH, looksFor, needsPhoto, ShareCard, START_PLACE, type StickerPlace } from './ShareCard';
import { NoPhotoAccess, saveImage } from './saveImage';
import { toast } from './Toast';
import { Button } from './ui';

const CARD_GAP = 12;

/** Swipe through the ways to show it off, then save the one you like. */
export function CardMaker({ data, seed }: { data: CardData; seed: string }) {
  const looks = looksFor(data);
  const cards = useRef<(ComponentRef<typeof View> | null)[]>([]);
  const [lookAt, setLookAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  // Kept here, so the grid shows the photo just as it was arranged.
  const [place, setPlace] = useState<StickerPlace>(START_PLACE);
  const look = looks[lookAt] ?? looks[0]!;

  const pickPhoto = async () => {
    feel.tap();
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      const uri = picked.assets?.[0]?.uri;
      if (!picked.canceled && uri) setPhoto(uri);
    } catch {
      toast('Couldn’t open your photos.');
    }
  };
  const save = async () => {
    const view = cards.current[lookAt];
    if (!view) return;
    setSaving(true);
    try {
      await saveImage(view, `sandbag-${data.date}-${look}`);
      if (Platform.OS !== 'web') toast('Saved to your photos.');
      feel.win();
    } catch (error) {
      toast(error instanceof NoPhotoAccess
        ? 'Sandbag can’t add to your photos. Allow it in Settings.'
        : 'Couldn’t make the picture. A screenshot works just as well.');
    }
    setSaving(false);
  };

  return (
    <View style={styles.flex}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.flex}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH + CARD_GAP}
          decelerationRate="fast"
          onScroll={(event) => setLookAt(Math.max(0, Math.min(looks.length - 1, Math.round(event.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP)))))}
          scrollEventThrottle={32}
          contentContainerStyle={styles.cards}
          style={styles.scroller}
        >
          {looks.map((name, at) => (
            <Pop key={name} delay={at * 90}>
              {/* The checks show the sticker has no background of its own; the rounding stays on screen, so a saved story has no dark corners. */}
              <View style={name === 'sticker' ? styles.clearBehind : name === 'receipt' ? undefined : styles.rounded}>
                <ShareCard
                  ref={(view) => { cards.current[at] = view; }}
                  look={name}
                  data={data}
                  seed={seed}
                  photo={photo}
                  place={place}
                  onPlace={setPlace}
                  onPickPhoto={() => void pickPhoto()}
                />
              </View>
            </Pop>
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {looks.map((name, at) => <View key={name} style={[styles.dot, at === lookAt && styles.dotOn]} />)}
        </View>
        {look === 'photo' ? (
          <View style={styles.hintRow}>
            <Text style={styles.hint}>{photo ? 'Drag your numbers anywhere. Tap them to change size.' : 'Your photo stays on your phone until you share it.'}</Text>
            {photo ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void pickPhoto()}>
                <Text style={styles.hintLink}>Change</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {look === 'sticker' ? <Text style={styles.hint}>See-through, so it goes on top of any photo or story.</Text> : null}
        {look === 'grid' ? <Text style={styles.hint}>All of them in one story, your photo included.</Text> : null}
      </ScrollView>
      {needsPhoto(look) && !photo
        ? <Button title="Add a photo" onPress={() => void pickPhoto()} />
        : <Button title="Save picture" busy={saving} onPress={() => void save()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroller: { flexGrow: 0, marginHorizontal: -space.lg, marginTop: space.sm },
  cards: { gap: CARD_GAP, paddingHorizontal: space.lg, height: CARD_HEIGHT },
  rounded: { borderRadius: radius.lg, overflow: 'hidden' },
  clearBehind: { borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.surface },
  dots: { flexDirection: 'row', alignSelf: 'center', gap: space.xs, marginTop: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface2 },
  dotOn: { backgroundColor: colors.volt },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.sm },
  hint: { flexShrink: 1, marginTop: space.sm, fontFamily: fonts.body, fontSize: 13, color: colors.ink3, textAlign: 'center' },
  hintLink: { marginTop: space.sm, fontFamily: fonts.bodyStrong, fontSize: 13, color: colors.volt },
});
