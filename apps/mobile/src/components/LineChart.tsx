import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { formatDate, num } from '@/domain/format';
import { colors, fonts } from '@/theme';
import { Muted } from './ui';

export interface ChartPoint {
  date: string;
  value: number;
}

const HEIGHT = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 40 };

function niceTicks(min: number, max: number): number[] {
  const span = max - min || Math.max(max, 1);
  const raw = span / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((candidate) => candidate >= raw) ?? raw;
  const ticks: number[] = [];
  for (let tick = Math.floor(min / step) * step; tick <= max + step * 0.999; tick += step) ticks.push(tick);
  return ticks;
}

const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** One series, so the title names it and there's no legend. Tap selects a point. */
export function LineChart({ points, unit }: { points: ChartPoint[]; unit: string }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;

  const values = points.map((point) => point.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const low = ticks[0] ?? 0;
  const high = ticks.at(-1) ?? 1;
  const start = toTime(first.date);
  const span = toTime(last.date) - start || 1;
  const plotWidth = Math.max(width - PAD.left - PAD.right, 1);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (point: ChartPoint) => PAD.left + (points.length === 1 ? plotWidth / 2 : ((toTime(point.date) - start) / span) * plotWidth);
  const y = (value: number) => PAD.top + plotHeight - ((value - low) / (high - low || 1)) * plotHeight;
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point)} ${y(point.value)}`).join(' ');
  const active = points[selected ?? points.length - 1] ?? last;

  return (
    <View>
      <Muted accessibilityLiveRegion="polite" style={styles.readout}>
        {formatDate(active.date)}: {num(active.value)} {unit}
      </Muted>
      <Pressable
        accessibilityLabel={`Chart of ${points.length} sessions, latest ${num(last.value)} ${unit}. The full log is below.`}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onPress={(event) => {
          const touch = event.nativeEvent.locationX;
          let nearest = 0;
          points.forEach((point, index) => {
            if (Math.abs(x(point) - touch) < Math.abs(x(points[nearest]!) - touch)) nearest = index;
          });
          setSelected(nearest);
        }}
        style={styles.plot}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT} pointerEvents="none">
            {ticks.map((tick) => (
              <Line key={tick} x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={colors.line} strokeWidth={1} />
            ))}
            {ticks.map((tick) => (
              <SvgText key={`t${tick}`} x={PAD.left - 8} y={y(tick) + 4} fill={colors.ink3} fontSize={12} fontFamily={fonts.body} textAnchor="end">
                {num(tick)}
              </SvgText>
            ))}
            <SvgText x={PAD.left} y={HEIGHT - 6} fill={colors.ink3} fontSize={12} fontFamily={fonts.body}>{formatDate(first.date)}</SvgText>
            {points.length > 1 ? (
              <SvgText x={width - PAD.right} y={HEIGHT - 6} fill={colors.ink3} fontSize={12} fontFamily={fonts.body} textAnchor="end">{formatDate(last.date)}</SvgText>
            ) : null}
            <Path d={path} stroke={colors.chart} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((point) => (
              <Circle key={point.date} cx={x(point)} cy={y(point.value)} r={4} fill={colors.chart} stroke={colors.surface} strokeWidth={2} />
            ))}
            <Line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotHeight} stroke={colors.ink3} strokeWidth={1} strokeDasharray="3 3" />
            <Circle cx={x(active)} cy={y(active.value)} r={6} fill={colors.ink} stroke={colors.surface} strokeWidth={2} />
          </Svg>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { height: HEIGHT },
  readout: { marginBottom: 4 },
});
