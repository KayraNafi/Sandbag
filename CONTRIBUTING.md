# Contributing

Thanks for looking. Sandbag is a small hobby project, so small, focused changes are the easiest to take.

## Before you open a pull request

```sh
npm install
npm test && npm run typecheck
```

To click around with a crew already in it, use the demo data in `apps/api/src/cli/seed-demo.ts`. Its header says how to run it. It's for local data only.

## How the code is laid out

- **Rules live in `packages/shared`.** Scoring, limits and validation are shared by the phone and the server, so they can't disagree. A new rule goes in there, with tests in `scoring.test.ts`.
- **The server doesn't trust the phone.** Anything that affects someone else, like rankings, calls and trophies, is worked out on the API. `apps/api/src/security.test.ts` attacks it the way an outsider would, so add to it when you add a route.
- **The phone never waits for the network.** Logging writes to the local store first and `sync.ts` sends it later.

## How the app should feel

- **One decision at a time.** Each screen has one obvious thing to press, and it sits under the thumb. Tap targets are at least 44 points.
- **Things move.** Reward with motion, and respect reduced-motion settings through `prefersLessMotion`.
- **The voice is in `packages/shared/src/voice.ts`.** It teases effort and excuses, never bodies, and it's never cruel. A moment worth teasing gets a few lines to rotate through.
- **Numbers should be believable.** `believableSet` decides what counts as a real set. Its limits sit above the all-time records on purpose, so raise them if a record ever gets close. Never lower them to catch someone.

## Art and data

Characters and body art are drawn in code. Only add art you made yourself or that's openly licensed, and don't add likenesses of real people. Don't paste real people's data into tests or seeds.

## Security problems

Please don't open an issue. See [SECURITY.md](SECURITY.md).

## Licence

By contributing you agree your work is released under the [AGPL-3.0](LICENSE).
