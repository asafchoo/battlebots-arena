import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Zap } from "lucide-react";

export default function CountdownOverlay() {
  const [timeLeft, setTimeLeft] = useState(180);
  const [isUrgent, setIsUrgent] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-created_date', 1),
    refetchInterval: 1000
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.Bot.list()
  });

  const tournament = tournaments[0];

  // Transition to compact mode after 3 seconds
  useEffect(() => {
    if (tournament?.current_match) {
      setIsCompact(false);
      const timer = setTimeout(() => setIsCompact(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [tournament?.current_match?.match_number]);

  useEffect(() => {
    if (!tournament?.countdown_end) {
      setTimeLeft(180);
      return;
    }

    // Don't update timer if paused
    if (tournament.is_paused) {
      setTimeLeft(tournament.paused_time_remaining || 0);
      setIsUrgent(tournament.paused_time_remaining <= 30);
      return;
    }

    const updateTimer = () => {
      const end = new Date(tournament.countdown_end).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(diff);
      setIsUrgent(diff <= 30);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [tournament?.countdown_end, tournament?.is_paused, tournament?.paused_time_remaining]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const bot1 = bots.find(b => b.id === tournament?.current_match?.bot1_id);
  const bot2 = bots.find(b => b.id === tournament?.current_match?.bot2_id);

  if (!tournament?.current_match) {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-transparent flex items-center justify-center" style={{ width: '1920px', height: '1080px', margin: 0, padding: 0 }}>
        <style>{`
          body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: transparent !important; }
          html { overflow: hidden !important; background: transparent !important; }
          ::-webkit-scrollbar { display: none; }
        `}</style>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-cyan-500/50 text-3xl font-mono tracking-wider"
        >
          AWAITING NEXT MATCH...
        </motion.div>
      </div>
    );
  }

  const showJudgesView = timeLeft === 0 && !tournament.current_match.winner_id;
  const showWinnerView = timeLeft === 0 && tournament.current_match.winner_id;

  return (
    <motion.div 
      className="fixed font-mono overflow-hidden" 
      style={{ width: '1920px', height: '1080px', margin: 0 }}
      animate={{
        height: (isCompact && timeLeft > 0) ? '140px' : '1080px',
        top: 0
      }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <style>{`
        body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: transparent !important; }
        html { overflow: hidden !important; background: transparent !important; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
      
      {/* Scanline effect - only in full screen mode */}
      {(!isCompact || showJudgesView || showWinnerView) && (
        <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,_rgba(0,0,0,0.05)_50%)] bg-[length:100%_4px] z-50" />
      )}

      <AnimatePresence mode="wait">
        {showJudgesView || showWinnerView ? (
          // Judges decision / Winner view
          <motion.div
            key={`judges-${tournament.current_match.match_number}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center p-12"
          >
            <div className="relative w-full max-w-6xl">
              {/* Glow background */}
              <div className={`absolute inset-0 rounded-3xl blur-3xl ${
                showWinnerView ? 'bg-green-500/30' : 'bg-yellow-500/20'
              }`} />

              {/* Main container */}
              <div className={`relative rounded-2xl border-2 backdrop-blur-sm overflow-hidden ${
                showWinnerView 
                  ? 'border-green-500/80 bg-green-950/40' 
                  : 'border-yellow-500/50 bg-yellow-950/60'
              }`}>
                <div className={`h-1 ${
                  showWinnerView
                    ? 'bg-gradient-to-r from-transparent via-green-500 to-transparent'
                    : 'bg-gradient-to-r from-transparent via-yellow-500 to-transparent'
                }`} />

                <div className="p-12">
                  {/* Header */}
                  <div className="text-center mb-10">
                    <div className={`inline-flex items-center gap-2 px-6 py-2 rounded-full border text-sm tracking-widest uppercase font-bold ${
                      showWinnerView
                        ? 'border-green-500/50 text-green-400 bg-green-950/50'
                        : 'border-yellow-500/50 text-yellow-400 bg-yellow-950/50 animate-pulse'
                    }`}>
                      <Zap className="w-4 h-4" />
                      {showWinnerView ? 'MATCH COMPLETE' : 'AWAITING JUDGES DECISION'}
                    </div>
                  </div>

                  {/* Combatants */}
                  <div className="flex items-center justify-center gap-16">
                    {/* Bot 1 */}
                    <motion.div
                      animate={{ 
                        scale: showWinnerView && tournament.current_match.winner_id === bot1?.id ? 1.15 : showWinnerView ? 0.85 : 1,
                        opacity: showWinnerView && tournament.current_match.winner_id !== bot1?.id ? 0.4 : 1
                      }}
                      transition={{ duration: 0.5 }}
                      className="flex-1 text-center relative"
                    >
                      {showWinnerView && tournament.current_match.winner_id === bot1?.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-8 left-1/2 -translate-x-1/2 text-6xl"
                        >
                          🏆
                        </motion.div>
                      )}
                      {bot1?.image_url && (
                        <div className={`relative w-48 h-48 mx-auto mb-6 rounded-xl overflow-hidden border-2 ${
                          showWinnerView && tournament.current_match.winner_id === bot1?.id 
                            ? 'border-green-500 shadow-lg shadow-green-500/50' 
                            : 'border-cyan-500/30'
                        }`}>
                          <img 
                            src={bot1.image_url} 
                            alt={bot1.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        </div>
                      )}
                      <h2 className={`text-5xl font-black uppercase tracking-tight ${
                        showWinnerView && tournament.current_match.winner_id === bot1?.id 
                          ? 'text-green-400' 
                          : 'text-white'
                      }`}>
                        {bot1?.name || "TBD"}
                      </h2>
                      <p className="text-lg text-slate-500 mt-2">{bot1?.team_name}</p>
                    </motion.div>

                    {/* VS */}
                    <div className="flex-shrink-0">
                      <div className={`relative w-24 h-24 rounded-full flex items-center justify-center ${
                        showWinnerView
                          ? 'bg-green-900/50 border-2 border-green-500'
                          : 'bg-yellow-900/50 border-2 border-yellow-500'
                      }`}>
                        <Swords className={`w-12 h-12 ${showWinnerView ? 'text-green-400' : 'text-yellow-400'}`} />
                      </div>
                    </div>

                    {/* Bot 2 */}
                    <motion.div
                      animate={{ 
                        scale: showWinnerView && tournament.current_match.winner_id === bot2?.id ? 1.15 : showWinnerView ? 0.85 : 1,
                        opacity: showWinnerView && tournament.current_match.winner_id !== bot2?.id ? 0.4 : 1
                      }}
                      transition={{ duration: 0.5 }}
                      className="flex-1 text-center relative"
                    >
                      {showWinnerView && tournament.current_match.winner_id === bot2?.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-8 left-1/2 -translate-x-1/2 text-6xl"
                        >
                          🏆
                        </motion.div>
                      )}
                      {bot2?.image_url && (
                        <div className={`relative w-48 h-48 mx-auto mb-6 rounded-xl overflow-hidden border-2 ${
                          showWinnerView && tournament.current_match.winner_id === bot2?.id 
                            ? 'border-green-500 shadow-lg shadow-green-500/50' 
                            : 'border-purple-500/30'
                        }`}>
                          <img 
                            src={bot2.image_url} 
                            alt={bot2.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        </div>
                      )}
                      <h2 className={`text-5xl font-black uppercase tracking-tight ${
                        showWinnerView && tournament.current_match.winner_id === bot2?.id 
                          ? 'text-green-400' 
                          : 'text-white'
                      }`}>
                        {bot2?.name || "TBD"}
                      </h2>
                      <p className="text-lg text-slate-500 mt-2">{bot2?.team_name}</p>
                    </motion.div>
                  </div>

                  {/* Message */}
                  <div className="mt-12 text-center">
                    {showWinnerView ? (
                      <div className="text-7xl font-black text-green-400 animate-pulse">
                        WINNER!
                      </div>
                    ) : (
                      <div className="text-5xl font-black text-yellow-400">
                        TIME'S UP
                      </div>
                    )}
                  </div>
                </div>

                <div className={`h-1 ${
                  showWinnerView
                    ? 'bg-gradient-to-r from-transparent via-green-500 to-transparent'
                    : 'bg-gradient-to-r from-transparent via-yellow-500 to-transparent'
                }`} />
              </div>

              {/* Corner decorations */}
              <div className="absolute -top-3 -left-3 w-10 h-10 border-l-2 border-t-2 border-cyan-500" />
              <div className="absolute -top-3 -right-3 w-10 h-10 border-r-2 border-t-2 border-cyan-500" />
              <div className="absolute -bottom-3 -left-3 w-10 h-10 border-l-2 border-b-2 border-purple-500" />
              <div className="absolute -bottom-3 -right-3 w-10 h-10 border-r-2 border-b-2 border-purple-500" />
            </div>
          </motion.div>
        ) : !isCompact ? (
          // Full intro view
          <motion.div
            key={`intro-${tournament.current_match.match_number}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 flex items-center justify-center p-12"
          >
            <div className="relative w-full max-w-6xl"
        >
          {/* Glow background */}
          <div className={`absolute inset-0 rounded-3xl blur-3xl transition-colors duration-500 ${
            isUrgent ? 'bg-red-500/20' : 'bg-cyan-500/10'
          }`} />

          {/* Main container */}
          <div className={`relative rounded-2xl border-2 backdrop-blur-sm overflow-hidden transition-colors duration-500 ${
            isUrgent 
              ? 'border-red-500/80 bg-red-950/40' 
              : 'border-cyan-500/50 bg-slate-950/60'
          }`}>
            {/* Top decorative bar */}
            <div className={`h-1 transition-colors duration-500 ${
              isUrgent 
                ? 'bg-gradient-to-r from-transparent via-red-500 to-transparent' 
                : 'bg-gradient-to-r from-transparent via-cyan-500 to-transparent'
            }`} />

            <div className="p-12">
              {/* Header */}
              <div className="text-center mb-10">
                <div className={`inline-flex items-center gap-2 px-6 py-2 rounded-full border text-sm tracking-widest uppercase font-bold ${
                  isUrgent
                    ? 'border-red-500/50 text-red-400 bg-red-950/50'
                    : 'border-cyan-500/50 text-cyan-400 bg-cyan-950/50'
                }`}>
                  <Zap className={`w-4 h-4 ${isUrgent ? 'animate-pulse' : ''}`} />
                  {tournament.current_match.bracket === 'finals' ? 'GRAND FINALS' : 
                   tournament.current_match.bracket === 'losers' ? 'LOSERS BRACKET' : 'WINNERS BRACKET'}
                </div>
              </div>

              {/* Combatants */}
              <div className="flex items-center justify-center gap-16">
                {/* Bot 1 */}
                <motion.div
                  initial={{ x: -100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex-1 text-center"
                >
                  {bot1?.image_url && (
                    <div className="relative w-48 h-48 mx-auto mb-6 rounded-xl overflow-hidden border-2 border-cyan-500/30">
                      <img 
                        src={bot1.image_url} 
                        alt={bot1.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>
                  )}
                  <h2 className="text-5xl font-black text-white uppercase tracking-tight">
                    {bot1?.name || "TBD"}
                  </h2>
                  <p className="text-lg text-slate-500 mt-2">{bot1?.team_name}</p>
                </motion.div>

                {/* VS */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4, type: "spring" }}
                  className="flex-shrink-0"
                >
                  <div className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-colors duration-500 ${
                    isUrgent
                      ? 'bg-red-900/50 border-2 border-red-500'
                      : 'bg-cyan-900/50 border-2 border-cyan-500'
                  }`}>
                    <Swords className={`w-12 h-12 ${isUrgent ? 'text-red-400' : 'text-cyan-400'}`} />
                    {/* Rotating ring */}
                    <div className={`absolute inset-0 rounded-full border-2 border-dashed animate-spin ${
                      isUrgent ? 'border-red-500/30' : 'border-cyan-500/30'
                    }`} style={{ animationDuration: '10s' }} />
                  </div>
                </motion.div>

                {/* Bot 2 */}
                <motion.div
                  initial={{ x: 100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex-1 text-center"
                >
                  {bot2?.image_url && (
                    <div className="relative w-48 h-48 mx-auto mb-6 rounded-xl overflow-hidden border-2 border-purple-500/30">
                      <img 
                        src={bot2.image_url} 
                        alt={bot2.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>
                  )}
                  <h2 className="text-5xl font-black text-white uppercase tracking-tight">
                    {bot2?.name || "TBD"}
                  </h2>
                  <p className="text-lg text-slate-500 mt-2">{bot2?.team_name}</p>
                </motion.div>
              </div>

              {/* Countdown Timer */}
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-12 text-center"
              >
                <div className={`text-[140px] font-black tabular-nums transition-colors duration-500 leading-none ${
                  isUrgent 
                    ? 'text-red-500 animate-pulse' 
                    : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400'
                }`}>
                  {formatTime(timeLeft)}
                </div>
                <div className="text-base text-slate-500 tracking-[0.5em] uppercase mt-4 font-bold">
                  {timeLeft === 0 ? 'TIME!' : 'Remaining'}
                </div>
              </motion.div>
            </div>

            {/* Bottom decorative bar */}
            <div className={`h-1 transition-colors duration-500 ${
              isUrgent 
                ? 'bg-gradient-to-r from-transparent via-red-500 to-transparent' 
                : 'bg-gradient-to-r from-transparent via-purple-500 to-transparent'
            }`} />
          </div>

            {/* Corner decorations */}
            <div className="absolute -top-3 -left-3 w-10 h-10 border-l-2 border-t-2 border-cyan-500" />
            <div className="absolute -top-3 -right-3 w-10 h-10 border-r-2 border-t-2 border-cyan-500" />
            <div className="absolute -bottom-3 -left-3 w-10 h-10 border-l-2 border-b-2 border-purple-500" />
            <div className="absolute -bottom-3 -right-3 w-10 h-10 border-r-2 border-b-2 border-purple-500" />
          </div>
        </motion.div>
        ) : (
          // Compact strip view
          <motion.div
            key={`compact-${tournament.current_match.match_number}`}
            initial={{ opacity: 0, y: -140 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full h-[140px] flex items-center justify-between px-8 backdrop-blur-sm bg-slate-950/40 border-b-2 border-cyan-500/50"
          >
            {/* Bot 1 */}
            <div className="flex items-center gap-6 flex-1">
              {bot1?.image_url && (
                <img src={bot1.image_url} alt={bot1.name} className="w-24 h-24 rounded-lg object-cover border-2 border-cyan-500/50" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-bold text-white uppercase">{bot1?.name || "TBD"}</h3>
                  {tournament.current_match.bot1_unstuck && (
                    <span className="px-2 py-1 bg-yellow-500 text-black text-xs font-bold rounded">UNSTUCK</span>
                  )}
                </div>
                <p className="text-sm text-slate-400">{bot1?.team_name}</p>
              </div>
            </div>

            {/* VS & Timer */}
            <div className="flex items-center gap-8 flex-shrink-0">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                isUrgent ? 'bg-red-900/50 border-2 border-red-500' : 'bg-cyan-900/50 border-2 border-cyan-500'
              }`}>
                <Swords className={`w-8 h-8 ${isUrgent ? 'text-red-400' : 'text-cyan-400'}`} />
              </div>
              <div className={`text-7xl font-black tabular-nums ${
                isUrgent ? 'text-red-500 animate-pulse' : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400'
              }`}>
                {formatTime(timeLeft)}
              </div>
            </div>

            {/* Bot 2 */}
            <div className="flex items-center gap-6 flex-1 justify-end">
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {tournament.current_match.bot2_unstuck && (
                    <span className="px-2 py-1 bg-yellow-500 text-black text-xs font-bold rounded">UNSTUCK</span>
                  )}
                  <h3 className="text-2xl font-bold text-white uppercase">{bot2?.name || "TBD"}</h3>
                </div>
                <p className="text-sm text-slate-400">{bot2?.team_name}</p>
              </div>
              {bot2?.image_url && (
                <img src={bot2.image_url} alt={bot2.name} className="w-24 h-24 rounded-lg object-cover border-2 border-purple-500/50" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}