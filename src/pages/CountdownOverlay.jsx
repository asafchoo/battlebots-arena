import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Zap, Trophy } from "lucide-react";

export default function CountdownOverlay() {
  const [timeLeft, setTimeLeft] = useState(180);
  const [isUrgent, setIsUrgent] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [blinkVisible, setBlinkVisible] = useState(true);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const { data: tournaments = [] } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-created_date', 1),
    refetchInterval: 100
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.Bot.list()
  });

  const tournament = tournaments[0];

  useEffect(() => {
    const syncServerClock = async () => {
      try {
        const before = Date.now();
        const res = await fetch('/functions/getServerTime', { cache: 'no-store' });
        const data = await res.json();
        const after = Date.now();
        if (data.server_time_ms) {
          const roundTrip = after - before;
          const estimatedServerNow = data.server_time_ms + roundTrip / 2;
          setServerOffsetMs(estimatedServerNow - after);
        }
      } catch (err) {
        console.error('Server clock sync error:', err);
      }
    };
    syncServerClock();
    const interval = setInterval(syncServerClock, 10000);
    return () => clearInterval(interval);
  }, []);

  // Blink when paused
  useEffect(() => {
    if (!tournament?.is_paused) { setBlinkVisible(true); return; }
    const interval = setInterval(() => setBlinkVisible(v => !v), 500);
    return () => clearInterval(interval);
  }, [tournament?.is_paused]);

  // Transition to compact after 3s
  useEffect(() => {
    if (tournament?.current_match && !tournament.current_match.match_over) {
      setIsCompact(false);
      const timer = setTimeout(() => setIsCompact(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [tournament?.current_match?.match_number, tournament?.current_match?.match_over]);

  // Timer logic
  useEffect(() => {
    if (tournament?.current_match?.match_over) { setTimeLeft(0); setIsUrgent(false); return; }
    if (!tournament?.countdown_end && !tournament?.current_match?.match_over) { setTimeLeft(180); return; }
    if (tournament.is_paused) {
      if (tournament.paused_time_remaining !== undefined) {
        setTimeLeft(tournament.paused_time_remaining);
        setIsUrgent(tournament.paused_time_remaining <= 30);
      }
      return;
    }
    const updateTimer = () => {
      const end = new Date(tournament.countdown_end).getTime();
      const now = Date.now() + serverOffsetMs;
      const diff = Math.max(0, Math.ceil((end - now) / 1000));
      setTimeLeft(diff);
      setIsUrgent(diff <= 30);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [tournament?.countdown_end, tournament?.is_paused, tournament?.paused_time_remaining, tournament?.id, tournament?.current_match?.match_over]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const showLastResult = tournament?.last_match_result &&
    new Date().getTime() - new Date(tournament.last_match_result.timestamp).getTime() < 25000;

  const bot1 = bots.find(b => b.id === (tournament?.current_match?.bot1_id || tournament?.last_match_result?.bot1_id));
  const bot2 = bots.find(b => b.id === (tournament?.current_match?.bot2_id || tournament?.last_match_result?.bot2_id));

  const currentWinnerId = tournament?.current_match?.winner_id;
  const lastResultWinnerId = showLastResult ? tournament?.last_match_result?.winner_id : null;
  const winnerId = currentWinnerId || lastResultWinnerId || null;

  const matchIsOver = tournament?.current_match?.match_over === true ||
    (!tournament?.countdown_end && !tournament?.is_paused && tournament?.current_match && !currentWinnerId);
  const showJudgesView = matchIsOver && !winnerId;
  const showWinnerView = !!winnerId;

  const BG_IMAGE = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/696571612acba2d4bc583a5b/44d2fbb31_SponsorsABattlebot.png";

  const commonStyle = { width: '1920px', height: '1080px', margin: 0 };
  const sharedStyles = `
    body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: transparent !important; }
    html { overflow: hidden !important; background: transparent !important; }
    ::-webkit-scrollbar { display: none; }
  `;

  if (!tournament?.current_match && !showLastResult) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={commonStyle}>
        <style>{sharedStyles}</style>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-cyan-500/50 text-3xl font-mono tracking-wider">
          AWAITING NEXT MATCH...
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      className="fixed font-mono overflow-hidden"
      style={commonStyle}
      animate={{ height: (isCompact && !showJudgesView && !showWinnerView) ? '140px' : '1080px', top: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <style>{sharedStyles}</style>

      {/* Scanline */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,_rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] z-50" />

      <AnimatePresence mode="wait">

        {/* ── WINNER VIEW ── */}
        {showWinnerView ? (() => {
          const winner = bots.find(b => b.id === winnerId);
          const loser = bots.find(b => b.id === (bot1?.id === winnerId ? bot2?.id : bot1?.id));
          return (
            <motion.div
              key="winner-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85"
              style={commonStyle}
            >
              {/* Background */}
              <div className="fixed inset-0 z-0">
                <img src={BG_IMAGE} alt="" className="w-full h-full object-cover opacity-20" />
              </div>
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.1, opacity: 0 }}
                transition={{ duration: 0.5, type: 'spring' }}
                className="relative z-10 flex flex-col items-center gap-6 text-center px-8"
              >
                <motion.div
                  animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <Trophy className="w-32 h-32 text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,0.9)]" />
                </motion.div>
                <div className="text-yellow-400 text-2xl font-black tracking-[0.4em] uppercase">Winner</div>
                {winner?.image_url && (
                  <img
                    src={winner.image_url}
                    alt={winner.name}
                    className="w-[512px] h-[512px] rounded-full object-cover border-4 border-yellow-400 shadow-[0_0_60px_rgba(250,204,21,0.7)]"
                  />
                )}
                <div className="text-white text-8xl font-black tracking-wider drop-shadow-[0_0_30px_rgba(255,255,255,0.6)]">
                  {winner?.name || '???'}
                </div>
                {loser && (
                  <div className="text-slate-400 text-3xl font-semibold">
                    defeats <span className="text-red-400 line-through">{loser.name}</span>
                  </div>
                )}
              </motion.div>
              {/* Corners */}
              <div className="fixed top-6 left-6 w-12 h-12 border-l-2 border-t-2 border-cyan-400/70 z-10" />
              <div className="fixed top-6 right-6 w-12 h-12 border-r-2 border-t-2 border-cyan-400/70 z-10" />
              <div className="fixed bottom-6 left-6 w-12 h-12 border-l-2 border-b-2 border-purple-400/70 z-10" />
              <div className="fixed bottom-6 right-6 w-12 h-12 border-r-2 border-b-2 border-purple-400/70 z-10" />
            </motion.div>
          );
        })() : null}

        {/* ── JUDGES VIEW ── */}
        {showJudgesView && !showWinnerView ? (
          <motion.div
            key="judges-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85"
            style={commonStyle}
          >
            {/* Background */}
            <div className="fixed inset-0 z-0">
              <img src={BG_IMAGE} alt="" className="w-full h-full object-cover opacity-20" />
            </div>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, type: 'spring' }}
              className="relative z-10 flex flex-col items-center gap-10 text-center px-8"
            >
              {/* Pulsing label */}
              <motion.div
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="flex items-center gap-3 px-8 py-3 rounded-full border border-yellow-500/60 bg-yellow-950/60 text-yellow-400 text-xl font-black tracking-[0.3em] uppercase"
              >
                <Zap className="w-6 h-6" />
                AWAITING JUDGES DECISION
              </motion.div>

              {/* Combatants */}
              <div className="flex items-center gap-24">
                {/* Bot 1 */}
                <div className="flex flex-col items-center gap-4">
                  {bot1?.image_url && (
                    <img
                      src={bot1.image_url}
                      alt={bot1.name}
                      className="w-[448px] h-[448px] rounded-full object-cover border-4 border-cyan-500/60 shadow-[0_0_40px_rgba(6,182,212,0.4)]"
                    />
                  )}
                  <div className="text-white text-4xl font-black tracking-wider">{bot1?.name || 'TBD'}</div>
                  <div className="text-slate-400 text-lg">{bot1?.team_name}</div>
                </div>

                {/* VS */}
                <div className="w-20 h-20 rounded-full bg-yellow-900/50 border-2 border-yellow-500 flex items-center justify-center">
                  <Swords className="w-10 h-10 text-yellow-400" />
                </div>

                {/* Bot 2 */}
                <div className="flex flex-col items-center gap-4">
                  {bot2?.image_url && (
                    <img
                      src={bot2.image_url}
                      alt={bot2.name}
                      className="w-48 h-48 rounded-full object-cover border-4 border-purple-500/60 shadow-[0_0_40px_rgba(168,85,247,0.4)]"
                    />
                  )}
                  <div className="text-white text-4xl font-black tracking-wider">{bot2?.name || 'TBD'}</div>
                  <div className="text-slate-400 text-lg">{bot2?.team_name}</div>
                </div>
              </div>
            </motion.div>
            {/* Corners */}
            <div className="fixed top-6 left-6 w-12 h-12 border-l-2 border-t-2 border-cyan-400/70 z-10" />
            <div className="fixed top-6 right-6 w-12 h-12 border-r-2 border-t-2 border-cyan-400/70 z-10" />
            <div className="fixed bottom-6 left-6 w-12 h-12 border-l-2 border-b-2 border-purple-400/70 z-10" />
            <div className="fixed bottom-6 right-6 w-12 h-12 border-r-2 border-b-2 border-purple-400/70 z-10" />
          </motion.div>
        ) : null}

        {/* ── COMPACT STRIP ── */}
        {isCompact && !showJudgesView && !showWinnerView ? (
          <motion.div
            key={`compact-${tournament.current_match.match_number}`}
            initial={{ opacity: 0, y: -140 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full h-[140px] flex items-center justify-between px-8 backdrop-blur-sm bg-black/60 border-b-2 border-cyan-500/50"
          >
            {/* Background strip */}
            <div className="absolute inset-0 z-0">
              <img src={BG_IMAGE} alt="" className="w-full h-full object-cover opacity-10" />
            </div>

            {/* Bot 1 */}
            <div className="relative z-10 flex items-center gap-4 flex-1">
              {bot1?.image_url && (
                <img src={bot1.image_url} alt={bot1.name} className="w-48 h-48 rounded-full object-cover border-2 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.5)]" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-white uppercase tracking-wider">{bot1?.name || "TBD"}</h3>
                  {tournament.current_match.bot1_unstuck && (
                    <span className="px-2 py-0.5 bg-yellow-500 text-black text-xs font-bold rounded">UNSTUCK</span>
                  )}
                </div>
                <p className="text-sm text-slate-400">{bot1?.team_name}</p>
              </div>
            </div>

            {/* Timer */}
            <div className="relative z-10 flex items-center gap-6 flex-shrink-0">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                isUrgent ? 'bg-red-900/70 border-2 border-red-500' : 'bg-cyan-900/70 border-2 border-cyan-500'
              }`}>
                <Swords className={`w-7 h-7 ${isUrgent ? 'text-red-400' : 'text-cyan-400'}`} />
              </div>
              <div
                className={`text-7xl font-black tabular-nums drop-shadow-[0_0_15px_rgba(6,182,212,0.6)] ${
                  isUrgent ? 'text-red-500' : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400'
                }`}
                style={{ opacity: blinkVisible ? 1 : 0, transition: 'opacity 0.05s' }}
              >
                {formatTime(timeLeft)}
              </div>
            </div>

            {/* Bot 2 */}
            <div className="relative z-10 flex items-center gap-4 flex-1 justify-end">
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {tournament.current_match.bot2_unstuck && (
                    <span className="px-2 py-0.5 bg-yellow-500 text-black text-xs font-bold rounded">UNSTUCK</span>
                  )}
                  <h3 className="text-2xl font-black text-white uppercase tracking-wider">{bot2?.name || "TBD"}</h3>
                </div>
                <p className="text-sm text-slate-400">{bot2?.team_name}</p>
              </div>
              {bot2?.image_url && (
                <img src={bot2.image_url} alt={bot2.name} className="w-48 h-48 rounded-full object-cover border-2 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.5)]" />
              )}
            </div>
          </motion.div>
        ) : null}

        {/* ── FULL INTRO VIEW ── */}
        {!isCompact && !showJudgesView && !showWinnerView ? (
          <motion.div
            key={`intro-${tournament.current_match.match_number}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center"
            style={commonStyle}
          >
            {/* Background */}
            <div className="fixed inset-0 z-0">
              <img src={BG_IMAGE} alt="" className="w-full h-full object-cover opacity-25" />
              <div className="absolute inset-0 bg-black/60" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-10 text-center px-12 w-full max-w-5xl">
              {/* Bracket label */}
              <motion.div
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className={`flex items-center gap-2 px-6 py-2 rounded-full border text-sm tracking-widest uppercase font-bold ${
                  isUrgent
                    ? 'border-red-500/60 text-red-400 bg-red-950/60'
                    : 'border-cyan-500/60 text-cyan-400 bg-cyan-950/60'
                }`}
              >
                <Zap className={`w-4 h-4 ${isUrgent ? 'animate-pulse' : ''}`} />
                {tournament.current_match.bracket === 'finals' ? 'GRAND FINALS' :
                 tournament.current_match.bracket === 'losers' ? 'LOSERS BRACKET' : 'WINNERS BRACKET'}
              </motion.div>

              {/* Combatants */}
              <div className="flex items-center justify-center gap-20 w-full">
                {/* Bot 1 */}
                <motion.div
                  initial={{ x: -120, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="flex flex-col items-center gap-4 flex-1"
                >
                  {bot1?.image_url && (
                    <img
                      src={bot1.image_url}
                      alt={bot1.name}
                      className="w-[512px] h-[512px] rounded-full object-cover border-4 border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.6)]"
                    />
                  )}
                  <div className="text-white text-5xl font-black uppercase tracking-tight drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                    {bot1?.name || "TBD"}
                  </div>
                  <div className="text-slate-400 text-lg">{bot1?.team_name}</div>
                  {tournament.current_match.bot1_unstuck && (
                    <span className="px-3 py-1 bg-yellow-500 text-black text-sm font-bold rounded">UNSTUCK</span>
                  )}
                </motion.div>

                {/* VS */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4, type: 'spring' }}
                  className="flex-shrink-0"
                >
                  <div className={`relative w-28 h-28 rounded-full flex items-center justify-center ${
                    isUrgent ? 'bg-red-900/70 border-2 border-red-500' : 'bg-cyan-900/70 border-2 border-cyan-500'
                  }`}>
                    <Swords className={`w-14 h-14 ${isUrgent ? 'text-red-400' : 'text-cyan-400'}`} />
                    <div className={`absolute inset-0 rounded-full border-2 border-dashed animate-spin ${
                      isUrgent ? 'border-red-500/30' : 'border-cyan-500/30'
                    }`} style={{ animationDuration: '10s' }} />
                  </div>
                </motion.div>

                {/* Bot 2 */}
                <motion.div
                  initial={{ x: 120, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="flex flex-col items-center gap-4 flex-1"
                >
                  {bot2?.image_url && (
                    <img
                      src={bot2.image_url}
                      alt={bot2.name}
                      className="w-[512px] h-[512px] rounded-full object-cover border-4 border-purple-400 shadow-[0_0_50px_rgba(168,85,247,0.6)]"
                    />
                  )}
                  <div className="text-white text-5xl font-black uppercase tracking-tight drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                    {bot2?.name || "TBD"}
                  </div>
                  <div className="text-slate-400 text-lg">{bot2?.team_name}</div>
                  {tournament.current_match.bot2_unstuck && (
                    <span className="px-3 py-1 bg-yellow-500 text-black text-sm font-bold rounded">UNSTUCK</span>
                  )}
                </motion.div>
              </div>

              {/* Countdown */}
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-center"
              >
                <div
                  className={`text-[150px] font-black tabular-nums leading-none ${
                    isUrgent
                      ? 'text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.8)]'
                      : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400'
                  }`}
                  style={{ opacity: blinkVisible ? 1 : 0, transition: 'opacity 0.05s' }}
                >
                  {formatTime(timeLeft)}
                </div>
                <div className="text-base text-slate-500 tracking-[0.5em] uppercase mt-2 font-bold">
                  {tournament?.is_paused ? 'PAUSED' : timeLeft === 0 ? 'TIME!' : 'Remaining'}
                </div>
              </motion.div>
            </div>

            {/* Corners */}
            <div className="fixed top-6 left-6 w-12 h-12 border-l-2 border-t-2 border-cyan-400/70 z-10" />
            <div className="fixed top-6 right-6 w-12 h-12 border-r-2 border-t-2 border-cyan-400/70 z-10" />
            <div className="fixed bottom-6 left-6 w-12 h-12 border-l-2 border-b-2 border-purple-400/70 z-10" />
            <div className="fixed bottom-6 right-6 w-12 h-12 border-r-2 border-b-2 border-purple-400/70 z-10" />
          </motion.div>
        ) : null}

      </AnimatePresence>
    </motion.div>
  );
}