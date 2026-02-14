import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GET /functions/getFightState
 * Returns current fight state for ESP32 polling
 * 
 * Response format:
 * {
 *   "state": "stopped|running|paused",
 *   "elapsed_ms": 0,
 *   "match_id": "winners-R1-M1",
 *   "duration_ms": 240000
 * }
 */

Deno.serve(async (req) => {
  // Set CORS headers for local network access
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const base44 = createClientFromRequest(req);
    
    // Get latest tournament (using service role to bypass auth for ESP32)
    const tournaments = await base44.asServiceRole.entities.Tournament.list('-created_date', 1);
    const tournament = tournaments[0];

    // No active tournament or match
    if (!tournament || !tournament.current_match) {
      return Response.json({
        state: "stopped",
        elapsed_ms: 0,
        match_id: null,
        duration_ms: 240000
      }, { headers });
    }

    const { current_match, countdown_end, is_paused, paused_time_remaining } = tournament;
    const matchId = `${current_match.bracket}-R${current_match.round}-M${current_match.match_number}`;

    let state, elapsed_ms;

    if (is_paused) {
      // Paused state - elapsed time is frozen
      // elapsed = total duration - remaining time when paused
      state = "paused";
      elapsed_ms = Math.floor(240000 - (paused_time_remaining * 1000));
    } else {
      // Running state - calculate elapsed from countdown_end
      const endTime = new Date(countdown_end).getTime();
      const now = Date.now();
      const remaining_ms = Math.max(0, endTime - now);
      elapsed_ms = Math.floor(240000 - remaining_ms);
      
      // Check if time is up
      if (remaining_ms <= 0) {
        state = "stopped";
        elapsed_ms = 240000; // Fight ended at full duration
      } else {
        state = "running";
      }
    }

    return Response.json({
      state,
      elapsed_ms,
      match_id: matchId,
      duration_ms: 240000
    }, { headers });

  } catch (error) {
    console.error('Error in getFightState:', error);
    return Response.json({
      error: 'Internal server error',
      message: error.message
    }, { 
      status: 500, 
      headers 
    });
  }
});