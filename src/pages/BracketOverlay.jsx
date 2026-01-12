import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Skull, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function BracketOverlay() {
  const [glitchActive, setGlitchActive] = useState(false);

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-created_date', 1),
    refetchInterval: 2000
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.Bot.list(),
    refetchInterval: 2000
  });

  const tournament = tournaments[0];

  // Glitch effect on match change
  useEffect(() => {
    if (tournament?.current_match) {
      setGlitchActive(true);
      const timer = setTimeout(() => setGlitchActive(false), 500);
      return () => clearTimeout(timer);
    }
  }, [tournament?.current_match?.match_number]);

  if (!tournament) {
    return (
      <div className="w-screen h-screen bg-transparent flex items-center justify-center" style={{ width: '1920px', height: '1080px' }}>
        <div className="text-cyan-500 text-3xl font-mono animate-pulse">
          AWAITING TOURNAMENT DATA...
        </div>
      </div>
    );
  }

  const { winners_bracket = [], losers_bracket = [], grand_finals, current_match } = tournament;

  const winnersRounds = {};
  winners_bracket.forEach(m => {
    if (!winnersRounds[m.round]) winnersRounds[m.round] = [];
    winnersRounds[m.round].push(m);
  });

  const losersRounds = {};
  losers_bracket.forEach(m => {
    if (!losersRounds[m.round]) losersRounds[m.round] = [];
    losersRounds[m.round].push(m);
  });

  const getBotName = (botId) => {
    const bot = bots.find(b => b.id === botId);
    return bot?.name || (botId ? "TBD" : "—");
  };

  const isMatchActive = (bracket, round, matchNum) => {
    return current_match?.bracket === bracket && 
           current_match?.round === round && 
           current_match?.match_number === matchNum;
  };

  const isMatchNext = (match, bracket) => {
    if (current_match) return false;
    const allPending = [...winners_bracket, ...losers_bracket]
      .filter(m => m.status === 'pending' && m.bot1_id && m.bot2_id);
    if (allPending.length > 0) {
      const first = allPending[0];
      const matchBracket = winners_bracket.includes(first) ? 'winners' : 'losers';
      return matchBracket === bracket && first.round === match.round && first.match_number === match.match_number;
    }
    return false;
  };

  const MatchSlot = ({ match, bracket }) => {
    const isActive = isMatchActive(bracket, match.round, match.match_number);
    const isNext = isMatchNext(match, bracket);
    const bot1 = bots.find(b => b.id === match.bot1_id);
    const bot2 = bots.find(b => b.id === match.bot2_id);

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative ${isActive || isNext ? 'z-10' : ''}`}
      >
        {/* Glow effect for active/next */}
        {(isActive || isNext) && (
          <div className={`absolute -inset-2 rounded-lg blur-md ${
            isActive ? 'bg-cyan-500/50' : 'bg-yellow-500/30'
          } animate-pulse`} />
        )}
        
        <div className={`relative p-2 rounded-lg border backdrop-blur-sm ${
          isActive 
            ? 'bg-cyan-950/90 border-cyan-400 shadow-lg shadow-cyan-500/30' 
            : isNext
              ? 'bg-yellow-950/80 border-yellow-500'
              : 'bg-slate-900/80 border-slate-700'
        }`}>
          {isActive && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 bg-cyan-500 text-black text-[10px] font-bold rounded">
              <Zap className="w-3 h-3" />
              LIVE
            </div>
          )}
          {isNext && !isActive && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-yellow-500 text-black text-[10px] font-bold rounded animate-pulse">
              NEXT
            </div>
          )}

          {/* Bot 1 */}
          <div className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
            match.winner_id === match.bot1_id 
              ? 'bg-green-900/50 text-green-400 border border-green-600' 
              : match.winner_id 
                ? 'text-slate-600 line-through' 
                : 'text-slate-300'
          }`}>
            {bot1?.image_url && (
              <img src={bot1.image_url} className="w-5 h-5 rounded object-cover" alt="" />
            )}
            <span className="truncate font-mono">{getBotName(match.bot1_id)}</span>
          </div>

          <div className="text-center text-[8px] text-cyan-600 font-mono my-0.5">VS</div>

          {/* Bot 2 */}
          <div className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
            match.winner_id === match.bot2_id 
              ? 'bg-green-900/50 text-green-400 border border-green-600' 
              : match.winner_id 
                ? 'text-slate-600 line-through' 
                : 'text-slate-300'
          }`}>
            {bot2?.image_url && (
              <img src={bot2.image_url} className="w-5 h-5 rounded object-cover" alt="" />
            )}
            <span className="truncate font-mono">{getBotName(match.bot2_id)}</span>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={`w-screen h-screen bg-transparent p-6 font-mono text-white overflow-hidden ${
      glitchActive ? 'animate-pulse' : ''
    }`} style={{ width: '1920px', height: '1080px' }}>
      {/* Scanline effect */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,_rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] z-50" />
      
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none opacity-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,cyan_1px,transparent_1px),linear-gradient(to_bottom,cyan_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Header */}
      <div className="text-center mb-4 relative">
        <h1 className="text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400">
          {tournament.name}
        </h1>
        <div className="text-sm text-cyan-600 tracking-[0.3em] uppercase mt-1">
          Double Elimination
        </div>
      </div>

      <div className="flex flex-col gap-4 h-full">
        {/* Winners Bracket */}
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2 text-cyan-400 text-base">
            <Trophy className="w-5 h-5" />
            <span className="tracking-widest font-bold">WINNERS BRACKET</span>
            <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/50 to-transparent" />
          </div>
          <div className="flex gap-6 overflow-x-auto pb-2 h-full">
            {Object.keys(winnersRounds).sort((a, b) => a - b).map(round => (
              <div key={`w-${round}`} className="flex flex-col gap-3 min-w-[180px]">
                <div className="text-xs text-slate-500 text-center uppercase tracking-wider font-semibold">
                  Round {round}
                </div>
                <div className="flex flex-col gap-3 justify-around flex-1">
                  {winnersRounds[round].sort((a, b) => a.match_number - b.match_number).map(match => (
                    <MatchSlot 
                      key={`w-${match.round}-${match.match_number}`} 
                      match={match} 
                      bracket="winners" 
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Losers Bracket */}
        {losers_bracket.length > 0 && (
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 text-red-400 text-base">
              <Skull className="w-5 h-5" />
              <span className="tracking-widest font-bold">LOSERS BRACKET</span>
              <div className="flex-1 h-px bg-gradient-to-r from-red-500/50 to-transparent" />
            </div>
            <div className="flex gap-6 overflow-x-auto pb-2 h-full">
              {Object.keys(losersRounds).sort((a, b) => a - b).map(round => (
                <div key={`l-${round}`} className="flex flex-col gap-3 min-w-[180px]">
                  <div className="text-xs text-slate-500 text-center uppercase tracking-wider font-semibold">
                    Round {round}
                  </div>
                  <div className="flex flex-col gap-3 justify-around flex-1">
                    {losersRounds[round].sort((a, b) => a.match_number - b.match_number).map(match => (
                      <MatchSlot 
                        key={`l-${match.round}-${match.match_number}`} 
                        match={match} 
                        bracket="losers" 
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grand Finals */}
        {grand_finals && (grand_finals.bot1_id || grand_finals.bot2_id) && (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-yellow-400 text-base">
              <Trophy className="w-6 h-6" />
              <span className="tracking-widest font-bold">GRAND FINALS</span>
              <Trophy className="w-6 h-6" />
            </div>
            <div className="flex justify-center">
              <div className="w-[220px]">
                <MatchSlot 
                  match={{ ...grand_finals, round: 0, match_number: 0 }} 
                  bracket="finals" 
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Decorative corners */}
      <div className="fixed top-6 left-6 w-12 h-12 border-l-2 border-t-2 border-cyan-500/50" />
      <div className="fixed top-6 right-6 w-12 h-12 border-r-2 border-t-2 border-cyan-500/50" />
      <div className="fixed bottom-6 left-6 w-12 h-12 border-l-2 border-b-2 border-cyan-500/50" />
      <div className="fixed bottom-6 right-6 w-12 h-12 border-r-2 border-b-2 border-cyan-500/50" />
    </div>
  );
}