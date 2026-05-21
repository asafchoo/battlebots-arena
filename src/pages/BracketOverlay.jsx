import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Skull, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function BracketOverlay() {
  const [glitchActive, setGlitchActive] = useState(false);
  const [showBracket, setShowBracket] = useState('winners'); // 'winners' or 'losers'
  const [showWinner, setShowWinner] = useState(false);
  const lastMatchTimestampRef = useRef(null);

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

  // Show winner overlay when last_match_result changes
  useEffect(() => {
    const lastResult = tournament?.last_match_result;
    if (!lastResult?.timestamp) return;
    if (lastResult.timestamp === lastMatchTimestampRef.current) return;
    lastMatchTimestampRef.current = lastResult.timestamp;
    setShowWinner(true);
    const timer = setTimeout(() => setShowWinner(false), 5000);
    return () => clearTimeout(timer);
  }, [tournament?.last_match_result?.timestamp]);

  // Glitch effect on match change
  useEffect(() => {
    if (tournament?.current_match) {
      setGlitchActive(true);
      const timer = setTimeout(() => setGlitchActive(false), 500);
      return () => clearTimeout(timer);
    }
  }, [tournament?.current_match?.match_number]);

  // Switch between winners and losers bracket every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setShowBracket(prev => prev === 'winners' ? 'losers' : 'winners');
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!tournament) {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-slate-800 flex items-center justify-center">
        <style>{`
          body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #1e293b !important; }
          html { overflow: hidden !important; background: #1e293b !important; }
          ::-webkit-scrollbar { display: none; }
        `}</style>
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
        
        <div className={`relative p-1.5 rounded-lg border backdrop-blur-md ${
          isActive 
            ? 'bg-cyan-900/90 border-cyan-300 shadow-lg shadow-cyan-500/40' 
            : isNext
              ? 'bg-yellow-900/85 border-yellow-400'
              : 'bg-slate-900/85 border-slate-500'
        }`}>
          {/* Match number badge */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1 py-0.5 bg-slate-700 text-slate-300 text-[9px] font-bold rounded z-10">
            #{match.match_number ?? ''}
          </div>
          {isActive && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-black rounded animate-pulse shadow-lg shadow-red-500/50 z-20">
              <Zap className="w-3 h-3" />
              LIVE
            </div>
          )}
          {isNext && !isActive && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-yellow-400 text-black text-[9px] font-black rounded animate-pulse shadow-lg shadow-yellow-400/50 z-20">
              NEXT
            </div>
          )}

          {/* Bot 1 */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${
            match.winner_id === match.bot1_id 
              ? 'bg-green-600/70 text-green-100 border border-green-400' 
              : match.winner_id 
                ? 'text-slate-400 line-through opacity-60' 
                : 'text-white bg-slate-700/60'
          }`}>
            {bot1?.image_url && (
              <img src={bot1.image_url} className="w-5 h-5 rounded object-cover flex-shrink-0" alt="" />
            )}
            <span className="truncate font-mono">{getBotName(match.bot1_id)}</span>
          </div>

          <div className="text-center text-[8px] text-cyan-400/70 font-mono my-0.5 font-bold">VS</div>

          {/* Bot 2 */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${
            match.winner_id === match.bot2_id 
              ? 'bg-green-600/70 text-green-100 border border-green-400' 
              : match.winner_id 
                ? 'text-slate-400 line-through opacity-60' 
                : 'text-white bg-slate-700/60'
          }`}>
            {bot2?.image_url && (
              <img src={bot2.image_url} className="w-5 h-5 rounded object-cover flex-shrink-0" alt="" />
            )}
            <span className="truncate font-mono">{getBotName(match.bot2_id)}</span>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={`fixed inset-0 w-screen h-screen overflow-hidden font-mono text-white ${
      glitchActive ? 'animate-pulse' : ''
    }`}>
      <style>{`
        body { 
          margin: 0 !important; 
          padding: 0 !important; 
          overflow: hidden !important;
          background: #000 !important;
        }
        html { 
          overflow: hidden !important;
          background: #000 !important;
        }
        ::-webkit-scrollbar { display: none; }
      `}</style>
      
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/696571612acba2d4bc583a5b/44d2fbb31_SponsorsABattlebot.png" 
          alt="Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/30" />
      </div>
      
      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,_rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] z-50" />

      {/* 16:9 scaled content container */}
      <div
        className="absolute inset-0 z-10 flex items-center justify-center"
        style={{ overflow: 'hidden' }}
      >
        <div
          style={{
            width: '1920px',
            height: '1080px',
            transform: `scale(${Math.min(window.innerWidth / 1920, window.innerHeight / 1080)})`,
            transformOrigin: 'center center',
            position: 'absolute',
            top: '50%',
            left: '50%',
            marginTop: '-540px',
            marginLeft: '-960px',
          }}
          className="flex flex-col gap-4 p-8 justify-center"
        >
        {/* Winners Bracket */}
        {showBracket === 'winners' && (() => {
          const rounds = Object.keys(winnersRounds).sort((a, b) => a - b);
          // Max matches in any round = determines slot height
          const maxMatches = Math.max(...rounds.map(r => winnersRounds[r].length));
          const ARENA_H = 880; // px within 1080 canvas
          const slotH = Math.floor(ARENA_H / maxMatches); // height per slot
          return (
            <div className="w-full" style={{ height: `${ARENA_H}px` }}>
              <div className="flex items-center gap-2 text-cyan-300 mb-3">
                <Trophy className="w-5 h-5" />
                <span className="tracking-widest font-bold text-sm">WINNERS BRACKET</span>
                <div className="flex-1 h-px bg-gradient-to-r from-cyan-400/70 to-transparent" />
              </div>
              <div className="flex gap-3 h-full">
                {rounds.map(round => {
                  const matches = winnersRounds[round].sort((a, b) => a.match_number - b.match_number);
                  const n = matches.length;
                  return (
                    <div key={`w-${round}`} className="flex flex-col flex-1">
                      <div className="text-[10px] text-cyan-400/70 text-center uppercase tracking-wider font-bold mb-2">
                        Round {round}
                      </div>
                      <div className="flex-1 relative">
                        {matches.map((match, i) => {
                          // Center each match within its equal-height slot
                          const topPct = ((i + 0.5) / n) * 100;
                          return (
                            <div
                              key={`w-${match.round}-${match.match_number}`}
                              style={{ position: 'absolute', top: `${topPct}%`, transform: 'translateY(-50%)', left: 0, right: 0 }}
                            >
                              <MatchSlot match={match} bracket="winners" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Losers Bracket */}
        {showBracket === 'losers' && losers_bracket.length > 0 && (() => {
          const rounds = Object.keys(losersRounds).sort((a, b) => a - b);
          // max matches in any round = R1 has 4
          const maxMatches = Math.max(...rounds.map(r => losersRounds[r].length));
          const SLOT_H = 180; // px per match slot at max density
          const HEADER_H = 40;
          const ARENA_H = maxMatches * SLOT_H;
          return (
            <div className="w-full flex flex-col" style={{ height: `${ARENA_H + HEADER_H}px` }}>
              <div className="flex items-center gap-2 text-red-300 mb-3 flex-shrink-0">
                <Skull className="w-5 h-5" />
                <span className="tracking-widest font-bold text-sm">LOSERS BRACKET</span>
                <div className="flex-1 h-px bg-gradient-to-r from-red-400/70 to-transparent" />
              </div>
              <div className="flex gap-3" style={{ height: `${ARENA_H}px` }}>
                {rounds.map(round => {
                  const matches = losersRounds[round].sort((a, b) => a.match_number - b.match_number);
                  const n = matches.length;
                  return (
                    <div key={`l-${round}`} className="flex flex-col flex-1">
                      <div className="text-[10px] text-red-400/70 text-center uppercase tracking-wider font-bold mb-2 flex-shrink-0">
                        Round {round}
                      </div>
                      <div className="relative flex-1">
                        {matches.map((match, i) => {
                          // each match centered in its equal slot within the column
                          const topPct = ((i + 0.5) / n) * 100;
                          return (
                            <div
                              key={`l-${match.round}-${match.match_number}`}
                              style={{ position: 'absolute', top: `${topPct}%`, transform: 'translateY(-50%)', left: 0, right: 0 }}
                            >
                              <MatchSlot match={match} bracket="losers" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Grand Finals */}
        {grand_finals && (grand_finals.bot1_id || grand_finals.bot2_id) && (
          <div className="space-y-2 flex flex-col items-center">
            <div className="flex items-center justify-center gap-2 text-yellow-300">
              <Trophy className="w-5 h-5" />
              <span className="tracking-widest font-bold text-sm">GRAND FINALS</span>
              <Trophy className="w-5 h-5" />
            </div>
            <div className="flex justify-center">
              <div className="w-48">
                <MatchSlot 
                  match={{ ...grand_finals, round: 0, match_number: 0 }} 
                  bracket="finals" 
                />
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Winner Announcement Overlay */}
      <AnimatePresence>
        {showWinner && tournament?.last_match_result?.winner_id && (() => {
          const winner = bots.find(b => b.id === tournament.last_match_result.winner_id);
          const loser = bots.find(b => b.id === (
            tournament.last_match_result.bot1_id === tournament.last_match_result.winner_id
              ? tournament.last_match_result.bot2_id
              : tournament.last_match_result.bot1_id
          ));
          return (
            <motion.div
              key="winner-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85"
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.1, opacity: 0 }}
                transition={{ duration: 0.5, type: 'spring' }}
                className="flex flex-col items-center gap-6 text-center px-8"
              >
                <motion.div
                  animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <Trophy className="w-24 h-24 text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]" />
                </motion.div>
                <div className="text-yellow-400 text-lg font-black tracking-[0.3em] uppercase">Winner</div>
                {winner?.image_url && (
                  <img src={winner.image_url} alt={winner.name} className="w-32 h-32 rounded-full object-cover border-4 border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.6)]" />
                )}
                <div className="text-white text-5xl font-black tracking-wider drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                  {winner?.name || '???'}
                </div>
                {loser && (
                  <div className="text-slate-400 text-xl font-semibold">
                    defeats <span className="text-red-400 line-through">{loser.name}</span>
                  </div>
                )}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Decorative corners */}
      <div className="fixed top-4 left-4 w-10 h-10 border-l-2 border-t-2 border-cyan-400/70 z-10" />
      <div className="fixed top-4 right-4 w-10 h-10 border-r-2 border-t-2 border-cyan-400/70 z-10" />
      <div className="fixed bottom-4 left-4 w-10 h-10 border-l-2 border-b-2 border-purple-400/70 z-10" />
      <div className="fixed bottom-4 right-4 w-10 h-10 border-r-2 border-b-2 border-purple-400/70 z-10" />
    </div>
  );
}