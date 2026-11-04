import {
  CALL_DAYS, CALL_POINTS, CALLABLE_DAYS, HONEST_MARGIN, HONEST_RPE, MAX_OPEN_CALLS, MAX_WEEKLY_CALL_POINTS, SANDBAG_BADGE_DAYS, WATCH_DAYS,
} from '@sandbag/shared';
import { Linking } from 'react-native';
import { Body, Button, Card, Heading, Muted, Screen, Title } from '@/components/ui';
import { signedPoints } from '@/domain/format';

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
        <Muted>
          See a lift that looks suspiciously easy? Call sandbag on it, on any post from the last {CALLABLE_DAYS} days. You can
          have {MAX_OPEN_CALLS} calls open at once.
        </Muted>
      </Card>
      <Card>
        <Heading>Settle it</Heading>
        <Muted>
          They have {CALL_DAYS} days. Their next session of that lift has to beat it, weight and reps both counting. Beat it and
          the call is answered. Miss it, or don’t do the lift in time, and the sandbag is confirmed. A typo gets one fix within a day.
        </Muted>
      </Card>
      <Card>
        <Heading>Close calls</Heading>
        <Muted>
          Miss by under {HONEST_MARGIN * 100}% at RPE {HONEST_RPE} or more, and it might be an honest limit. They’re watched for{' '}
          {WATCH_DAYS} days: lift past it in that time and they’re caught, for double. Otherwise nobody scores.
        </Muted>
      </Card>
      <Card>
        <Heading>Score it</Heading>
        <Muted>
          Answered: they get {signedPoints(CALL_POINTS.cleared.target)}, the caller {signedPoints(CALL_POINTS.cleared.caller)}.
          Confirmed: they get {signedPoints(CALL_POINTS.failed.target)}, the caller {signedPoints(CALL_POINTS.failed.caller)}.
          Caught: {signedPoints(CALL_POINTS.caught.target)} and {signedPoints(CALL_POINTS.caught.caller)}. Calls move your
          ranking by at most {MAX_WEEKLY_CALL_POINTS} points a week, either way.
        </Muted>
      </Card>
      <Card>
        <Heading>Wear it</Heading>
        <Muted>Confirmed or caught, the sandbag badge sits next to your name in the rankings for {SANDBAG_BADGE_DAYS} days.</Muted>
      </Card>
      <Card>
        <Heading>It’s free</Heading>
        <Muted>Sandbag is open source under the AGPL-3.0. Read the code, run your own, or tell us what’s broken.</Muted>
        <Button title="See the source" variant="ghost" onPress={() => void Linking.openURL(SOURCE_URL)} />
      </Card>
    </Screen>
  );
}
