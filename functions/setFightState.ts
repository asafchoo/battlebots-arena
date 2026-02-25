import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * POST /functions/setFightState
 * Called by ESP32 #1 to control the fight clock.
 *
 * Request body:
 *   { "action": "play" | "pause" | "reset" }
 *
 * Response:
 *   { "ok": true, "state": "running|paused|stopped", "time_remaining_s": <number> }
 *
 * play action — 4 cases:
 *   1. current_match.match_over === true → ignore (awaiting winner selection)
 *   2. !current_match → find next pending match, set it, start clock
 *   3. is_paused === true → resume from pause
 *   4. already running → no-op
 *
 * reset action — ends the current match (sets match_over: true), does NOT clear current_match
 */

const FIGHT_DURATION_S = 180; // 3 minutes

Deno.serve(async (req) => {
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
    const { action } = body;

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
    let updatePayload: Record<string, unknown> = {};
    let responseState: string;
    let timeRemainingS: number;
    let syncTimeMs: number;

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
          ...(tournament.winners_bracket || []).map((m: Record<string, unknown>) => ({ ...m, bracket: 'winners' })),
          ...(tournament.losers_bracket || []).map((m: Record<string, unknown>) => ({ ...m, bracket: 'losers' })),
        ];

        const readyMatches = allMatches.filter((m: Record<string, unknown>) =>
          m.status === 'pending' && m.bot1_id && m.bot2_id
        );

        let nextMatch: Record<string, unknown> | null = readyMatches[0] || null;

        // Fall back to grand finals if no bracket matches are ready
        if (!nextMatch && tournament.grand_finals?.bot1_id && tournament.grand_finals?.bot2_id &&
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

        const remainingMs = FIGHT_DURATION_S * 1000;
        syncTimeMs = remainingMs;

        // Mark the bracket match as in_progress
        if (nextMatch.bracket === 'winners') {
          updatePayload.winners_bracket = (tournament.winners_bracket || []).map((m: Record<string, unknown>) => {
            if (m.round === nextMatch!.round && m.match_number === nextMatch!.match_number) {
              return { ...m, status: 'in_progress' };
            }
            return m;
          });
        } else if (nextMatch.bracket === 'losers') {
          updatePayload.losers_bracket = (tournament.losers_bracket || []).map((m: Record<string, unknown>) => {
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
        updatePayload.countdown_end = new Date(now + remainingMs).toISOString();
        updatePayload.is_paused = false;
        updatePayload.paused_time_remaining = FIGHT_DURATION_S;

        responseState = 'running';
        timeRemainingS = FIGHT_DURATION_S;

      } else if (tournament.is_paused && tournament.paused_time_remaining !== undefined) {
        // Case 3: Resume from pause — restore stored remaining time
        const remainingMs = tournament.paused_time_remaining * 1000;
        syncTimeMs = remainingMs;
        updatePayload = {
          countdown_end: new Date(now + remainingMs).toISOString(),
          is_paused: false,
          paused_time_remaining: tournament.paused_time_remaining,
        };
        responseState = 'running';
        timeRemainingS = tournament.paused_time_remaining;

      } else {
        // Case 4: Already running — no-op, return current state
        const existingEnd = new Date(tournament.countdown_end).getTime();
        const remainingMs = Math.max(0, existingEnd - now);
        syncTimeMs = remainingMs;
        responseState = 'running';
        timeRemainingS = Math.floor(remainingMs / 1000);
      }

    } else if (action === 'pause') {
      if (tournament.is_paused) {
        // Already paused — no-op
        responseState = 'paused';
        timeRemainingS = tournament.paused_time_remaining ?? FIGHT_DURATION_S;
        syncTimeMs = timeRemainingS * 1000;
      } else {
        // Snapshot current remaining time
        let remainingMs = FIGHT_DURATION_S * 1000;
        if (tournament.countdown_end) {
          const endTime = new Date(tournament.countdown_end).getTime();
          remainingMs = Math.max(0, endTime - now);
        }
        const remainingS = Math.floor(remainingMs / 1000);
        syncTimeMs = remainingMs;

        updatePayload = {
          is_paused: true,
          paused_time_remaining: remainingS,
        };
        responseState = 'paused';
        timeRemainingS = remainingS;
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
          current_match: { ...tournament.current_match, match_over: true },
        };
        responseState = 'stopped';
        timeRemainingS = 0;
        syncTimeMs = 0;
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      await base44.asServiceRole.entities.Tournament.update(tournament.id, updatePayload);
    }

    console.log(`setFightState: action=${action} → state=${responseState}, time_remaining=${timeRemainingS}s`);

    return Response.json(
      { ok: true, state: responseState, time_remaining_s: timeRemainingS, sync_time_ms: syncTimeMs },
      { headers }
    );

  } catch (error) {
    console.error('Error in setFightState:', error);
    return Response.json(
      { error: 'Internal server error', message: error.message },
      { status: 500, headers }
    );
  }
});