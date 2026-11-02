/** The app's one voice: lightly sarcastic, about effort and excuses, never bodies. */
export const voice = {
  weightUp: (gain: string) => `+${gain} kg. Alert the press.`,
  weightDown: () => 'Deload. That’s what we’re calling it.',
  sameWeight: (weight: string) => `${weight} kg again. Consistency, or fear?`,
  rpeTen: () => 'RPE 10 again. Sure.',
  overLimit: (limit: string) => `Capped at ${limit}. We still don’t believe you.`,
  finished: () => 'Logged. Screenshots or it didn’t happen, except we have the data.',
  noBest: () => 'No new bests. A very safe day at the office.',
  quiet: (days: number) => `It’s been ${days} days. The machines have stopped asking about you.`,
  overtaken: (name: string) => `${name} just overtook you. Thought you’d want to know.`,
  callCleared: (name: string, exercise: string) => `${name} beat your call on ${exercise}. Awkward.`,
  callFailed: (name: string, exercise: string) => `${name} didn’t beat your call on ${exercise}. Sandbag confirmed.`,
  friendJoined: (name: string) => `${name} joined through your invite.`,
  streak: (weeks: number) => `${weeks} weeks in a row. Don’t make it your whole personality.`,
  trophy: (name: string) => `${name}. Put it on your CV.`,
  trophies: (count: number) => `${count} trophies at once. Somebody’s been busy, or lying.`,
  workoutSaved: (name: string, workout: string) => `${name} saved ${workout}. Now you have to actually be better at it.`,
};
