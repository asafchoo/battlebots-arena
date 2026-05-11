import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * POST /functions/setFightState
 * Called by ESP32 #1 to control the fight clock.
 *
 * Backwards compatible body:
 * { "action": "play" | "pause" | "reset" }
 *
 * Preferred ESP32 body:
 * {
 *   "action": "play" | "pause" | "reset",
 *   "remaining_ms": 180000,
 *   "elapsed_ms": 0,
 *   "controller_epoch_ms": 1760000000000,
 *   "countdown_end_ms": 1760000180000,
 *   "controller_millis": 123456,
 *   "sequence": 42
 * }
 */
const FIGHT_DURATION_S = 180;
const FIGHT_DURATION_MS = FIGHT_DURATION_S * 1000;

const PRESTART_DURATION_S = 5;
const PRESTART_DURATION_MS = PRESTART_DURATION_S * 1000;

const WEB_TOTAL_DURATION_MS = FIGHT_DURATION_MS + PRESTART_DURATION_MS;

const VALID_EPOCH_MS_MIN = 1700000000000; // 2023-11-14; protects against unsynced ESP32 time
const MAX_FUTURE_SLOP_MS = 60000;
const MAX_PAST_SLOP_MS = 10000;

type AnyRecord = Record<string, any>;

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampRemainingMs(value: unknown): number | null {
  const n = numberOrNull(value);
  if (n === null) return null;
  return Math.floor(clamp(n, 0, WEB_TOTAL_DURATION_MS));
}

function ceilSeconds(ms: number): number {
  return Math.ceil(clamp(ms, 0, WEB_TOTAL_DURATION_MS) / 1000);
}

function validControllerCountdownEndMs(value: unknown, serverNowMs: number): number | null {
  const n = numberOrNull(value);
  if (n === null) return null;

  const endMs = Math.floor(n);
  if (endMs < VALID_EPOCH_MS_MIN) return null;

  // Accept only timestamps that make sense for a 3-minute fight.
  // This prevents a bad ESP32 clock from poisoning the web timer.
  const minAllowed = serverNowMs - MAX_PAST_SLOP_MS;
  const maxAllowed = serverNowMs + WEB_TOTAL_DURATION_MS + MAX_FUTURE_SLOP_MS;  if (endMs < minAllowed || endMs > maxAllowed) return null;
  return endMs;
}

function getStoredPausedRemainingMs(tournament: AnyRecord): number | null {
  // Current schema stores paused_time_remaining in seconds.
  const seconds = numberOrNull(tournament.paused_time_remaining);
  if (seconds === null) return null;
  return clamp(seconds * 1000, 0, FIGHT_DURATION_MS);
}

function getCurrentRemainingFromCountdownEnd(tournament: AnyRecord, nowMs: number): number {
  if (!tournament.countdown_end) return FIGHT_DURATION_MS;
  const endTimeMs = new Date(tournament.countdown_end).getTime();
  if (!Number.isFinite(endTimeMs)) return FIGHT_DURATION_MS;
  return clamp(endTimeMs - nowMs, 0, FIGHT_DURATION_MS);
}

Deno.serve(async (req: any) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  }

  try {
    const body = await req.json();
    const action = String(body.action || '');

    if (!['play', 'pause', 'reset'].includes(action)) {
      return Response.json(
        { error: 'Invalid action. Must be: play, pause, or reset.' },
        { status: 400, headers }
      );
    }

    const base44 = createClientFromRequest(req);
    const tournaments = await base44.asServiceRole.entities.Tournament.list('-created_date', 1);
    const tournament = tournaments[0];

    if (!tournament) {
      return Response.json({ error: 'No active tournament found' }, { status: 404, headers });
    }

    const now = Date.now();
    const clientRemainingMs = clampRemainingMs(body.remaining_ms ?? body.remainingMs);
    const clientCountdownEndMs = validControllerCountdownEndMs(
      body.countdown_end_ms ?? body.countdownEndMs,
      now
    );

    let updatePayload: AnyRecord = {};
    let responseState: string = 'stopped';
    let timeRemainingS: number = 0;
    let syncTimeMs: number = 0;
    let responseCountdownEndMs: number | null = null;

    if (action === 'play') {
      // Case 1: match is over — awaiting winner selection, ignore green button
      if (tournament.current_match?.match_over === true) {
        console.log('setFightState: play ignored — match_over awaiting winner');
        return Response.json(
          { ok: false, reason: 'match_over_awaiting_winner', state: 'stopped', time_remaining_s: 0 },
          { headers }
        );
      }

      if (!tournament.current_match) {
        // Case 2: No current match — find next pending match and start it
        const allMatches = [
          ...(tournament.winners_bracket || []).map((m: AnyRecord) => ({ ...m, bracket: 'winners' })),
          ...(tournament.losers_bracket || []).map((m: AnyRecord) => ({ ...m, bracket: 'losers' })),
        ];

        const readyMatches = allMatches.filter((m: AnyRecord) =>
          m.status === 'pending' && m.bot1_id && m.bot2_id
        );

        let nextMatch: AnyRecord | null = readyMatches[0] || null;

        // Fall back to grand finals if no bracket matches are ready
        if (!nextMatch &&
            tournament.grand_finals?.bot1_id &&
            tournament.grand_finals?.bot2_id &&
            !tournament.grand_finals?.winner_id) {
          nextMatch = {
            bracket: 'finals',
            round: 0,
            match_number: 0,
            bot1_id: tournament.grand_finals.bot1_id,
            bot2_id: tournament.grand_finals.bot2_id,
          };
        }

        if (!nextMatch) {
          console.log('setFightState: play — no match available');
          return Response.json(
            { ok: false, reason: 'no_match_available', state: 'stopped', time_remaining_s: 0 },
            { headers }
          );
        }

        const remainingMs = clientRemainingMs ?? FIGHT_DURATION_MS;
        const countdownEndMs = clientCountdownEndMs ?? (now + remainingMs);
        syncTimeMs = clamp(countdownEndMs - now, 0, WEB_TOTAL_DURATION_MS);
        responseCountdownEndMs = countdownEndMs;

        // Mark the bracket match as in_progress
        if (nextMatch.bracket === 'winners') {
          updatePayload.winners_bracket = (tournament.winners_bracket || []).map((m: AnyRecord) => {
            if (m.round === nextMatch!.round && m.match_number === nextMatch!.match_number) {
              return { ...m, status: 'in_progress' };
            }
            return m;
          });
        } else if (nextMatch.bracket === 'losers') {
          updatePayload.losers_bracket = (tournament.losers_bracket || []).map((m: AnyRecord) => {
            if (m.round === nextMatch!.round && m.match_number === nextMatch!.match_number) {
              return { ...m, status: 'in_progress' };
            }
            return m;
          });
        } else if (nextMatch.bracket === 'finals') {
          updatePayload.grand_finals = { ...tournament.grand_finals, status: 'in_progress' };
        }

        updatePayload.current_match = {
          bracket: nextMatch.bracket,
          round: nextMatch.round,
          match_number: nextMatch.match_number,
          bot1_id: nextMatch.bot1_id,
          bot2_id: nextMatch.bot2_id,
          match_over: false,
        };
        updatePayload.countdown_end = new Date(countdownEndMs).toISOString();
        updatePayload.is_paused = false;
        updatePayload.paused_time_remaining = ceilSeconds(syncTimeMs);

        responseState = 'running';
        timeRemainingS = ceilSeconds(syncTimeMs);
      } else if (tournament.is_paused && tournament.paused_time_remaining !== undefined) {
        // Case 3: Resume from pause — prefer the ESP32 remaining_ms snapshot
        const storedRemainingMs = getStoredPausedRemainingMs(tournament) ?? FIGHT_DURATION_MS;
        const remainingMs = clientRemainingMs ?? storedRemainingMs;
        const countdownEndMs = clientCountdownEndMs ?? (now + remainingMs);
        syncTimeMs = clamp(countdownEndMs - now, 0, FIGHT_DURATION_MS);
        responseCountdownEndMs = countdownEndMs;

        updatePayload = {
           countdown_end: new Date(countdownEndMs).toISOString(),
          is_paused: false,
          paused_time_remaining: ceilSeconds(syncTimeMs),
          paused_time_remaining_ms: syncTimeMs,
        };

        responseState = 'running';
        timeRemainingS = ceilSeconds(syncTimeMs);
      } else {
        // Case 4: Already running — no-op, return current state
        const remainingMs = getCurrentRemainingFromCountdownEnd(tournament, now);
        syncTimeMs = remainingMs;
        responseCountdownEndMs = tournament.countdown_end ? new Date(tournament.countdown_end).getTime() : null;
        responseState = 'running';
        timeRemainingS = ceilSeconds(remainingMs);
      }
    } else if (action === 'pause') {
      if (tournament.is_paused) {
        // Already paused — no-op
        const remainingMs = getStoredPausedRemainingMs(tournament) ?? FIGHT_DURATION_MS;
        responseState = 'paused';
        syncTimeMs = remainingMs;
        timeRemainingS = ceilSeconds(remainingMs);
      } else {
        // Snapshot current remaining time. Prefer the ESP32 value because the HTTP
        // request may reach Base44 late.
        const remainingMs = clientRemainingMs ?? getCurrentRemainingFromCountdownEnd(tournament, now);
        syncTimeMs = remainingMs;

        updatePayload = {
         is_paused: true,
          paused_time_remaining: ceilSeconds(remainingMs),
          paused_time_remaining_ms: remainingMs,
        };

        responseState = 'paused';
        timeRemainingS = ceilSeconds(remainingMs);
      }
    } else {
      // reset — end the current match, set match_over: true, await winner selection
      if (!tournament.current_match) {
        // No match running — no-op
        responseState = 'stopped';
        timeRemainingS = 0;
        syncTimeMs = 0;
      } else {
        updatePayload = {
          countdown_end: null,
  is_paused: false,
  paused_time_remaining: 0,
  paused_time_remaining_ms: 0,
  current_match: {
    ...tournament.current_match,
    match_over: true },
        };

        responseState = 'stopped';
        timeRemainingS = 0;
        syncTimeMs = 0;
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      await base44.asServiceRole.entities.Tournament.update(tournament.id, updatePayload);
    }

    console.log(
      `setFightState: action=${action} state=${responseState} remaining=${timeRemainingS}s sync=${syncTimeMs}ms clientRemaining=${clientRemainingMs ?? 'none'} clientEnd=${clientCountdownEndMs ?? 'none'} seq=${body.sequence ?? 'none'}`
    );

    return Response.json(
      {
        ok: true,
        state: responseState,
        time_remaining_s: timeRemainingS,
        sync_time_ms: syncTimeMs,
        countdown_end_ms: responseCountdownEndMs,
      },
      { headers }
    );
  } catch (error) {
    console.error('Error in setFightState:', error);
    return Response.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : String(error) },
      { status: 500, headers }
    );
  }
});
