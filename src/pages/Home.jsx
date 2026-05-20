import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import BotCard from "@/components/bots/BotCard";
import BotRegistrationForm from "@/components/bots/BotRegistrationForm";
import BotDetailModal from "@/components/bots/BotDetailModal";
import TournamentBracket from "@/components/tournament/TournamentBracket";
import { useAuth } from "@/lib/AuthContext";
import {
  Plus, Trophy, Users, Swords, ExternalLink,
  Shuffle, AlertCircle, Timer, Monitor, Loader2, RotateCcw, ChevronDown
} from "lucide-react";

export default function Home() {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  const [showRegForm, setShowRegForm] = useState(false);
  const [selectedBot, setSelectedBot] = useState(null);
  const [tournamentName, setTournamentName] = useState("Battle Bots Championship");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [overrideMatch, setOverrideMatch] = useState(null);
  const [localMatchOver, setLocalMatchOver] = useState(null);
  const queryClient = useQueryClient();

  const { data: bots = [], isLoading: botsLoading } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.Bot.list(),
    refetchInterval: 5000
  });

  const { data: tournaments = [], isLoading: tourneysLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-created_date', 1),
    refetchInterval: 2000
  });

  const tournament = tournaments[0];
  const activeBots = bots.filter(b => b.status !== 'eliminated');

  const createTournamentMutation = useMutation({
    mutationFn: async () => {
      const botPromises = bots.map(bot => 
        base44.entities.Bot.update(bot.id, { status: 'active', seed: null })
      );
      await Promise.all(botPromises);

      const shuffledBots = [...bots].sort(() => Math.random() - 0.5);
      const numBots = shuffledBots.length;

      // ── Winners Bracket ──
      // R1: pair all bots. Odd bot gets a bye (no bot2 → auto-advance).
      const winners_bracket = [];
      let wbMatchNum = 1;
      const numR1 = Math.ceil(numBots / 2);

      for (let i = 0; i < numR1; i++) {
        const b1 = shuffledBots[i * 2];
        const b2 = shuffledBots[i * 2 + 1] || null;
        winners_bracket.push({ round: 1, match_number: wbMatchNum++, bot1_id: b1.id, bot2_id: b2?.id || null, winner_id: null, status: 'pending' });
      }

      let prevRoundCount = numR1;
      let wbRound = 2;
      while (prevRoundCount > 1) {
        const count = Math.ceil(prevRoundCount / 2);
        for (let i = 0; i < count; i++) {
          winners_bracket.push({ round: wbRound, match_number: wbMatchNum++, bot1_id: null, bot2_id: null, winner_id: null, status: 'pending' });
        }
        prevRoundCount = count;
        wbRound++;
      }
      const totalWBRounds = wbRound - 1;

      // ── Losers Bracket ──
      // Structure per WB round r (1-indexed):
      //   WB R1 losers  → LB R1  (ceil(numR1/2) matches, both slots are WB losers)
      //   WB R2 losers  → LB R2  (same count as LB R1, bot2 slot = WB loser)
      //   LB R2 winners → LB R3  (same count, bot1 slot)
      //   WB R3 losers  → LB R3  (bot2 slot — halves after consolidation)
      //   … and so on
      //
      // Simpler model:
      //   LB rounds come in pairs per WB round (except last WB round feeds directly to GF).
      //   For each WB round r from 1..totalWBRounds-1:
      //     LB "drop" round  = (r-1)*2 + 1   — WB losers from round r drop in
      //     LB "fight" round = (r-1)*2 + 2   — survivors fight each other
      //
      // Match counts:
      //   LB R1 (drop): ceil(numR1/2)  — pairs WB-R1 losers together
      //   LB R2 (fight): same count    — survivors fight (no new drops)
      //   LB R3 (drop): LB-R2 count   — WB-R2 losers join (1 each)
      //   LB R4 (fight): ceil(LB-R3/2)
      //   …

      const losers_bracket = [];
      let lbMatchNum = 1;

      // Precompute how many matches per LB round
      const lbRoundCounts = [];
      let cur = Math.ceil(numR1 / 2);
      for (let wbr = 1; wbr <= totalWBRounds - 1; wbr++) {
        // drop round: cur matches
        lbRoundCounts.push(cur);
        // fight round: same count (no halving here, just fight among survivors)
        // after fight round, half go to next drop round
        lbRoundCounts.push(cur);
        cur = Math.ceil(cur / 2);
      }

      for (let r = 0; r < lbRoundCounts.length; r++) {
        for (let m = 0; m < lbRoundCounts[r]; m++) {
          losers_bracket.push({ round: r + 1, match_number: lbMatchNum++, bot1_id: null, bot2_id: null, winner_id: null, status: 'pending' });
        }
      }

      // Pre-fill LB R1 with WB R1 byes (bot that had no opponent auto-advances to LB R1 as winner slot)
      // Actually byes in WB R1: bot advances directly, their "loser" slot doesn't exist — handle during advancement
      // Pre-fill WB R1 bots that have a bye (no bot2) as auto-wins:
      const finalWinners = [...winners_bracket];
      const finalLosers = [...losers_bracket];

      // Handle WB R1 byes: auto-advance the lone bot
      for (let i = 0; i < numR1; i++) {
        const match = finalWinners[i];
        if (!match.bot2_id) {
          // Bye: bot1 auto-wins, no loser
          finalWinners[i] = { ...match, winner_id: match.bot1_id, status: 'complete' };
          // Advance winner to WB R2
          const nextMatchIdx = Math.floor(i / 2);
          const slot = i % 2 === 0 ? 'bot1_id' : 'bot2_id';
          const r2Matches = finalWinners.filter(m => m.round === 2).sort((a, b) => a.match_number - b.match_number);
          if (r2Matches[nextMatchIdx]) {
            const target = r2Matches[nextMatchIdx];
            const tIdx = finalWinners.findIndex(m => m.match_number === target.match_number && m.round === 2);
            finalWinners[tIdx] = { ...finalWinners[tIdx], [slot]: match.bot1_id };
          }
        }
      }

      const newTournament = await base44.entities.Tournament.create({
        name: tournamentName, status: 'in_progress',
        winners_bracket: finalWinners, losers_bracket: finalLosers,
        grand_finals: { bot1_id: null, bot2_id: null, winner_id: null, status: 'pending' },
        current_match: null
      });
      return newTournament;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  // Helper: fill a slot in an array of matches and mark ready_since if both slots filled
  const fillSlot = (matches, round, match_number, slot, botId) => {
    return matches.map(m => {
      if (m.round !== round || m.match_number !== match_number) return m;
      const updated = { ...m, [slot]: botId };
      const other = slot === 'bot1_id' ? 'bot2_id' : 'bot1_id';
      if (updated[other]) updated.ready_since = new Date().toISOString();
      return updated;
    });
  };

  const selectWinnerMutation = useMutation({
    mutationFn: async (winnerId) => {
      if (!tournament?.current_match) return;
      const { bracket, round, match_number } = tournament.current_match;
      const loserId = tournament.current_match.bot1_id === winnerId
        ? tournament.current_match.bot2_id
        : tournament.current_match.bot1_id;

      let updates = {};

      if (bracket === 'winners') {
        // Mark match complete
        let wb = tournament.winners_bracket.map(m =>
          m.round === round && m.match_number === match_number ? { ...m, winner_id: winnerId, status: 'complete' } : m
        );

        // Advance WB winner to next WB round (2:1 pairing)
        const roundMatches = wb.filter(m => m.round === round).sort((a, b) => a.match_number - b.match_number);
        const idx = roundMatches.findIndex(m => m.match_number === match_number);
        const nextRoundMatches = wb.filter(m => m.round === round + 1).sort((a, b) => a.match_number - b.match_number);
        const nextMatch = nextRoundMatches[Math.floor(idx / 2)];

        if (nextMatch) {
          const slot = idx % 2 === 0 ? 'bot1_id' : 'bot2_id';
          wb = fillSlot(wb, nextMatch.round, nextMatch.match_number, slot, winnerId);
        } else {
          // WB finalist goes to Grand Finals bot1
          updates.grand_finals = { ...tournament.grand_finals, bot1_id: winnerId };
        }
        updates.winners_bracket = wb;

        // Drop WB loser into LB
        // WB R1 losers → LB R1 (both slots are WB losers, pair them up)
        // WB Rn losers (n≥2) → LB "drop" round = (n-1)*2, they go into bot2_id
        // (bot1_id in that LB round comes from the previous LB "fight" round winner)
        if (loserId) {
          let lb = [...(updates.losers_bracket || tournament.losers_bracket)];
          const lbDropRound = round === 1 ? 1 : (round - 1) * 2;
          const lbDropMatches = lb.filter(m => m.round === lbDropRound).sort((a, b) => a.match_number - b.match_number);

          if (round === 1) {
            // Fill any empty slot (both slots are WB losers in LB R1)
            const target = lbDropMatches.find(m => !m.bot1_id || !m.bot2_id);
            if (target) {
              const slot = !target.bot1_id ? 'bot1_id' : 'bot2_id';
              lb = fillSlot(lb, target.round, target.match_number, slot, loserId);
            }
          } else {
            // WB Rn loser fills bot2_id in LB drop round; bot1_id comes from previous LB winner
            const target = lbDropMatches.find(m => !m.bot2_id);
            if (target) {
              lb = fillSlot(lb, target.round, target.match_number, 'bot2_id', loserId);
            }
          }
          updates.losers_bracket = lb;
        }

      } else if (bracket === 'losers') {
        let lb = tournament.losers_bracket.map(m =>
          m.round === round && m.match_number === match_number ? { ...m, winner_id: winnerId, status: 'complete' } : m
        );

        const maxLBRound = Math.max(...tournament.losers_bracket.map(m => m.round));

        if (round === maxLBRound) {
          // LB finalist → Grand Finals bot2
          const gfBot1 = tournament.grand_finals?.bot1_id || null;
          updates.grand_finals = { ...tournament.grand_finals, bot2_id: winnerId, bot1_id: gfBot1 };
          updates.losers_bracket = lb;
        } else {
          // Advance LB winner to next LB round
          // "drop" rounds (odd) → winner goes 1:1 into same-index match in next round as bot1_id
          // "fight" rounds (even) → winners pair up 2:1 into next round
          const roundMatches = lb.filter(m => m.round === round).sort((a, b) => a.match_number - b.match_number);
          const idx = roundMatches.findIndex(m => m.match_number === match_number);
          const nextRoundMatches = lb.filter(m => m.round === round + 1).sort((a, b) => a.match_number - b.match_number);

          const isDropRound = round % 2 === 1; // odd = drop round, even = fight round

          let nextLBMatch, nextSlot;
          if (isDropRound) {
            // 1:1 mapping, winner fills bot1_id (WB loser will fill bot2_id)
            nextLBMatch = nextRoundMatches[idx];
            nextSlot = 'bot1_id';
          } else {
            // 2:1 pairing
            nextLBMatch = nextRoundMatches[Math.floor(idx / 2)];
            nextSlot = idx % 2 === 0 ? 'bot1_id' : 'bot2_id';
          }

          if (nextLBMatch) {
            lb = fillSlot(lb, nextLBMatch.round, nextLBMatch.match_number, nextSlot, winnerId);
          }
          updates.losers_bracket = lb;
        }

        if (loserId) await base44.entities.Bot.update(loserId, { status: 'eliminated' });

      } else if (bracket === 'finals') {
        updates.grand_finals = { ...tournament.grand_finals, winner_id: winnerId, status: 'complete' };
        await base44.entities.Bot.update(winnerId, { status: 'champion' });
        if (loserId) await base44.entities.Bot.update(loserId, { status: 'eliminated' });
        updates.status = 'completed';
      }

      updates.last_match_result = {
        bot1_id: tournament.current_match.bot1_id,
        bot2_id: tournament.current_match.bot2_id,
        winner_id: winnerId,
        timestamp: new Date().toISOString()
      };
      updates.current_match = { ...tournament.current_match, winner_id: winnerId };
      await base44.entities.Tournament.update(tournament.id, updates);
      setTimeout(async () => {
        await base44.entities.Tournament.update(tournament.id, { current_match: null });
        queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      }, 5000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  const resetTournamentMutation = useMutation({
    mutationFn: async () => {
      const botPromises = bots.map(bot => base44.entities.Bot.update(bot.id, { status: 'registered', seed: null }));
      await Promise.all(botPromises);
      if (tournament) await base44.entities.Tournament.delete(tournament.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['bots'] });
      setShowResetDialog(false);
      setResetPassword("");
    }
  });

  const handleResetConfirm = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    const expectedPassword = `battlebot${dd}${mm}${yy}`;
    if (resetPassword === expectedPassword) resetTournamentMutation.mutate();
    else alert("Incorrect password!");
  };

  const prevMatchRef = useRef(null);
  useEffect(() => {
    const currMatch = tournament?.current_match;
    const prevMatch = prevMatchRef.current;
    // Only clear overrideMatch when a NEW match starts (current_match goes from null to something)
    if (!prevMatch && currMatch && !currMatch.match_over) setOverrideMatch(null);
    // Clear localMatchOver when current_match is cleared
    if (!currMatch) setLocalMatchOver(null);
    prevMatchRef.current = currMatch ?? null;
  }, [tournament?.current_match?.match_number, tournament?.current_match?.bracket]);

  // Detect controller red button (reset): countdown_end becomes null while match is active and not paused
  const prevCountdownRef = useRef(null);
  useEffect(() => {
    const cm = tournament?.current_match;
    const countdownEnd = tournament?.countdown_end;
    const wasCounting = prevCountdownRef.current !== null && prevCountdownRef.current !== undefined;
    const nowNull = !countdownEnd;
    // If countdown just went null while a match is active and not already over → controller sent reset
    if (cm && !cm.match_over && !tournament?.is_paused && wasCounting && nowNull && !localMatchOver) {
      setLocalMatchOver({ bot1_id: cm.bot1_id, bot2_id: cm.bot2_id });
    }
    prevCountdownRef.current = countdownEnd;
  }, [tournament?.countdown_end, tournament?.is_paused]);

  const isLoading = botsLoading || tourneysLoading;

  const getReadyMatches = () => {
    if (!tournament) return [];
    const allMatches = [
      ...(tournament.winners_bracket || []).map(m => ({ ...m, bracket: 'winners' })),
      ...(tournament.losers_bracket || []).map(m => ({ ...m, bracket: 'losers' }))
    ];
    const ready = allMatches
      .filter(m => m.status === 'pending' && m.bot1_id && m.bot2_id)
      .sort((a, b) => {
        if (a.ready_since && b.ready_since) return new Date(a.ready_since) - new Date(b.ready_since);
        if (a.ready_since) return -1;
        if (b.ready_since) return 1;
        return a.match_number - b.match_number;
      });
    if (tournament.grand_finals?.bot1_id && tournament.grand_finals?.bot2_id && !tournament.grand_finals?.winner_id) {
      ready.push({ bracket: 'finals', bot1_id: tournament.grand_finals.bot1_id, bot2_id: tournament.grand_finals.bot2_id });
    }
    return ready;
  };

  const getNextReadyMatch = () => {
    if (overrideMatch) return overrideMatch;
    const ready = getReadyMatches();
    return ready[0] || null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 py-12">
          <div className="text-center space-y-4">
            <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400">
              BATTLE BOTS
            </h1>
            <p className="text-xl text-slate-400 tracking-widest uppercase">Double Elimination Tournament</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <Card className="bg-slate-900/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-4 text-center">
                <Users className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{bots.length}</div>
                <div className="text-xs text-slate-500 uppercase">Registered</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-4 text-center">
                <Swords className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{activeBots.length}</div>
                <div className="text-xs text-slate-500 uppercase">Active</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-4 text-center">
                <Trophy className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{tournament?.status === 'completed' ? '1' : '0'}</div>
                <div className="text-xs text-slate-500 uppercase">Champion</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-4 text-center">
                <Badge className={`${tournament?.status === 'in_progress' ? 'bg-green-500' : tournament?.status === 'completed' ? 'bg-purple-500' : 'bg-orange-500'}`}>
                  {tournament?.status?.replace('_', ' ').toUpperCase() || 'REGISTRATION'}
                </Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue={tournament?.status === 'in_progress' ? 'bracket' : 'registration'} className="space-y-6">
          <TabsList className="bg-slate-800/50">
            <TabsTrigger value="registration">Registration</TabsTrigger>
            <TabsTrigger value="bracket">Tournament Bracket</TabsTrigger>
            {isAuthenticated && <TabsTrigger value="overlays">OBS Overlays</TabsTrigger>}
          </TabsList>

          {/* Registration Tab */}
          <TabsContent value="registration" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Registered Bots</h2>
              <div className="flex gap-3">
                {isAuthenticated && (!tournament || tournament.status !== 'in_progress') && (
                  <Dialog open={showRegForm} onOpenChange={setShowRegForm}>
                    <DialogTrigger asChild>
                      <Button className="bg-gradient-to-r from-cyan-500 to-purple-600">
                        <Plus className="w-4 h-4 mr-2" />
                        Register Bot
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
                      <DialogHeader>
                        <DialogTitle className="text-white">Register New Bot</DialogTitle>
                      </DialogHeader>
                      <BotRegistrationForm onSuccess={() => {
                        setShowRegForm(false);
                        queryClient.invalidateQueries({ queryKey: ['bots'] });
                      }} />
                    </DialogContent>
                  </Dialog>
                )}

                {isAuthenticated && bots.length >= 2 && (!tournament || tournament.status === 'completed') && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10">
                        <Shuffle className="w-4 h-4 mr-2" />
                        Start Tournament
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-slate-700">
                      <DialogHeader>
                        <DialogTitle className="text-white">Create Tournament</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div>
                          <label className="text-sm text-slate-400">Tournament Name</label>
                          <Input
                            value={tournamentName}
                            onChange={(e) => setTournamentName(e.target.value)}
                            className="bg-slate-800 border-slate-600 text-white mt-1"
                          />
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-slate-800 rounded-lg">
                          <AlertCircle className="w-5 h-5 text-orange-400" />
                          <span className="text-sm text-slate-300">This will generate brackets for {bots.length} bots</span>
                        </div>
                        <Button
                          onClick={() => createTournamentMutation.mutate()}
                          disabled={createTournamentMutation.isPending}
                          className="w-full bg-gradient-to-r from-cyan-500 to-purple-600"
                        >
                          {createTournamentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Generate Brackets & Start
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : bots.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-700 border-dashed">
                <CardContent className="py-12 text-center">
                  <Swords className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">No Bots Registered</h3>
                  <p className="text-slate-400 mb-4">Start by registering your first battle bot!</p>
                  {isAuthenticated && (
                    <Button onClick={() => setShowRegForm(true)} className="bg-cyan-500 hover:bg-cyan-600">
                      <Plus className="w-4 h-4 mr-2" />
                      Register First Bot
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {bots.map(bot => (
                    <BotCard key={bot.id} bot={bot} isAuthenticated={isAuthenticated} onClick={() => setSelectedBot(bot)} />
                  ))}
                </div>

                {isAuthenticated && tournament && (
                  <div className="mt-8 pt-8 border-t border-slate-700">
                    <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                      <DialogTrigger asChild>
                        <Button variant="destructive" className="w-full bg-red-600 hover:bg-red-700">
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Reset Tournament
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-slate-900 border-slate-700">
                        <DialogHeader>
                          <DialogTitle className="text-white text-xl">⚠️ Reset Tournament</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="flex items-start gap-3 p-4 bg-red-950 rounded-lg border-2 border-red-800">
                            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="space-y-2">
                              <p className="text-red-300 font-semibold">This action cannot be undone!</p>
                              <ul className="text-sm text-red-400 list-disc list-inside space-y-1">
                                <li>All tournament progress and results</li>
                                <li>All match history</li>
                                <li>Current bracket structure</li>
                              </ul>
                            </div>
                          </div>
                          <div>
                            <label className="text-sm text-slate-400 font-semibold">Enter Password to Confirm</label>
                            <Input
                              type="password"
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              placeholder="battlebot + date (ddmmyy)"
                              className="bg-slate-800 border-slate-600 text-white mt-2"
                              onKeyDown={(e) => e.key === 'Enter' && handleResetConfirm()}
                            />
                            <p className="text-xs text-slate-500 mt-1">Format: battlebot + today's date (e.g., battlebot150225)</p>
                          </div>
                          <Button
                            onClick={handleResetConfirm}
                            disabled={resetTournamentMutation.isPending || !resetPassword}
                            className="w-full bg-red-600 hover:bg-red-700"
                          >
                            {resetTournamentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Yes, Reset Everything
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Bracket Tab */}
          <TabsContent value="bracket">
            {tournament ? (
              <div className="space-y-4">
                {tournament.status === 'in_progress' && (() => {
                  const cm = tournament.current_match;

                  if (!cm) {
                    const readyMatches = getReadyMatches();
                    const nextMatch = overrideMatch || readyMatches[0];
                    if (!nextMatch) return null;
                    const nb1 = bots.find(b => b.id === nextMatch.bot1_id);
                    const nb2 = bots.find(b => b.id === nextMatch.bot2_id);
                    return (
                      <Card className="bg-slate-900/60 border-slate-600">
                        <CardContent className="py-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
                            <span className="text-green-400 font-bold tracking-widest uppercase text-sm">Next Match Ready</span>
                            {overrideMatch && (
                              <span className="ml-auto text-xs text-yellow-400 bg-yellow-900/40 px-2 py-0.5 rounded border border-yellow-700">Manual Override</span>
                            )}
                          </div>
                          <div className="flex items-center justify-center gap-8 text-xl font-bold text-white">
                            <span>{nb1?.name || 'TBD'}</span>
                            <span className="text-slate-500 text-base">VS</span>
                            <span>{nb2?.name || 'TBD'}</span>
                          </div>

                          <p className="text-center text-slate-400 text-xs">Press the green button on the controller to start</p>

                          {isAuthenticated && readyMatches.length > 1 && (
                            <div className="pt-2 border-t border-slate-700">
                              <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <ChevronDown className="w-3 h-3" /> Prioritize a different match
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {readyMatches.map((m, idx) => {
                                  const b1 = bots.find(b => b.id === m.bot1_id);
                                  const b2 = bots.find(b => b.id === m.bot2_id);
                                  const isSelected = overrideMatch
                                    ? overrideMatch.match_number === m.match_number && overrideMatch.bracket === m.bracket
                                    : idx === 0;
                                  return (
                                    <button
                                      key={`${m.bracket}-${m.match_number}`}
                                      onClick={() => {
                                        setOverrideMatch(m);
                                      }}
                                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors ${
                                        isSelected ? 'bg-cyan-900/40 border-cyan-600 text-cyan-300' : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'
                                      }`}
                                    >
                                      <span className="font-semibold">{b1?.name || '?'} vs {b2?.name || '?'}</span>
                                      <span className="text-xs opacity-60 ml-2 uppercase">
                                        {m.bracket === 'winners' ? 'WB' : m.bracket === 'losers' ? 'LB' : 'Finals'} R{m.round}
                                        {idx === 0 && !overrideMatch ? ' · default' : ''}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  }

                  if (cm.match_over || localMatchOver) {
                    const matchData = localMatchOver || cm;
                    const b1 = bots.find(b => b.id === matchData.bot1_id);
                    const b2 = bots.find(b => b.id === matchData.bot2_id);
                    return (
                      <Card className="bg-yellow-950/40 border-yellow-500/60">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-yellow-400 font-bold tracking-widest uppercase text-sm">⚡ Match Ended — Select Winner</span>
                          </div>
                          {isAuthenticated && (
                            <div className="flex items-center gap-3">
                              <Button
                                onClick={() => selectWinnerMutation.mutate(matchData.bot1_id)}
                                disabled={selectWinnerMutation.isPending}
                                className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-base font-bold py-6"
                              >
                                {b1?.name || 'Bot 1'}
                              </Button>
                              <Button
                                onClick={() => selectWinnerMutation.mutate(matchData.bot2_id)}
                                disabled={selectWinnerMutation.isPending}
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-base font-bold py-6"
                              >
                                {b2?.name || 'Bot 2'}
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  }

                  const b1 = bots.find(b => b.id === cm.bot1_id);
                  const b2 = bots.find(b => b.id === cm.bot2_id);
                  return (
                    <Card className="bg-slate-900/60 border-slate-600">
                      <CardContent className="py-4">
                        <div className="flex items-center gap-2 mb-2">
                          {tournament.is_paused ? (
                            <span className="text-orange-400 font-bold tracking-widest uppercase text-sm">⏸ Paused</span>
                          ) : (
                            <>
                              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                              <span className="text-red-400 font-bold tracking-widest uppercase text-sm">Live</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center justify-center gap-8 text-xl font-bold text-white mb-3">
                          <span>{b1?.name || 'TBD'}</span>
                          <span className="text-slate-500 text-base">VS</span>
                          <span>{b2?.name || 'TBD'}</span>
                        </div>
                        {isAuthenticated && (
                          <div className="flex items-center justify-center gap-3 flex-wrap">
                            <span className="text-slate-400 text-sm">Unstuck:</span>
                            <Button
                              size="sm"
                              onClick={() => {
                                base44.entities.Tournament.update(tournament.id, {
                                  current_match: { ...cm, bot1_unstuck: !cm.bot1_unstuck }
                                }).then(() => queryClient.invalidateQueries({ queryKey: ['tournaments'] }));
                              }}
                              className={`text-xs ${cm.bot1_unstuck ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-slate-700 hover:bg-slate-600'}`}
                            >
                              {b1?.name || 'Bot 1'}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                base44.entities.Tournament.update(tournament.id, {
                                  current_match: { ...cm, bot2_unstuck: !cm.bot2_unstuck }
                                }).then(() => queryClient.invalidateQueries({ queryKey: ['tournaments'] }));
                              }}
                              className={`text-xs ${cm.bot2_unstuck ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-slate-700 hover:bg-slate-600'}`}
                            >
                              {b2?.name || 'Bot 2'}
                            </Button>

                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                      <span>{tournament.name}</span>
                      <div className="flex items-center gap-3">
                        {tournament.current_match && !tournament.current_match.match_over && (
                          <Badge className={tournament.is_paused ? 'bg-orange-500' : 'bg-red-500 animate-pulse'}>
                            {tournament.is_paused ? 'PAUSED' : 'LIVE'}
                          </Badge>
                        )}
                        {isAuthenticated && (
                          <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="destructive" className="bg-red-700 hover:bg-red-800 text-xs">
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Reset
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-slate-900 border-slate-700">
                              <DialogHeader>
                                <DialogTitle className="text-white text-xl">⚠️ Reset Tournament</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <div className="flex items-start gap-3 p-4 bg-red-950 rounded-lg border-2 border-red-800">
                                  <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
                                  <div className="space-y-2">
                                    <p className="text-red-300 font-semibold">This action cannot be undone!</p>
                                    <ul className="text-sm text-red-400 list-disc list-inside space-y-1">
                                      <li>All tournament progress and results</li>
                                      <li>All match history</li>
                                      <li>Current bracket structure</li>
                                    </ul>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm text-slate-400 font-semibold">Enter Password to Confirm</label>
                                  <Input
                                    type="password"
                                    value={resetPassword}
                                    onChange={(e) => setResetPassword(e.target.value)}
                                    placeholder="battlebot + date (ddmmyy)"
                                    className="bg-slate-800 border-slate-600 text-white mt-2"
                                    onKeyDown={(e) => e.key === 'Enter' && handleResetConfirm()}
                                  />
                                  <p className="text-xs text-slate-500 mt-1">Format: battlebot + today's date (e.g., battlebot150225)</p>
                                </div>
                                <Button
                                  onClick={handleResetConfirm}
                                  disabled={resetTournamentMutation.isPending || !resetPassword}
                                  className="w-full bg-red-600 hover:bg-red-700"
                                >
                                  {resetTournamentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                  Yes, Reset Everything
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TournamentBracket
                      tournament={tournament}
                      bots={bots}
                      onSelectWinner={(winnerId) => selectWinnerMutation.mutate(winnerId)}
                      showControls={isAuthenticated}
                    />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="bg-slate-900/50 border-slate-700 border-dashed">
                <CardContent className="py-12 text-center">
                  <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">No Active Tournament</h3>
                  <p className="text-slate-400">Register at least 2 bots and start a tournament</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Overlays Tab */}
          <TabsContent value="overlays">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="bg-slate-900/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-cyan-400" />
                    Full Bracket Overlay
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-slate-400 text-sm">
                    Complete cyberpunk-styled bracket view showing both winners and losers brackets with the next match highlighted.
                  </p>
                  <div className="aspect-video bg-slate-800 rounded-lg overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">Preview</div>
                  </div>
                  <Link to={createPageUrl("BracketOverlay")}>
                    <Button className="w-full bg-cyan-500 hover:bg-cyan-600">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open Bracket Overlay
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Timer className="w-5 h-5 text-purple-400" />
                    Match Countdown Overlay
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-slate-400 text-sm">
                    Minimalist overlay showing current match combatants with a 3-minute countdown timer.
                  </p>
                  <div className="aspect-video bg-slate-800 rounded-lg overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">Preview</div>
                  </div>
                  <Link to={createPageUrl("CountdownOverlay")}>
                    <Button className="w-full bg-purple-500 hover:bg-purple-600">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open Countdown Overlay
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    <BotDetailModal bot={selectedBot} open={!!selectedBot} onClose={() => setSelectedBot(null)} />
    </div>
  );
}