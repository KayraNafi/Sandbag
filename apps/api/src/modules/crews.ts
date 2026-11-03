import {
  addDays, createCrewSchema, dateIn, IDLE_DECAY, joinCrewSchema, mondayOf, ratingChange, renameCrewSchema, requestPauseSchema, SEASON_WEEKS, START_RATING, voice, weekPairs,
  type CrewMatchView, type CrewView, type PauseView,
} from '@sandbag/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { lockUser, type Db, type DbOrTx, type Tx } from '../db/client';
import { crewMembers, crews, crewWeeks, sandbagCalls, streakPauses, users, type CrewWeekResult } from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { requireUser, toPublic } from './auth';
import { expireCalls } from './calls';
import { befriend, unfriend } from './friends';
import { notify } from './notifications';
import { pausedWeeksFor, peopleOnDay } from './rankings';

const DAY_MS = 86_400_000;
const MAX_MEMBERS = 30;
/** Phones can be offline and a day behind, so a week stays open until Tuesday, UTC. */
const GRACE_DAYS = 1;
/** After a long gap the rest settle on later visits, so one request can't do years of work. */
const MAX_WEEKS_PER_VISIT = 12;
const UUID = /^[0-9a-f-]{36}$/i;
const STRICT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

const today = () => new Date().toISOString().slice(0, 10);
const startOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
const nextMonday = (iso: string) => addDays(mondayOf(iso), 7);

type Member = typeof crewMembers.$inferSelect;

async function myCrew(db: DbOrTx, userId: string): Promise<(typeof crews.$inferSelect) | null> {
  const [row] = await db.select({ crew: crews }).from(crewMembers)
    .innerJoin(crews, eq(crews.id, crewMembers.crewId))
    .where(and(eq(crewMembers.userId, userId), isNull(crewMembers.leftAt)));
  return row?.crew ?? null;
}

const activeMembers = (db: DbOrTx, crewId: string) => db.select().from(crewMembers)
  .where(and(eq(crewMembers.crewId, crewId), isNull(crewMembers.leftAt)))
  .orderBy(asc(crewMembers.joinedAt));

/** The admin, or whoever's been there longest if the admin's account is gone. */
function adminOf(crew: typeof crews.$inferSelect, members: Member[]): string | null {
  return crew.adminId && members.some((member) => member.userId === crew.adminId) ? crew.adminId : members[0]?.userId ?? null;
}

/** New members sit out the week they joined, or the draw would shift under everyone midweek. */
function playingIn(members: Member[], monday: string): Member[] {
  const start = startOf(monday);
  return members.filter((member) => member.joinedAt < start && (!member.leftAt || member.leftAt >= start));
}

async function addMember(tx: DbOrTx, crewId: string, userId: string): Promise<void> {
  // Coming back keeps the old rating, so leaving can't wipe a bad season. Coming back the
  // same week keeps your place in it too, or leaving and rejoining would skip a match.
  const thisWeek = startOf(mondayOf(today())).toISOString();
  await tx.insert(crewMembers).values({ crewId, userId }).onConflictDoUpdate({
    target: [crewMembers.crewId, crewMembers.userId],
    set: { leftAt: null, removedAt: null, joinedAt: sql`case when ${crewMembers.leftAt} >= ${thisWeek}::timestamptz then ${crewMembers.joinedAt} else now() end` },
  });
  for (const member of await activeMembers(tx, crewId)) if (member.userId !== userId) await befriend(tx, member.userId, userId);
}

/** Someone invited by a crew member starts out in that crew. */
export async function joinInvitersCrew(tx: DbOrTx, inviterId: string, user: { id: string; displayName: string }): Promise<void> {
  const crew = await myCrew(tx, inviterId);
  if (!crew) return;
  if ((await activeMembers(tx, crew.id)).length >= MAX_MEMBERS) return;
  await addMember(tx, crew.id, user.id);
}

/** Settles one finished week: everyone's score, the matches, and the season if it just ended. */
async function settleWeek(tx: Tx, crew: typeof crews.$inferSelect, week: string): Promise<typeof crews.$inferSelect> {
  const allMembers = await tx.select().from(crewMembers).where(eq(crewMembers.crewId, crew.id));
  const playing = playingIn(allMembers, week);
  const sunday = addDays(week, 6);
  const closedAt = startOf(addDays(week, 7 + GRACE_DAYS));
  await expireCalls(tx, playing.map((member) => member.userId));
  const people = playing.length ? await tx.select().from(users).where(inArray(users.id, playing.map((member) => member.userId))) : [];
  const standing = await peopleOnDay(tx, people, 'week', sunday, closedAt);
  const index = Math.round((startOf(week).getTime() - startOf(crew.seasonStart).getTime()) / (7 * DAY_MS));
  const { pairs, bye } = weekPairs(playing.map((member) => member.userId), index);
  const ratingOf = new Map(playing.map((member) => [member.userId, member.rating]));
  // Leaving after the week ended, before it settled, isn't walking out on it: you played it.
  const weekEnd = startOf(addDays(week, 7));
  const active = new Set(allMembers.filter((member) => !member.leftAt || member.leftAt >= weekEnd).map((member) => member.userId));
  const removed = new Set(allMembers.filter((member) => member.removedAt).map((member) => member.userId));
  const results: CrewWeekResult[] = [];

  const scoreOf = (id: string) => standing.get(id)?.score ?? 0;
  const pausedNow = (id: string) => standing.get(id)?.paused ?? false;
  const result = (userId: string, opponentId: string | null, change: number, note: CrewWeekResult['note']): CrewWeekResult => {
    const days = standing.get(userId)?.days ?? 0;
    // Nothing at all is what gets punished, not missing a self-set goal, so a low goal gains nothing.
    const idle = days === 0 && !pausedNow(userId) && note !== 'forfeit';
    return {
      userId,
      opponentId,
      score: scoreOf(userId),
      opponentScore: opponentId ? scoreOf(opponentId) : 0,
      change: change - (idle ? IDLE_DECAY : 0),
      note: idle && note !== 'paused' ? 'idle' : note,
    };
  };

  for (const [a, b] of pairs) {
    if (!active.has(a) || !active.has(b)) {
      const stayer = active.has(a) ? a : active.has(b) ? b : null;
      const leaver = stayer === a ? b : a;
      if (!stayer) continue;
      // Being removed isn't their doing, so nobody's rating moves on it.
      if (removed.has(leaver)) {
        results.push(result(stayer, null, 0, 'bye'));
        continue;
      }
      // Walking out loses the match, or leaving on Sunday would be the way out of any loss.
      const stayerRating = ratingOf.get(stayer) ?? START_RATING;
      const leaverRating = ratingOf.get(leaver) ?? START_RATING;
      results.push(
        result(stayer, leaver, ratingChange(stayerRating, leaverRating, 1, 0), 'forfeit'),
        result(leaver, stayer, ratingChange(leaverRating, stayerRating, 0, 1), 'forfeit'),
      );
      continue;
    }
    // Someone who's paused can't be beaten, so nobody's rating moves on it.
    if (pausedNow(a) || pausedNow(b)) {
      results.push(result(a, b, 0, 'paused'), result(b, a, 0, 'paused'));
      continue;
    }
    const ratingA = ratingOf.get(a) ?? START_RATING;
    const ratingB = ratingOf.get(b) ?? START_RATING;
    results.push(
      result(a, b, ratingChange(ratingA, ratingB, scoreOf(a), scoreOf(b)), 'match'),
      result(b, a, ratingChange(ratingB, ratingA, scoreOf(b), scoreOf(a)), 'match'),
    );
  }
  if (bye && active.has(bye)) results.push(result(bye, null, 0, 'bye'));

  await tx.insert(crewWeeks).values({ crewId: crew.id, week, season: crew.season, results }).onConflictDoNothing();
  const names = new Map(people.map((person) => [person.id, person.displayName]));
  for (const row of results) {
    await tx.update(crewMembers)
      .set({ rating: sql`greatest(0, ${crewMembers.rating} + ${row.change})`, trend: row.change })
      .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, row.userId)));
    const opponent = row.opponentId ? names.get(row.opponentId) ?? 'They' : null;
    if (row.note === 'idle') await notify(tx, row.userId, { title: 'Week settled', body: voice.weekIdle(IDLE_DECAY), route: 'rankings' });
    else if (row.note === 'forfeit' && opponent) {
      await notify(tx, row.userId, { title: 'Week settled', body: row.change > 0 ? voice.weekForfeit(opponent, row.change) : voice.weekForfeitYou(opponent, row.change), route: 'rankings' });
    }
    else if (row.note === 'match' && opponent) {
      const body = row.score === row.opponentScore ? voice.weekDrawn(opponent) : row.score > row.opponentScore ? voice.weekWon(opponent, row.change) : voice.weekLost(opponent, row.change);
      await notify(tx, row.userId, { title: 'Week settled', body, route: 'rankings' });
    }
  }

  if (index + 1 < SEASON_WEEKS) return crew;
  const finals = await tx.select().from(crewMembers).where(and(eq(crewMembers.crewId, crew.id), isNull(crewMembers.leftAt))).orderBy(desc(crewMembers.rating), asc(crewMembers.joinedAt));
  const champion = finals[0]?.userId ?? null;
  const [next] = await tx.update(crews).set({ season: crew.season + 1, seasonStart: addDays(week, 7), lastChampionId: champion }).where(eq(crews.id, crew.id)).returning();
  await tx.update(crewMembers).set({ rating: START_RATING, trend: 0 }).where(eq(crewMembers.crewId, crew.id));
  const [winner] = champion ? await tx.select().from(users).where(eq(users.id, champion)) : [];
  if (winner) for (const member of finals) await notify(tx, member.userId, { title: 'Season over', body: voice.seasonWon(winner.displayName, crew.name), route: 'rankings' });
  return next ?? crew;
}

/** There's no scheduler, so weeks settle the first time anyone looks after they close. */
export async function settleCrew(db: Db, crewId: string): Promise<void> {
  await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    // One at a time, or two people opening the app on Tuesday would both apply the same week.
    await lockUser(tx, crewId);
    let [crew] = await tx.select().from(crews).where(eq(crews.id, crewId));
    if (!crew) return;
    const [last] = await tx.select({ week: crewWeeks.week }).from(crewWeeks).where(eq(crewWeeks.crewId, crewId)).orderBy(desc(crewWeeks.week)).limit(1);
    let week = last ? addDays(last.week, 7) : crew.seasonStart;
    if (week < crew.seasonStart) week = crew.seasonStart;
    for (let done = 0; done < MAX_WEEKS_PER_VISIT && addDays(week, 7 + GRACE_DAYS) <= today(); done += 1) {
      crew = await settleWeek(tx, crew, week);
      week = addDays(week, 7);
    }
  });
}

function toMatch(week: string, row: CrewWeekResult | undefined, opponent: ReturnType<typeof toPublic> | null): CrewMatchView | null {
  if (!row) return null;
  return { week, opponent, myScore: row.score, theirScore: row.opponentScore, ratingChange: row.change, note: row.note };
}

async function crewView(db: Db, crew: typeof crews.$inferSelect, viewerId: string): Promise<CrewView> {
  const members = await activeMembers(db, crew.id);
  const people = await db.select().from(users).where(inArray(users.id, members.map((member) => member.userId)));
  const person = new Map(people.map((row) => [row.id, row]));
  const monday = mondayOf(dateIn(person.get(viewerId)?.timeZone));
  const paused = await pausedWeeksFor(db, members.map((member) => member.userId));
  const admin = adminOf(crew, members);
  const started = monday >= crew.seasonStart;

  // Ties share a rank, the same way the rankings do.
  const ordered = [...members].sort((a, b) => b.rating - a.rating || (person.get(a.userId)?.displayName ?? '').localeCompare(person.get(b.userId)?.displayName ?? ''));
  const start = startOf(monday);

  let match: CrewMatchView | null = null;
  if (started) {
    const index = Math.round((start.getTime() - startOf(crew.seasonStart).getTime()) / (7 * DAY_MS));
    const { pairs, bye } = weekPairs(playingIn(members, monday).map((member) => member.userId), index);
    const pair = pairs.find((item) => item.includes(viewerId));
    const opponentId = pair ? (pair[0] === viewerId ? pair[1] : pair[0]) : null;
    if (pair || bye === viewerId) {
      const standing = await peopleOnDay(db, people, 'week', null);
      const opponent = opponentId ? person.get(opponentId) : undefined;
      const isPaused = Boolean(paused.get(viewerId)?.includes(monday) || (opponentId && paused.get(opponentId)?.includes(monday)));
      match = {
        week: monday,
        opponent: opponent ? toPublic(opponent) : null,
        myScore: standing.get(viewerId)?.score ?? 0,
        theirScore: opponentId ? standing.get(opponentId)?.score ?? 0 : 0,
        ratingChange: null,
        note: isPaused ? 'paused' : pair ? 'match' : 'bye',
      };
    }
  }

  const [latest] = await db.select().from(crewWeeks).where(eq(crewWeeks.crewId, crew.id)).orderBy(desc(crewWeeks.week)).limit(1);
  const lastRow = latest?.results.find((row) => row.userId === viewerId);
  // They may have left, which is exactly when you want to know who it was.
  const [lastOpponent] = lastRow?.opponentId ? await db.select().from(users).where(eq(users.id, lastRow.opponentId)) : [];
  const [championRow] = crew.lastChampionId ? await db.select().from(users).where(eq(users.id, crew.lastChampionId)) : [];

  const pauseRows = await db.select({ pause: streakPauses, user: users }).from(streakPauses)
    .innerJoin(users, eq(users.id, streakPauses.userId))
    .where(and(eq(streakPauses.crewId, crew.id), inArray(streakPauses.status, ['pending', 'approved'])))
    .orderBy(desc(streakPauses.createdAt));
  const pauses: PauseView[] = pauseRows
    .filter(({ pause }) => pause.status === 'pending' || (pause.fromWeek && addDays(pause.fromWeek, pause.weeks * 7) > monday))
    .map(({ pause, user }) => ({
      id: pause.id,
      user: toPublic(user),
      weeks: pause.weeks,
      fromWeek: pause.fromWeek ?? monday,
      status: pause.status,
      canDecide: pause.status === 'pending' && pause.userId !== viewerId && (viewerId === admin || pause.userId === admin),
    }));

  return {
    id: crew.id,
    name: crew.name,
    season: crew.season,
    week: started ? Math.round((start.getTime() - startOf(crew.seasonStart).getTime()) / (7 * DAY_MS)) + 1 : 0,
    startsOn: crew.seasonStart,
    isAdmin: viewerId === admin,
    members: ordered.map((member) => ({
      user: toPublic(person.get(member.userId)!),
      rank: 1 + ordered.filter((other) => other.rating > member.rating).length,
      rating: member.rating,
      trend: member.trend,
      admin: member.userId === admin,
      paused: Boolean(paused.get(member.userId)?.includes(monday)),
      waiting: member.joinedAt >= start && started,
    })),
    match,
    lastMatch: latest ? toMatch(latest.week, lastRow, lastOpponent ? toPublic(lastOpponent) : null) : null,
    lastChampion: championRow ? toPublic(championRow) : null,
    pauses,
  };
}

export function crewRoutes(app: FastifyInstance, db: Db): void {
  app.get('/crew', async (request): Promise<CrewView | null> => {
    const user = await requireUser(db, request);
    const crew = await myCrew(db, user.id);
    if (!crew) return null;
    await settleCrew(db, crew.id);
    return crewView(db, (await myCrew(db, user.id))!, user.id);
  });

  app.post('/crew', STRICT, async (request, reply): Promise<CrewView> => {
    const user = await requireUser(db, request);
    const { name } = createCrewSchema.parse(request.body);
    const crew = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      await lockUser(tx, user.id);
      if (await myCrew(tx, user.id)) throw conflict('You’re already in a crew. Leave it first.');
      const [created] = await tx.insert(crews).values({ name, adminId: user.id, seasonStart: nextMonday(today()) }).returning();
      await addMember(tx, created!.id, user.id);
      // Your existing friends aren't signed up for a league. They join with your code.
      return created!;
    });
    reply.code(201);
    return crewView(db, crew, user.id);
  });

  // Knowing a code gets you into someone's crew, so guessing them is limited like a password.
  app.post('/crew/join', STRICT, async (request): Promise<CrewView> => {
    const user = await requireUser(db, request);
    const { inviteCode } = joinCrewSchema.parse(request.body);
    const [owner] = await db.select().from(users).where(eq(users.inviteCode, inviteCode.toUpperCase()));
    if (!owner) throw notFound('That invite code isn’t valid');
    const crew = await myCrew(db, owner.id);
    if (!crew) throw notFound('They aren’t in a crew yet');
    // Whatever you left has to be settled before you come back, or you wouldn't be in it.
    await settleCrew(db, crew.id);
    const joined = await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      await lockUser(tx, user.id);
      if (await myCrew(tx, user.id)) throw conflict('You’re already in a crew. Leave it first.');
      await lockUser(tx, crew.id);
      const members = await activeMembers(tx, crew.id);
      if (members.length >= MAX_MEMBERS) throw conflict('That crew is full');
      // Rejoining on Monday would take you out of the week you left, before it's had a chance to settle.
      const monday = mondayOf(today());
      const [before] = await tx.select().from(crewMembers).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, user.id)));
      if (before?.leftAt && !before.removedAt && before.leftAt < startOf(monday) && before.leftAt >= startOf(addDays(monday, -7)) && today() < addDays(monday, GRACE_DAYS)) {
        throw conflict('You walked out on last week’s match. You can come back tomorrow, once it’s settled.');
      }
      await addMember(tx, crew.id, user.id);
      const admin = adminOf(crew, members);
      if (admin) await notify(tx, admin, { title: 'New crew member', body: voice.crewJoined(user.displayName, crew.name), route: 'rankings' });
      return crew;
    });
    return crewView(db, joined, user.id);
  });

  app.patch('/crew', STRICT, async (request): Promise<CrewView> => {
    const user = await requireUser(db, request);
    const crew = await myCrew(db, user.id);
    if (!crew) throw notFound();
    if (adminOf(crew, await activeMembers(db, crew.id)) !== user.id) throw forbidden();
    const { name } = renameCrewSchema.parse(request.body);
    const [updated] = await db.update(crews).set({ name }).where(eq(crews.id, crew.id)).returning();
    return crewView(db, updated!, user.id);
  });

  app.post('/crew/leave', STRICT, async (request, reply) => {
    const user = await requireUser(db, request);
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      const crew = await myCrew(tx, user.id);
      if (!crew) throw notFound();
      await tx.update(crewMembers).set({ leftAt: new Date() }).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, user.id)));
      // Joining made them friends with everyone, so leaving undoes it. Whoever invited you stays a friend.
      const others = await activeMembers(tx, crew.id);
      const people = others.length ? await tx.select({ id: users.id, invitedBy: users.invitedBy }).from(users).where(inArray(users.id, others.map((member) => member.userId))) : [];
      for (const other of people) {
        if (other.invitedBy !== user.id && user.invitedBy !== other.id) await unfriend(tx, other.id, user.id);
      }
      if (crew.adminId === user.id) {
        const [next] = await activeMembers(tx, crew.id);
        await tx.update(crews).set({ adminId: next?.userId ?? null }).where(eq(crews.id, crew.id));
      }
    });
    reply.code(204);
  });

  app.delete<{ Params: { id: string } }>('/crew/members/:id', STRICT, async (request, reply) => {
    const user = await requireUser(db, request);
    if (!UUID.test(request.params.id)) throw notFound();
    const crew = await myCrew(db, user.id);
    if (!crew) throw notFound();
    const members = await activeMembers(db, crew.id);
    if (adminOf(crew, members) !== user.id) throw forbidden();
    if (request.params.id === user.id) throw badRequest('Use leave for that');
    if (!members.some((member) => member.userId === request.params.id)) throw notFound();
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      const now = new Date();
      await tx.update(crewMembers).set({ leftAt: now, removedAt: now }).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, request.params.id)));
      // Joining made them friends with everyone, so being removed has to undo it or they'd keep seeing every post.
      for (const member of members) if (member.userId !== request.params.id) await unfriend(tx, member.userId, request.params.id);
    });
    reply.code(204);
  });

  // No reason asked for. Nobody should have to explain an injury to get a pause.
  app.post('/crew/pause', STRICT, async (request, reply) => {
    const user = await requireUser(db, request);
    const { weeks } = requestPauseSchema.parse(request.body);
    const crew = await myCrew(db, user.id);
    if (!crew) throw badRequest('A pause needs a crew to approve it');
    const members = await activeMembers(db, crew.id);
    const others = members.filter((member) => member.userId !== user.id);
    if (!others.length) throw badRequest('A pause needs someone else in your crew to approve it');
    const mine = await db.select().from(streakPauses).where(and(eq(streakPauses.userId, user.id), inArray(streakPauses.status, ['pending', 'approved'])));
    const monday = mondayOf(dateIn(user.timeZone));
    if (mine.some((pause) => pause.status === 'pending' || (pause.fromWeek && addDays(pause.fromWeek, pause.weeks * 7) > monday))) throw conflict('You already have a pause');
    const [pause] = await db.insert(streakPauses).values({ userId: user.id, crewId: crew.id, weeks }).returning();
    const admin = adminOf(crew, members);
    const approver = admin && admin !== user.id ? admin : others[0]!.userId;
    await notify(db, approver, { title: 'Pause requested', body: voice.pauseAsked(user.displayName, weeks), route: 'rankings' });
    reply.code(201);
    return { id: pause!.id };
  });

  app.post<{ Params: { id: string; decision: string } }>('/crew/pauses/:id/:decision', STRICT, async (request, reply) => {
    const user = await requireUser(db, request);
    const { id, decision } = request.params;
    if (!UUID.test(id) || !['approve', 'decline'].includes(decision)) throw notFound();
    const crew = await myCrew(db, user.id);
    if (!crew) throw notFound();
    const [pause] = await db.select().from(streakPauses).where(and(eq(streakPauses.id, id), eq(streakPauses.crewId, crew.id)));
    if (!pause) throw notFound();
    const admin = adminOf(crew, await activeMembers(db, crew.id));
    if (pause.userId === user.id || !(user.id === admin || pause.userId === admin)) throw forbidden();
    const [owner] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, pause.userId));
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      const status = decision === 'approve' ? 'approved' as const : 'declined' as const;
      const [updated] = await tx.update(streakPauses)
        .set({ status, decidedBy: user.id, fromWeek: status === 'approved' ? mondayOf(dateIn(owner?.timeZone)) : null })
        .where(and(eq(streakPauses.id, id), eq(streakPauses.status, 'pending')))
        .returning();
      if (!updated) throw conflict('Someone already answered that');
      if (status === 'approved') {
        // Someone who can't lift shouldn't lose a call for not lifting.
        await tx.update(sandbagCalls)
          .set({ deadlineAt: sql`${sandbagCalls.deadlineAt} + make_interval(days => ${pause.weeks * 7})` })
          .where(and(eq(sandbagCalls.targetId, pause.userId), inArray(sandbagCalls.status, ['open', 'watching'])));
      }
      await notify(tx, pause.userId, { title: 'Streak pause', body: status === 'approved' ? voice.pauseApproved(pause.weeks) : voice.pauseDeclined(), route: 'rankings' });
    });
    reply.code(204);
  });
}
