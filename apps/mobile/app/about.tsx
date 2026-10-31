import { Linking } from 'react-native';
import { Body, Button, Card, Heading, Muted, Screen, Title } from '@/components/ui';

const SOURCE_URL = 'https://github.com/KayraNafi/Sandbag';

export default function About() {
  return (
    <Screen padTop={false}>
      <Title>Sandbagging</Title>
      <Body>
        Holding back on purpose so you look weaker than you are, then acting surprised when you win. It’s a racing
        term, and every gym has someone doing it.
      </Body>
      <Card>
        <Heading>Call it</Heading>
        <Muted>See a lift that looks suspiciously easy? Call sandbag on it. One call per lift at a time.</Muted>
      </Card>
      <Card>
        <Heading>Settle it</Heading>
        <Muted>Their next logged session of that lift has to beat the number. Beat it and the call is cleared.</Muted>
      </Card>
      <Card>
        <Heading>Wear it</Heading>
        <Muted>Don’t beat it, and the sandbag badge sits next to your name in the rankings for 7 days.</Muted>
      </Card>
      <Card>
        <Heading>It’s free</Heading>
        <Muted>Sandbag is open source under the AGPL-3.0. Read the code, run your own, or tell us what’s broken.</Muted>
        <Button title="See the source" variant="ghost" onPress={() => void Linking.openURL(SOURCE_URL)} />
      </Card>
    </Screen>
  );
}
