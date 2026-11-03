import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space } from '@/theme';
import { Icon } from './icons';
import { FadeIn, feel } from './motion';

/** A short list of titles with one open at a time, so nobody faces a wall of rules. */
export function Topics({ items }: { items: { title: string; body: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <View style={styles.list}>
      {items.map((item, index) => {
        const on = open === index;
        return (
          <Pressable
            key={item.title}
            accessibilityRole="button"
            accessibilityState={{ expanded: on }}
            onPress={() => { feel.tap(); setOpen(on ? -1 : index); }}
            style={[styles.topic, on && styles.topicOn]}
          >
            <View style={styles.head}>
              <Text style={[styles.title, on && styles.titleOn]}>{item.title.toUpperCase()}</Text>
              <Icon name={on ? 'close' : 'plus'} size={18} color={on ? colors.volt : colors.ink3} />
            </View>
            {on ? <FadeIn><Text style={styles.body}>{item.body}</Text></FadeIn> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  topic: { minHeight: 56, justifyContent: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line },
  topicOn: { borderColor: colors.volt },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.ink2 },
  titleOn: { color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 23, color: colors.ink2 },
});
