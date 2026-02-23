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

    if (action === 'play') {
      let remainingMs: number;

      if (tournament.is_paused && tournament.paused_time_remaining !== undefined) {
        // Resume from pause — restore stored remaining time
        remainingMs = tournament.paused_time_remaining * 1000;
      } else if (!tournament.countdown_end) {
        // Fresh start — full 3 minutes
        remainingMs = FIGHT_DURATION_S * 1000;
      } else {
        // Already running — no-op, return current state
        const existingEnd = new Date(tournament.countdown_end).getTime();
        remainingMs = Math.max(0, existingEnd - now);
      }

      updatePayload = {
        countdown_end: new Date(now + remainingMs).toISOString(),
        is_paused: false,
        paused_time_remaining: Math.ceil(remainingMs / 1000),
      };
      responseState = 'running';
      timeRemainingS = Math.ceil(remainingMs / 1000);

    } else if (action === 'pause') {
      if (tournament.is_paused) {
        // Already paused — no-op
        responseState = 'paused';
        timeRemainingS = tournament.paused_time_remaining ?? FIGHT_DURATION_S;
      } else {
        // Snapshot current remaining time
        let remainingMs = FIGHT_DURATION_S * 1000;
        if (tournament.countdown_end) {
          const endTime = new Date(tournament.countdown_end).getTime();
          remainingMs = Math.max(0, endTime - now);
        }
        const remainingS = Math.ceil(remainingMs / 1000);

        updatePayload = {
          is_paused: true,
          paused_time_remaining: remainingS,
        };
        responseState = 'paused';
        timeRemainingS = remainingS;
      }

    } else {
      // reset — clear the clock back to 3:00, stopped state
      updatePayload = {
        countdown_end: null,
        is_paused: false,
        paused_time_remaining: FIGHT_DURATION_S,
      };
      responseState = 'stopped';
      timeRemainingS = FIGHT_DURATION_S;
    }

    if (Object.keys(updatePayload).length > 0) {
      await base44.asServiceRole.entities.Tournament.update(tournament.id, updatePayload);
    }

    console.log(`setFightState: action=${action} → state=${responseState}, time_remaining=${timeRemainingS}s`);

    return Response.json(
      { ok: true, state: responseState, time_remaining_s: timeRemainingS },
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
