import { forwardRef, useEffect, useRef, type ComponentRef } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { CardData, CardStat } from '@/domain/card';
import { fitSize, formatDate } from '@/domain/format';
import { colors, fonts, space } from '@/theme';
import { BodyMap } from './BodyMap';
import { Icon } from './icons';
import { Logo } from './Logo';
import { feel } from './motion';

export const CARD_LOOKS = ['photo', 'body', 'volt', 'receipt', 'sticker', 'grid'] as const;
export type CardLook = (typeof CARD_LOOKS)[number];
type TileLook = Exclude<CardLook, 'grid'>;

/** The looks a card can take. The body needs muscles to light, which a run doesn't have. */
export const looksFor = (data: CardData): CardLook[] => CARD_LOOKS.filter((look) => look !== 'body' || (data.load && Object.keys(data.load).length > 0));

/** What goes in the grid: every full look. Not the bare sticker, which is the photo's numbers again without the photo. */
const gridTiles = (data: CardData): TileLook[] => looksFor(data).filter((look): look is TileLook => look !== 'grid' && look !== 'sticker');

/** Looks that are your photo, or have it in them, so they need one before they're worth saving. */
export const needsPhoto = (look: CardLook) => look === 'photo' || look === 'grid';

/** Where the numbers sit on the photo: how far from their corner, and which size. */
export interface StickerPlace { x: number; y: number; size: number }
export const START_PLACE: StickerPlace = { x: 0, y: 0, size: 1 };

/** Story shape, so a card goes straight into whatever people post to. */
export const CARD_WIDTH = 288;
export const CARD_HEIGHT = 512;
const SHOWN_LINES = 6;
const GRID_TILES = 4;
const GRID_GAP = 6;
/** Two across with a gap around each, still story-shaped, so a tile is each look drawn smaller. */
const TILE_SCALE = (CARD_WIDTH - GRID_GAP * 3) / 2 / CARD_WIDTH;
const STICKER_SIZES = [0.8, 1, 1.25];
const STICKER_WIDTH = 190;
const STICKER_HEIGHT = 200;
const STICKER_MARGIN = space.md;
/** Less than this far and a touch on the sticker was a tap, not a drag. */
const TAP_DISTANCE = 6;

const headlineText = (data: CardData) => `${data.headline.value} ${data.headline.label.split(' ')[0]}`;

function Stat({ stat, ink, soft }: { stat: CardStat; ink: string; soft: string }) {
  return (
    <View>
      <Text style={[styles.statValue, { color: ink }]}>{stat.value}</Text>
      <Text style={[styles.statLabel, { color: soft }]}>{stat.label}</Text>
    </View>
  );
}

/** The logo and the name, in the look's own ink. The bag fills about half its box, so it's drawn bigger than the type. */
function Mark({ color, size = 20, style }: { color: string; size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.markRow}>
      <View style={{ marginVertical: -size * 0.45 }}><Logo size={size * 1.9} color={color} /></View>
      <Text style={[styles.mark, { color, fontSize: size, lineHeight: size * 1.2 }, style]}>SANDBAG</Text>
    </View>
  );
}

/** The numbers on nothing at all, so they can sit on any photo. */
function StatSticker({ data }: { data: CardData }) {
  const facts = data.facts.map((fact) => `${fact.value} ${fact.label}`).join(' · ');
  const headline = headlineText(data);
  return (
    <View style={styles.sticker}>
      {data.load ? <View style={styles.stickerBody}><BodyMap size={58} margins={0} levels={data.load} /></View> : null}
      <Mark color={colors.volt} size={17} style={styles.shadow} />
      <Text numberOfLines={1} style={[styles.stickerNumber, styles.shadow, { fontSize: fitSize(40, headline.length, STICKER_WIDTH) }]}>{headline}</Text>
      {facts ? <Text numberOfLines={1} style={[styles.stickerFacts, styles.shadow]}>{facts}</Text> : null}
      {data.bests[0] ? <Text numberOfLines={1} style={[styles.stickerBest, styles.shadow]}>NEW BEST: {data.bests[0].toUpperCase()}</Text> : null}
    </View>
  );
}

/** Drag it where the photo has room. Tap it to change its size. Without onPlace it just sits where it was put. */
function MovableSticker({ data, place, onPlace }: { data: CardData; place: StickerPlace; onPlace?: (place: StickerPlace) => void }) {
  const spot = useRef(new Animated.ValueXY({ x: place.x, y: place.y })).current;
  const resting = useRef({ x: place.x, y: place.y });
  const sizeAt = place.size;
  const sizeRef = useRef(sizeAt);
  sizeRef.current = sizeAt;
  const placeRef = useRef(onPlace);
  placeRef.current = onPlace;
  // Moved somewhere else, as the grid's copy of the photo is when the full one is dragged.
  useEffect(() => {
    resting.current = { x: place.x, y: place.y };
    spot.setValue(resting.current);
  }, [place.x, place.y, spot]);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gesture) => spot.setValue({ x: resting.current.x + gesture.dx, y: resting.current.y + gesture.dy }),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < TAP_DISTANCE && Math.abs(gesture.dy) < TAP_DISTANCE) {
        feel.tap();
        spot.setValue(resting.current);
        placeRef.current?.({ ...resting.current, size: (sizeRef.current + 1) % STICKER_SIZES.length });
        return;
      }
      // Stays on the picture, wherever the thumb ended up.
      const scale = STICKER_SIZES[sizeRef.current] ?? 1;
      const roomX = Math.max(0, CARD_WIDTH - STICKER_MARGIN * 2 - STICKER_WIDTH * scale);
      const roomY = Math.max(0, CARD_HEIGHT - STICKER_MARGIN * 2 - STICKER_HEIGHT * scale);
      resting.current = {
        x: Math.max(0, Math.min(roomX, resting.current.x + gesture.dx)),
        y: Math.min(0, Math.max(-roomY, resting.current.y + gesture.dy)),
      };
      spot.setValue(resting.current);
      placeRef.current?.({ ...resting.current, size: sizeRef.current });
    },
  })).current;
  return (
    <Animated.View
      {...(onPlace ? pan.panHandlers : {})}
      accessibilityLabel={onPlace ? 'Your numbers. Drag to move, tap to resize.' : undefined}
      style={[styles.stickerSpot, { transform: [...spot.getTranslateTransform(), { scale: STICKER_SIZES[sizeAt] ?? 1 }] }]}
    >
      <StatSticker data={data} />
    </Animated.View>
  );
}

/** Your photo with the numbers on it. */
function PhotoLook({ data, photo, onPick, place, onPlace }: { data: CardData; photo: string | null; onPick?: () => void; place: StickerPlace; onPlace?: (place: StickerPlace) => void }) {
  return (
    <View style={[styles.card, styles.photoCard]}>
      {photo ? <Image source={{ uri: photo }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : (
        <Pressable accessibilityRole="button" accessibilityLabel="Add your photo" onPress={onPick} style={styles.photoEmpty}>
          <Icon name="plus" size={48} color={colors.volt} />
          <Text style={styles.photoEmptyText}>ADD YOUR PHOTO</Text>
        </Pressable>
      )}
      <MovableSticker data={data} place={place} onPlace={onPlace} />
    </View>
  );
}

/** The muscles worked, lit up: nobody else's session looks quite like this one. */
function BodyLook({ data }: { data: CardData }) {
  return (
    <View style={[styles.card, styles.bodyCard]}>
      <View style={styles.topRow}>
        <Mark color={colors.volt} />
        <Text style={styles.bodyDate}>{formatDate(data.date).toUpperCase()}</Text>
      </View>
      <Text numberOfLines={2} style={styles.bodyTitle}>{data.title.toUpperCase()}</Text>
      <View style={styles.bodyArt}><BodyMap size={118} margins={0} levels={data.load ?? {}} /></View>
      {data.bests.length ? <Text numberOfLines={1} style={styles.bodyBest}>NEW BEST: {data.bests.join(', ').toUpperCase()}</Text> : null}
      <View style={styles.stats}>
        {[data.headline, ...data.facts].map((stat) => <Stat key={stat.label} stat={stat} ink={colors.ink} soft={colors.ink3} />)}
      </View>
    </View>
  );
}

/** All type, all volt. The number is the picture. */
function VoltLook({ data }: { data: CardData }) {
  const rows = data.lines.length ? data.lines : data.facts.map((fact) => ({ name: fact.label, value: fact.value }));
  const shown = rows.slice(0, SHOWN_LINES);
  return (
    <View style={[styles.card, styles.voltCard]}>
      <View style={styles.topRow}>
        <Mark color={colors.voltInk} />
        <Text style={styles.voltSmall}>{formatDate(data.date).toUpperCase()}</Text>
      </View>
      <View style={styles.voltMiddle}>
        <Text numberOfLines={1} style={[styles.voltNumber, { fontSize: fitSize(72, data.headline.value.length, CARD_WIDTH - space.lg * 2) }]}>{data.headline.value}</Text>
        <Text style={styles.voltUnit}>{data.headline.label}</Text>
        {data.quip ? <Text style={styles.voltLine}>{data.quip}</Text> : null}
      </View>
      <View style={styles.voltLines}>
        <Text numberOfLines={1} style={styles.voltTitle}>{data.title.toUpperCase()}</Text>
        {shown.map((line) => (
          <View key={line.name} style={styles.row}>
            <Text numberOfLines={1} style={styles.voltLineName}>{line.name}</Text>
            <Text style={styles.voltLineValue}>{line.value}</Text>
          </View>
        ))}
        {rows.length > SHOWN_LINES ? <Text style={styles.voltSmall}>AND {rows.length - SHOWN_LINES} MORE</Text> : null}
      </View>
    </View>
  );
}

function Barcode({ seed }: { seed: string }) {
  const bars = Array.from({ length: 34 }, (_, at) => ((seed.charCodeAt(at % seed.length) + at) % 3) + 1);
  return (
    <View style={styles.barcode}>
      {bars.map((width, at) => <View key={at} style={{ width, height: 30, marginRight: 1 + (at % 2), backgroundColor: colors.paperInk }} />)}
    </View>
  );
}

/** Proof of purchase. The joke only works because every number on it is true. */
function ReceiptLook({ data, seed }: { data: CardData; seed: string }) {
  const shown = data.lines.slice(0, SHOWN_LINES);
  const teeth = Array.from({ length: 19 }, (_, at) => `L${(at + 0.5) * 16} 10L${(at + 1) * 16} 0`).join('');
  const total = headlineText(data);
  return (
    <View style={styles.flex}>
      <View style={styles.receipt}>
        <View style={styles.receiptMark}><Mark color={colors.paperInk} size={34} /></View>
        <Text style={styles.receiptSmall}>{formatDate(data.date).toUpperCase()}</Text>
        <View style={styles.rule} />
        <Text numberOfLines={1} style={styles.receiptTitle}>{data.title.toUpperCase()}</Text>
        {shown.map((line) => (
          <View key={line.name} style={styles.row}>
            <Text numberOfLines={1} style={styles.receiptText}>{line.name.toUpperCase()}</Text>
            <Text style={styles.receiptValue}>{line.value}</Text>
          </View>
        ))}
        {data.lines.length > SHOWN_LINES ? <Text style={styles.receiptSmall}>AND {data.lines.length - SHOWN_LINES} MORE</Text> : null}
        <View style={styles.rule} />
        {data.facts.map((fact) => (
          <View key={fact.label} style={styles.row}>
            <Text style={styles.receiptText}>{fact.label}</Text>
            <Text style={styles.receiptValue}>{fact.value}</Text>
          </View>
        ))}
        {data.bests.length ? (
          <View style={styles.row}>
            <Text style={styles.receiptText}>NEW BESTS</Text>
            <Text style={styles.receiptValue}>{data.bests.length}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.receiptText}>EXCUSES</Text>
          <Text style={styles.receiptValue}>0</Text>
        </View>
        <View style={styles.receiptTotal}>
          <Text style={styles.receiptTotalLabel}>TOTAL</Text>
          <Text numberOfLines={1} style={[styles.receiptTotalValue, { fontSize: fitSize(28, total.length, CARD_WIDTH - 110) }]}>{total}</Text>
        </View>
        <View style={styles.receiptEnd}>
          <Barcode seed={seed} />
          <Text style={styles.receiptSmall}>THANK YOU FOR NOT SANDBAGGING.</Text>
        </View>
      </View>
      <Svg width={CARD_WIDTH} height={10} viewBox={`0 0 ${CARD_WIDTH} 10`}>
        <Path d={`M0 0${teeth}Z`} fill={colors.paper} />
      </Svg>
    </View>
  );
}

interface LookProps {
  data: CardData;
  seed: string;
  photo: string | null;
  place: StickerPlace;
}

function Look({ look, data, seed, photo, place, onPickPhoto, onPlace }: LookProps & { look: TileLook; onPickPhoto?: () => void; onPlace?: (place: StickerPlace) => void }) {
  if (look === 'photo') return <PhotoLook data={data} photo={photo} onPick={onPickPhoto} place={place} onPlace={onPlace} />;
  if (look === 'body') return <BodyLook data={data} />;
  if (look === 'volt') return <VoltLook data={data} />;
  if (look === 'receipt') return <ReceiptLook data={data} seed={seed} />;
  return <View style={styles.stickerAlone}><StatSticker data={data} /></View>;
}

/** All of them in one story, the way a layout post puts photos side by side. A gap left over gets the mark. */
function GridLook({ onPickPhoto, ...props }: LookProps & { onPickPhoto: () => void }) {
  const tiles = gridTiles(props.data);
  const cells = Array.from({ length: GRID_TILES }, (_, at) => tiles[at] ?? null);
  return (
    <View style={[styles.card, styles.grid]}>
      {cells.map((look, at) => (
        <View key={look ?? at} style={[styles.tile, look !== 'receipt' && styles.tileRounded]}>
          {look ? (
            <View style={styles.tileInner}>
              <Look look={look} {...props} onPickPhoto={onPickPhoto} />
            </View>
          ) : (
            <View style={styles.tileMark}>
              <Mark color={colors.volt} />
              <Text style={styles.bodyDate}>{formatDate(props.data.date).toUpperCase()}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** A session or a run as something worth posting. Forwarded so the exact view can be saved as an image. */
export const ShareCard = forwardRef<ComponentRef<typeof View>, LookProps & { look: CardLook; onPickPhoto: () => void; onPlace: (place: StickerPlace) => void }>(
  function ShareCard({ look, data, seed, photo, place, onPickPhoto, onPlace }, ref) {
    const shown = { data, seed, photo, place };
    return (
      <View ref={ref} collapsable={false} style={[styles.frame, look !== 'sticker' && styles.frameFilled]}>
        {/* The grid's tiles are pictures of the looks: only an empty photo opens anything, and nothing moves. */}
        {look === 'grid' ? <GridLook {...shown} onPickPhoto={onPickPhoto} /> : <Look look={look} {...shown} onPickPhoto={onPickPhoto} onPlace={onPlace} />}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  frame: { width: CARD_WIDTH, height: CARD_HEIGHT },
  frameFilled: { backgroundColor: colors.bg },
  card: { flex: 1, padding: space.lg, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  mark: { fontFamily: fonts.display },
  shadow: { textShadowColor: colors.photoShade, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  statValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  statLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1 },

  photoCard: { padding: 0, backgroundColor: colors.surface2 },
  photoEmpty: { flex: 1, alignItems: 'center', gap: space.sm, paddingTop: 96 },
  photoEmptyText: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.volt },
  sticker: { width: STICKER_WIDTH },
  stickerBody: { alignSelf: 'flex-start', marginBottom: space.xs },
  stickerNumber: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.onPhoto },
  stickerFacts: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.onPhoto },
  stickerBest: { marginTop: 2, fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.volt },
  stickerSpot: { position: 'absolute', left: STICKER_MARGIN, bottom: STICKER_MARGIN, transformOrigin: 'left bottom' },
  stickerAlone: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bodyCard: { backgroundColor: colors.surface, gap: space.xs },
  bodyDate: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.ink3 },
  bodyTitle: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.ink },
  bodyArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bodyBest: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.volt },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },

  voltCard: { backgroundColor: colors.volt },
  voltSmall: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.voltInk },
  voltMiddle: { flex: 1, justifyContent: 'center', gap: 2 },
  voltNumber: { fontFamily: fonts.display, fontSize: 72, lineHeight: 92, color: colors.voltInk, fontVariant: ['tabular-nums'] },
  voltUnit: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 2, color: colors.voltInk },
  voltLine: { marginTop: space.sm, fontFamily: fonts.bodyStrong, fontSize: 15, lineHeight: 20, color: colors.voltInk },
  voltLines: { gap: 3, paddingTop: space.sm, borderTopWidth: 2, borderColor: colors.voltInk },
  voltTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.voltInk },
  voltLineName: { flex: 1, fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk },
  voltLineValue: { fontFamily: fonts.bodyStrong, fontSize: 15, color: colors.voltInk, fontVariant: ['tabular-nums'] },

  grid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', gap: GRID_GAP, padding: GRID_GAP },
  tile: { width: CARD_WIDTH * TILE_SCALE, height: CARD_HEIGHT * TILE_SCALE, overflow: 'hidden' },
  tileRounded: { borderRadius: 6 },
  tileInner: { width: CARD_WIDTH, height: CARD_HEIGHT, transform: [{ scale: TILE_SCALE }], transformOrigin: 'left top' },
  tileMark: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs, borderRadius: 6, borderWidth: 1, borderColor: colors.line },

  receipt: { flex: 1, gap: 5, padding: space.lg, backgroundColor: colors.paper, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  receiptMark: { alignSelf: 'center' },
  receiptSmall: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.paperInk, textAlign: 'center' },
  rule: { marginVertical: 5, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.paperInk },
  receiptTitle: { fontFamily: fonts.label, fontSize: 17, letterSpacing: 1, color: colors.paperInk },
  receiptText: { flex: 1, fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.5, color: colors.paperInk },
  receiptValue: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.5, color: colors.paperInk, fontVariant: ['tabular-nums'] },
  receiptTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 5, paddingTop: 7, borderTopWidth: 3, borderColor: colors.paperInk },
  receiptTotalLabel: { fontFamily: fonts.display, fontSize: 24, color: colors.paperInk },
  receiptTotalValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.paperInk, fontVariant: ['tabular-nums'] },
  receiptEnd: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: space.xs },
  barcode: { flexDirection: 'row', alignItems: 'flex-end', height: 30 },
});
