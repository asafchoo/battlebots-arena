import React, { useState } from "react";
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
import TournamentBracket from "@/components/tournament/TournamentBracket";
import { 
  Plus, Play, Trophy, Users, Swords, ExternalLink, 
  Shuffle, AlertCircle, Timer, Monitor, Loader2, RotateCcw
} from "lucide-react";

export default function Home() {
  const [showRegForm, setShowRegForm] = useState(false);
  const [tournamentName, setTournamentName] = useState("Battle Bots Championship");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const queryClient = useQueryClient();

  const { data: bots = [], isLoading: botsLoading } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.Bot.list()
  });

  const { data: tournaments = [], isLoading: tourneysLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => base44.entities.Tournament.list('-created_date', 1)
  });

  const tournament = tournaments[0];
  const activeBots = bots.filter(b => b.status !== 'eliminated');

  const createTournamentMutation = useMutation({
    mutationFn: async () => {
      // Reset all bots to active
      const botPromises = bots.map(bot => 
        base44.entities.Bot.update(bot.id, { status: 'active', seed: null })
      );
      await Promise.all(botPromises);

      // Generate brackets
      const shuffledBots = [...bots].sort(() => Math.random() - 0.5);
      const numBots = shuffledBots.length;
      
      // Calculate rounds needed
      const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numBots)));
      const byes = nextPowerOf2 - numBots;
      
      // Build winners bracket
      const winners_bracket = [];
      let matchNum = 1;
      
      // First round with byes
      const round1Matches = nextPowerOf2 / 2;
      let botIndex = 0;
      
      for (let i = 0; i < round1Matches; i++) {
        const bot1 = shuffledBots[botIndex++];
        const bot2 = botIndex < numBots ? shuffledBots[botIndex++] : null;
        
        winners_bracket.push({
          round: 1,
          match_number: matchNum++,
          bot1_id: bot1?.id || null,
          bot2_id: bot2?.id || null,
          winner_id: bot2 ? null : bot1?.id, // Auto-win for bye
          status: bot2 ? 'pending' : 'complete'
        });
      }

      // Generate subsequent winner rounds
      let prevRoundMatches = round1Matches;
      let currentRound = 2;
      while (prevRoundMatches > 1) {
        const thisRoundMatches = prevRoundMatches / 2;
        for (let i = 0; i < thisRoundMatches; i++) {
          winners_bracket.push({
            round: currentRound,
            match_number: matchNum++,
            bot1_id: null,
            bot2_id: null,
            winner_id: null,
            status: 'pending'
          });
        }
        prevRoundMatches = thisRoundMatches;
        currentRound++;
      }

      // Build losers bracket (simplified - will be populated as matches complete)
      const losers_bracket = [];
      const losersRounds = (currentRound - 1) * 2 - 1;
      let losersMatchNum = 1;
      
      for (let r = 1; r <= losersRounds; r++) {
        const matchesInRound = Math.max(1, Math.floor(round1Matches / Math.pow(2, Math.ceil(r / 2))));
        for (let m = 0; m < matchesInRound; m++) {
          losers_bracket.push({
            round: r,
            match_number: losersMatchNum++,
            bot1_id: null,
            bot2_id: null,
            winner_id: null,
            status: 'pending'
          });
        }
      }

      const newTournament = await base44.entities.Tournament.create({
        name: tournamentName,
        status: 'in_progress',
        winners_bracket,
        losers_bracket,
        grand_finals: {
          bot1_id: null,
          bot2_id: null,
          winner_id: null,
          status: 'pending'
        },
        current_match: null
      });

      return newTournament;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  const selectWinnerMutation = useMutation({
    mutationFn: async (winnerId) => {
      if (!tournament?.current_match) return;
      
      const { bracket, round, match_number } = tournament.current_match;
      const loserId = tournament.current_match.bot1_id === winnerId 
        ? tournament.current_match.bot2_id 
        : tournament.current_match.bot1_id;

      let updates = {};
      
      if (bracket === 'winners') {
        const newWinners = tournament.winners_bracket.map(m => {
          if (m.round === round && m.match_number === match_number) {
            return { ...m, winner_id: winnerId, status: 'complete' };
          }
          return m;
        });
        
        // Advance winner to next round
        const nextRound = round + 1;
        const matchIndexInRound = match_number - 1; // 0-based index
        const nextMatchNumber = Math.floor(matchIndexInRound / 2) + 1;
        const isFirstSlot = matchIndexInRound % 2 === 0;
        
        const advancedWinners = newWinners.map(m => {
          if (m.round === nextRound && m.match_number === nextMatchNumber) {
            return {
              ...m,
              [isFirstSlot ? 'bot1_id' : 'bot2_id']: winnerId
            };
          }
          return m;
        });
        
        updates.winners_bracket = advancedWinners;
        
        // Move loser to losers bracket
        const loserRound = round;
        const targetLoserMatch = tournament.losers_bracket.find(m => 
          m.round === loserRound && !m.bot1_id
        );
        if (targetLoserMatch) {
          updates.losers_bracket = tournament.losers_bracket.map(m => {
            if (m.round === targetLoserMatch.round && m.match_number === targetLoserMatch.match_number) {
              return { ...m, bot1_id: loserId };
            }
            return m;
          });
        }
      } else if (bracket === 'losers') {
        const newLosers = tournament.losers_bracket.map(m => {
          if (m.round === round && m.match_number === match_number) {
            return { ...m, winner_id: winnerId, status: 'complete' };
          }
          return m;
        });
        
        // Advance winner to next losers round or grand finals
        const nextRound = round + 1;
        const nextLoserMatch = tournament.losers_bracket.find(m => 
          m.round === nextRound && !m.bot1_id && !m.bot2_id
        );
        
        if (nextLoserMatch) {
          updates.losers_bracket = newLosers.map(m => {
            if (m.round === nextLoserMatch.round && m.match_number === nextLoserMatch.match_number) {
              return { ...m, bot1_id: winnerId };
            }
            return m;
          });
        } else {
          // Check if this is the last losers match - advance to grand finals
          const isLastLoserMatch = !tournament.losers_bracket.some(m => 
            m.round > round && m.status !== 'complete'
          );
          if (isLastLoserMatch) {
            updates.grand_finals = {
              ...tournament.grand_finals,
              bot2_id: winnerId
            };
            // Set bot1 from winners bracket final
            const winnersFinalWinner = tournament.winners_bracket
              .filter(m => m.status === 'complete')
              .sort((a, b) => b.round - a.round)[0]?.winner_id;
            if (winnersFinalWinner) {
              updates.grand_finals.bot1_id = winnersFinalWinner;
            }
          } else {
            updates.losers_bracket = newLosers;
          }
        }
        
        if (!updates.losers_bracket) {
          updates.losers_bracket = newLosers;
        }
        
        // Eliminate the loser
        await base44.entities.Bot.update(loserId, { status: 'eliminated' });
      } else if (bracket === 'finals') {
        updates.grand_finals = {
          ...tournament.grand_finals,
          winner_id: winnerId,
          status: 'complete'
        };
        await base44.entities.Bot.update(winnerId, { status: 'champion' });
        await base44.entities.Bot.update(loserId, { status: 'eliminated' });
        updates.status = 'completed';
      }

      // Store last match result for overlay
      updates.last_match_result = {
        bot1_id: tournament.current_match.bot1_id,
        bot2_id: tournament.current_match.bot2_id,
        winner_id: winnerId,
        timestamp: new Date().toISOString()
      };
      
      // Set winner_id on current_match before clearing it
      updates.current_match = {
        ...tournament.current_match,
        winner_id: winnerId
      };
      
      await base44.entities.Tournament.update(tournament.id, updates);
      
      // Clear current_match after 5 seconds to allow overlay to show winner
      setTimeout(async () => {
        await base44.entities.Tournament.update(tournament.id, { 
          current_match: null
        });
        queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      }, 5000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  const setCurrentMatchMutation = useMutation({
    mutationFn: async ({ bracket, round, match_number, bot1_id, bot2_id }) => {
      let updates = { 
        current_match: { bracket, round, match_number, bot1_id, bot2_id },
        countdown_end: new Date(Date.now() + 3 * 60 * 1000).toISOString()
      };
      
      // Update match status
      if (bracket === 'winners') {
        updates.winners_bracket = tournament.winners_bracket.map(m => {
          if (m.round === round && m.match_number === match_number) {
            return { ...m, status: 'in_progress' };
          }
          return m;
        });
      } else if (bracket === 'losers') {
        updates.losers_bracket = tournament.losers_bracket.map(m => {
          if (m.round === round && m.match_number === match_number) {
            return { ...m, status: 'in_progress' };
          }
          return m;
        });
      } else if (bracket === 'finals') {
        updates.grand_finals = { ...tournament.grand_finals, status: 'in_progress' };
      }

      await base44.entities.Tournament.update(tournament.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    }
  });

  const startNextMatch = () => {
    // Find next pending match with both bots
    const allMatches = [
      ...(tournament.winners_bracket || []).map(m => ({ ...m, bracket: 'winners' })),
      ...(tournament.losers_bracket || []).map(m => ({ ...m, bracket: 'losers' }))
    ];
    
    const nextMatch = allMatches.find(m => 
      m.status === 'pending' && m.bot1_id && m.bot2_id
    );
    
    if (nextMatch) {
      setCurrentMatchMutation.mutate(nextMatch);
    } else if (tournament.grand_finals?.bot1_id && tournament.grand_finals?.bot2_id && !tournament.grand_finals?.winner_id) {
      setCurrentMatchMutation.mutate({
        bracket: 'finals',
        round: 0,
        match_number: 0,
        bot1_id: tournament.grand_finals.bot1_id,
        bot2_id: tournament.grand_finals.bot2_id
      });
    }
  };

  const resetTournamentMutation = useMutation({
    mutationFn: async () => {
      // Reset all bots to registered status
      const botPromises = bots.map(bot => 
        base44.entities.Bot.update(bot.id, { status: 'registered', seed: null })
      );
      await Promise.all(botPromises);

      // Delete all tournaments
      if (tournament) {
        await base44.entities.Tournament.delete(tournament.id);
      }
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
    
    if (resetPassword === expectedPassword) {
      resetTournamentMutation.mutate();
    } else {
      alert("Incorrect password!");
    }
  };

  const isLoading = botsLoading || tourneysLoading;

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
            <p className="text-xl text-slate-400 tracking-widest uppercase">
              Double Elimination Tournament
            </p>
          </div>

          {/* Quick Stats */}
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
                <div className="text-2xl font-bold text-white">
                  {tournament?.status === 'completed' ? '1' : '0'}
                </div>
                <div className="text-xs text-slate-500 uppercase">Champion</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-700 backdrop-blur-sm">
              <CardContent className="p-4 text-center">
                <Badge className={`${
                  tournament?.status === 'in_progress' ? 'bg-green-500' : 
                  tournament?.status === 'completed' ? 'bg-purple-500' : 'bg-orange-500'
                }`}>
                  {tournament?.status?.replace('_', ' ').toUpperCase() || 'REGISTRATION'}
                </Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue={tournament?.status === 'in_progress' ? 'bracket' : 'registration'} className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <TabsList className="bg-slate-800/50">
              <TabsTrigger value="registration">Registration</TabsTrigger>
              <TabsTrigger value="bracket">Tournament Bracket</TabsTrigger>
              <TabsTrigger value="overlays">OBS Overlays</TabsTrigger>
            </TabsList>

            {tournament?.status === 'in_progress' && !tournament.current_match && (
              <Button 
                onClick={startNextMatch}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Next Match
              </Button>
            )}
          </div>

          {/* Registration Tab */}
          <TabsContent value="registration" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Registered Bots</h2>
              <div className="flex gap-3">
                <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" className="bg-red-600 hover:bg-red-700">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset Tournament
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border-slate-700">
                    <DialogHeader>
                      <DialogTitle className="text-white">Reset Tournament</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center gap-2 p-3 bg-red-950 rounded-lg border border-red-800">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <span className="text-sm text-red-300">
                          This will reset all battles and tournament progress!
                        </span>
                      </div>
                      <div>
                        <label className="text-sm text-slate-400">Enter Password</label>
                        <Input 
                          type="password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="battlebot + date (ddmmyy)"
                          className="bg-slate-800 border-slate-600 text-white mt-1"
                          onKeyDown={(e) => e.key === 'Enter' && handleResetConfirm()}
                        />
                      </div>
                      <Button 
                        onClick={handleResetConfirm}
                        disabled={resetTournamentMutation.isPending || !resetPassword}
                        className="w-full bg-red-600 hover:bg-red-700"
                      >
                        {resetTournamentMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Confirm Reset
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
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

                {bots.length >= 2 && (!tournament || tournament.status === 'completed') && (
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
                          <span className="text-sm text-slate-300">
                            This will generate brackets for {bots.length} bots
                          </span>
                        </div>
                        <Button 
                          onClick={() => createTournamentMutation.mutate()}
                          disabled={createTournamentMutation.isPending}
                          className="w-full bg-gradient-to-r from-cyan-500 to-purple-600"
                        >
                          {createTournamentMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : null}
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
                  <Button onClick={() => setShowRegForm(true)} className="bg-cyan-500 hover:bg-cyan-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Register First Bot
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {bots.map(bot => (
                  <BotCard key={bot.id} bot={bot} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Bracket Tab */}
          <TabsContent value="bracket">
            {tournament ? (
              <Card className="bg-slate-900/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center justify-between">
                    <span>{tournament.name}</span>
                    {tournament.current_match && (
                      <div className="flex items-center gap-3">
                        <Badge className="bg-red-500 animate-pulse">LIVE</Badge>
                        
                        {/* Pause/Resume */}
                        <Button
                          size="sm"
                          onClick={() => {
                            const updates = { is_paused: !tournament.is_paused };
                            if (!tournament.is_paused) {
                              // Pausing - calculate and store remaining time
                              const end = new Date(tournament.countdown_end).getTime();
                              const now = Date.now();
                              const remaining = Math.max(0, Math.floor((end - now) / 1000));
                              updates.paused_time_remaining = remaining;
                            } else {
                              // Resuming - calculate new end time from stored remaining time
                              updates.countdown_end = new Date(Date.now() + (tournament.paused_time_remaining || 0) * 1000).toISOString();
                            }
                            base44.entities.Tournament.update(tournament.id, updates).then(() => {
                              queryClient.invalidateQueries({ queryKey: ['tournaments'] });
                            });
                          }}
                          className={`h-7 text-xs ${tournament.is_paused ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                        >
                          {tournament.is_paused ? 'Resume' : 'Pause'}
                        </Button>

                        {/* Unstuck buttons */}
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg border border-slate-600">
                          <span className="text-sm text-slate-400">Unstuck:</span>
                          <Button
                            size="sm"
                            onClick={() => {
                              base44.entities.Tournament.update(tournament.id, {
                                current_match: {
                                  ...tournament.current_match,
                                  bot1_unstuck: !tournament.current_match.bot1_unstuck
                                }
                              }).then(() => queryClient.invalidateQueries({ queryKey: ['tournaments'] }));
                            }}
                            className={`h-7 text-xs ${tournament.current_match.bot1_unstuck ? 'bg-yellow-600' : 'bg-slate-700'}`}
                          >
                            {bots.find(b => b.id === tournament.current_match.bot1_id)?.name}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              base44.entities.Tournament.update(tournament.id, {
                                current_match: {
                                  ...tournament.current_match,
                                  bot2_unstuck: !tournament.current_match.bot2_unstuck
                                }
                              }).then(() => queryClient.invalidateQueries({ queryKey: ['tournaments'] }));
                            }}
                            className={`h-7 text-xs ${tournament.current_match.bot2_unstuck ? 'bg-yellow-600' : 'bg-slate-700'}`}
                          >
                            {bots.find(b => b.id === tournament.current_match.bot2_id)?.name}
                          </Button>
                        </div>

                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-lg border border-slate-600">
                          <span className="text-sm text-slate-400">Select Winner:</span>
                          <Button
                            size="sm"
                            onClick={() => selectWinnerMutation.mutate(tournament.current_match.bot1_id)}
                            className="bg-cyan-600 hover:bg-cyan-700 h-7 text-xs"
                          >
                            {bots.find(b => b.id === tournament.current_match.bot1_id)?.name}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => selectWinnerMutation.mutate(tournament.current_match.bot2_id)}
                            className="bg-purple-600 hover:bg-purple-700 h-7 text-xs"
                          >
                            {bots.find(b => b.id === tournament.current_match.bot2_id)?.name}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TournamentBracket 
                    tournament={tournament}
                    bots={bots}
                    onSelectWinner={(winnerId) => selectWinnerMutation.mutate(winnerId)}
                    showControls={true}
                  />
                </CardContent>
              </Card>
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
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                      Preview
                    </div>
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
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                      Preview
                    </div>
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
    </div>
  );
}