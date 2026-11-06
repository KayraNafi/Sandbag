# Sandbag

Log your lifts and runs, share them with friends, and find out who's been holding back.

*Sandbagging: looking weaker than you are, on purpose.* Friends can call you on a lift, your next session of it
settles the call, and if you don't beat the number you wear the badge in the rankings for a week. Rankings use
progress and consistency against your own numbers, so heavier friends get no head start. Runs and walks are logged on
their own, with no goal or streak: they pay points for distance, and runs for pace too.

Sandbag is invite-only and self-hosted: you run the server, and your crew's data stays on it.

## Layout

| Path | What it is |
| --- | --- |
| `apps/mobile` | The app: Expo and React Native, for Android, iOS and the web |
| `apps/api` | The API: Fastify, Drizzle and PostgreSQL |
| `packages/shared` | Validation, scoring and the app's voice, used by both |
| `deploy` | Compose file and Caddy example for hosting |

The phone holds a working copy, so logging never waits for the network. Changes sync per document, last write wins.

## Develop

```sh
npm install
npm test && npm run typecheck
npm run dev:memory -w @sandbag/api   # throwaway API on :8080, prints the first invite code
EXPO_PUBLIC_API_URL=http://localhost:8080 npm run web -w @sandbag/mobile
```

Set `DATA_DIR` to keep the local data between runs. Stop the API with Ctrl+C, not by killing it, and never open that folder twice: PGlite may refuse to open it again. It's for development only, and real hosting uses PostgreSQL.

The API has no CORS, so for the web, serve the export and the API on one origin as `deploy/Caddyfile` does.
Phone builds call the API directly.

## API

Anyone with an account can read and add their own workouts with a personal key. See [docs/API.md](docs/API.md).

## Host

1. Copy `deploy/.env.example` to `deploy/.env` and fill it in.
2. `docker compose -f deploy/compose.yaml up -d --build`
3. `npx expo export -p web --output-dir ../../deploy/web` in `apps/mobile`. The web app calls `/api` on its own origin.
4. Point your tunnel or reverse proxy at the `web` container. It serves plain HTTP, so TLS has to end in front of it.
5. Register with the bootstrap invite code. Everyone after that uses a member's code.

There's no email on file, so a forgotten password is reset by the admin:
`docker compose -f deploy/compose.yaml exec api node dist/reset-password.js <username>`. Back up the Postgres data directory.

## Push notifications

Optional. Without them, notifications still appear inside the app.

For the web app, including on iPhone once it's added to the Home Screen:

1. Run `npx web-push generate-vapid-keys` and put the two keys in `deploy/.env` as `WEB_PUSH_PUBLIC_KEY` and `WEB_PUSH_PRIVATE_KEY`, with a contact address in `WEB_PUSH_SUBJECT`.
2. Follow step 4 below. People turn notifications on from the Notifications screen.

For Android:

1. Create a Firebase project and add an Android app with your package name.
2. Put its `google-services.json` in `apps/mobile`. It's ignored by git. Build the app from there.
3. Generate a service account key in Firebase and save it as `deploy/.firebase/admin.json`, readable by uid 1000 only.
4. Set `COMPOSE_PROFILES=push` in `deploy/.env` and run `docker compose up -d --build`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md) for anything sensitive.

## Licence

[AGPL-3.0](LICENSE). If you host a modified version, you have to offer your users its source.
