const REST_LINES = [
  'Breathe. The bar isn’t going anywhere.',
  'Drink some water. Look busy.',
  'This is the bit where you check your phone. Oh, look.',
  'Rest. Not a nap.',
  'Someone’s watching your form. Probably not.',
  'Shake it out like that does anything.',
  'Pretend to adjust the bench.',
  'Walk to the water fountain like it’s important.',
  'If anyone asks, this is part of the programme.',
  'The next one won’t lift itself. We checked.',
];


/** One of a few lines, so the same joke doesn't land twice in a row. */
const pick = (lines: string[], seed: number) => lines[Math.abs(Math.floor(seed)) % lines.length]!;

/** Real masses in kg, so whatever you moved is compared to the thing it's actually closest to. */
const MOVED: readonly (readonly [number, string])[] = [
  [1, 'That’s a bag of sugar. Put it in your coffee.'],
  [4, 'That’s a cat. It didn’t want to be lifted either.'],
  [7, 'That’s a bowling ball. Nobody clapped.'],
  [23, 'That’s a suitcase. Carry-on, if you’re lucky.'],
  [45, 'That’s one large dog. Carried, repeatedly.'],
  [90, 'That’s a fridge. The beers stayed in.'],
  [300, 'That’s a vending machine. It still owes you a drink.'],
  [450, 'That’s a grand piano. Up the stairs, in pieces.'],
  [1000, 'That’s a small car. You still drove to the gym.'],
  [2000, 'That’s a hippo. Nobody asked, but well done.'],
  [6000, 'That’s an elephant. It isn’t impressed either.'],
  [12000, 'That’s a city bus. Exact change not required.'],
  [40000, 'That’s a loaded lorry. The driver has questions.'],
  [150000, 'That’s a blue whale. Go home.'],
  [400000, 'That’s a full jumbo jet. Sure.'],
  [2000000, 'That’s a space shuttle on the pad. Houston has questions.'],
  [7300000, 'That’s the Eiffel Tower. The French want it back.'],
  [52000000, 'That’s the Titanic. That also went badly.'],
  [6000000000, 'That’s the Great Pyramid. It took them twenty years.'],
];

const closestMoved = (kg: number) => MOVED.reduce((near, item) => (Math.abs(Math.log(kg / item[0])) < Math.abs(Math.log(kg / near[0])) ? item : near));

/** The app's one voice: lightly sarcastic, about effort and excuses, never bodies. */
export const voice = {
  /** What a total of kilos moved is closest to, as a line. */
  lifted: (kg: number) => closestMoved(kg)[1],
  weightUp: (gain: string) => `+${gain} kg. Alert the press.`,
  weightDown: () => 'Deload. That’s what we’re calling it.',
  sameWeight: (weight: string) => `${weight} kg again. Consistency, or fear?`,
  rpeTen: (seed = 0) => pick(['RPE 10 again. Sure.', 'RPE 10. And yet here you are, typing.', 'Absolute limit, was it? We’ll remember that.'], seed),
  overLimit: (limit: string) => `Capped at ${limit}. We still don’t believe you.`,
  finished: () => 'Logged. Screenshots or it didn’t happen, except we have the data.',
  noBest: () => 'No new bests. A very safe day at the office.',
  quiet: (days: number) => `It’s been ${days} days. The machines have stopped asking about you.`,
  overtaken: (name: string) => `${name} just overtook you. Thought you’d want to know.`,
  callCleared: (name: string, exercise: string) => `${name} beat your call on ${exercise}. Awkward.`,
  callFailed: (name: string, exercise: string) => `${name} didn’t beat your call on ${exercise}. Sandbag confirmed.`,
  callExpired: (name: string, exercise: string) => `${name} never answered your call on ${exercise}. Sandbag confirmed by default.`,
  callExpiredOnYou: (exercise: string) => `Your ${exercise} call ran out. No session, no defence.`,
  callWatching: (name: string, exercise: string) => `${name} just missed your call on ${exercise}, at their limit. Watching for two weeks.`,
  callBelieved: (name: string, exercise: string) => `${name}’s miss on ${exercise} stood up. Honest, this time.`,
  callBelievedOnYou: (exercise: string) => `Your miss on ${exercise} stood up. No sandbag.`,
  callCaught: (name: string, exercise: string) => `${name} “couldn’t” do ${exercise}, then did more. Caught. Double points.`,
  callCaughtOnYou: (exercise: string) => `That ${exercise} was no limit after all. Caught sandbagging.`,
  callReopened: (name: string, exercise: string) => `${name} deleted the session that answered your call on ${exercise}. It’s open again.`,
  friendJoined: (name: string) => `${name} joined through your invite.`,
  streak: (weeks: number) => `${weeks} weeks in a row. Don’t make it your whole personality.`,
  trophy: (name: string) => `${name}. Put it on your CV.`,
  trophies: (count: number) => `${count} trophies at once. Somebody’s been busy, or lying.`,
  workoutSaved: (name: string, workout: string) => `${name} saved ${workout}. Now you have to actually be better at it.`,
  nudged: (name: string, seed = 0) => pick([
    `${name} noticed you haven’t posted today. Just saying.`,
    `${name} checked on you. You weren’t there.`,
    `${name} says your gym bag’s been asking about you.`,
  ], seed),
  nudgeSent: (name: string, seed = 0) => pick([`Nudged ${name}. They know you know.`, `Nudged ${name}. Very supportive. Very smug.`], seed),
  rest: (turn: number) => pick(REST_LINES, turn),
  shortRest: (seed = 0) => pick(['That was quick. Sure about that?', 'Barely sat down. Showing off?', 'No rest? Bold. We’ll see about the next one.'], seed),
  longRest: (seed = 0) => pick(['Still resting? The bar’s filed a missing person report.', 'This rest has its own postcode now.', 'At this point it counts as a second session.'], seed),
  /** A drop set that's run out of weight to drop. */
  dropFloor: (seed = 0) => pick([
    'Next drop is the empty handle. Then your dignity.',
    'Nothing left to drop but your ego.',
    'Any lighter and it’s a stretch.',
    'You’re lifting the idea of a weight now.',
    'Drop again and you’re holding air. Bold.',
    'The pin’s at the top. The machine is embarrassed for you.',
  ], seed),
  noNap: (seed = 0) => pick(['That’s not rest, that’s a nap.', 'Thirty minutes is plenty. Get up.'], seed),
  allDone: (seed = 0) => pick(['Nothing left on the list. Suspicious, but we’ll allow it.', 'All ticked. Either you’re done or you’re done pretending.', 'That’s the list. Go home, or don’t.'], seed),
  undoSet: (seed = 0) => pick(['Un-lifted. Physics disagrees.', 'Taken back. It still happened, though.'], seed),
  needWeight: (seed = 0) => pick(['Put a weight in first. Even a guess beats nothing.', 'Lifted what, exactly? Put a number in.', 'No weight, no set. We have standards. Low ones, but still.'], seed),
  zeroReps: (seed = 0) => pick(['Zero reps is called standing there.', 'Zero reps. You looked at it, at least.', 'Holding your phone doesn’t count as a set.'], seed),
  noWay: (weight: string, seed = 0) => pick([`${weight} kg. Sure. That one doesn’t count.`, `${weight} kg. Did you bring witnesses? Not counted.`, `${weight} kg. Put that on your CV, not here. Not counted.`], seed),
  tinyWeight: (weight: string, seed = 0) => pick([`${weight} kg. Careful, you’ll pull something.`, `${weight} kg. We’ve seen heavier sandwiches.`], seed),
  manyReps: (reps: number, seed = 0) => pick([`${reps} reps. Is this cardio now?`, `${reps} reps. Someone’s avoiding adding weight.`], seed),
  rpeLow: (seed = 0) => pick(['That easy? So why are we here?', 'That easy? Someone should call that.', 'Barely an effort, and you put it in writing.'], seed),
  discard: () => 'None of this gets logged. We’ll say you were never here.',
  runLogged: (seed = 0) => pick(['Logged. Your knees have been informed.', 'Logged. Running away from your problems, one km at a time.', 'Logged. A running club somewhere felt a disturbance.'], seed),
  tooFast: () => 'Faster than the world record. Congratulations, it doesn’t count.',
  restOver: 'Rest’s over. That bar isn’t going to lift itself.',
};
