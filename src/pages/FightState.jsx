import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function FightState() {
  const [state, setState] = useState({
    state: "stopped",
    elapsed_ms: 0,
    match_id: null,
    duration_ms: 240000
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-created_date', 1),
    refetchInterval: 100 // Poll frequently for ESP32
  });

  useEffect(() => {
    const tournament = tournaments[0];
    
    if (!tournament?.current_match) {
      setState({
        state: "stopped",
        elapsed_ms: 0,
        match_id: null,
        duration_ms: 240000
      });
      return;
    }

    const { current_match, countdown_end, is_paused, paused_time_remaining } = tournament;
    const matchId = `${current_match.bracket}-R${current_match.round}-M${current_match.match_number}`;

    if (is_paused) {
      // When paused, elapsed = total duration - remaining time
      const elapsed = 240000 - (paused_time_remaining * 1000);
      setState({
        state: "paused",
        elapsed_ms: elapsed,
        match_id: matchId,
        duration_ms: 240000
      });
    } else {
      // Running - calculate elapsed from countdown_end
      const end = new Date(countdown_end).getTime();
      const now = Date.now();
      const remaining = Math.max(0, end - now);
      const elapsed = 240000 - remaining;
      
      setState({
        state: remaining > 0 ? "running" : "stopped",
        elapsed_ms: Math.floor(elapsed),
        match_id: matchId,
        duration_ms: 240000
      });
    }
  }, [tournaments]);

  // Return JSON response
  return (
    <pre style={{
      margin: 0,
      padding: 0,
      fontFamily: 'monospace',
      fontSize: '12px',
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word'
    }}>
      {JSON.stringify(state, null, 2)}
    </pre>
  );
}