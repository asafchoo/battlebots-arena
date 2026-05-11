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
  Plus, Trophy, Users, Swords, ExternalLink,
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
      // Reset all bots to active
      const botPromises = bots.map(bot => 
        base44.entities.Bot.update(bot.id, { status: 'active', seed: null })
      );
      await Promise.all(botPromises);

      // Generate brackets
      const shuffledBots = [...bots].sort(() => Math.random() - 0.5);
      const numBots = shuffledBots.length;
      
      // Calculate next power of 2
      const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numBots)));
      const numByes = nextPowerOf2 - numBots;
      
      console.log(`Creating tournament for ${numBots} bots (${nextPowerOf2} bracket, ${numByes} BYEs)`);
      
      // Build winners bracket with proper BYE handling
      const winners_bracket = [];
      let matchNum = 1;
      
      // Round 1 - pair bots and assign BYEs
      const round1Matches = nextPowerOf2 / 2;
      const botsWithByes = [...shuffledBots];
      
      // Add virtual BYE placeholders
      for (let i = 0; i < numByes; i++) {
        botsWithByes.push(null); // null = BYE
      }
      
      // Shuffle again to distribute BYEs randomly
      const shuffledWithByes = [...botsWithByes].sort(() => Math.random() - 0.5);
      
      // Create R1 matches
      for (let i = 0; i < round1Matches; i++) {
        const bot1 = shuffledWithByes[i * 2];
        const bot2 = shuffledWithByes[i * 2 + 1];
        
        // Determine winner if there's a BYE
        let winner_id = null;
        let status = 'pending';
        
        if (!bot1 && bot2) {
          winner_id = bot2.id;
          status = 'complete';
        } else if (bot1 && !bot2) {
          winner_id = bot1.id;
          status = 'complete';
        }
        
        winners_bracket.push({
          round: 1,
          match_number: matchNum++,
          bot1_id: bot1?.id || null,
          bot2_id: bot2?.id || null,
          winner_id,
          status
        });
      }

      // Generate subsequent winner rounds (empty, will be filled as matches complete)
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

      // Build losers bracket structure
      // LB structure for double elimination:
      // WB Round 1 losers → LB Round 1 (round1Matches/2 matches)
      // LB Round 2: LB R1 winners vs WB Round 2 losers (round1Matches/2 matches)
      // LB Round 3: LB R2 winners fight each other (round1Matches/4 matches)
      // LB Round 4: LB R3 winners vs WB Round 3 losers...
      // Pattern: odd rounds = survivors fight each other (halving), even rounds = new WB losers join
      const losers_bracket = [];
      const totalWinnerRounds = currentRound - 1; // how many WB rounds
      const losersRounds = (totalWinnerRounds - 1) * 2; // LB rounds
      let losersMatchNum = 1;
      let lbMatchCount = round1Matches / 2;

      for (let r = 1; r <= losersRounds; r++) {
        for (let m = 0; m < lbMatchCount; m++) {
          losers_bracket.push({
            round: r,
            match_number: losersMatchNum++,
            bot1_id: null,
            bot2_id: null,
            winner_id: null,
            status: 'pending'
          });
        }
        // Odd rounds: halve (survivors fight each other next)
        // Even rounds: keep same count (new WB losers join)
        if (r % 2 === 1) {
          lbMatchCount = Math.ceil(lbMatchCount / 2);
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
        // Find the index of this match within its round (0-based)
        const matchesInCurrentRound = newWinners.filter(m => m.round === round).sort((a, b) => a.match_number - b.match_number);
        const matchIndexInRound = matchesInCurrentRound.findIndex(m => m.match_number === match_number);
        
        console.log('=== WINNERS BRACKET ADVANCEMENT ===');
        console.log('Current match:', { round, match_number, winnerId, loserId });
        console.log('Matches in current round:', matchesInCurrentRound.map(m => ({ round: m.round, match_number: m.match_number })));
        console.log('Match index in round:', matchIndexInRound);
        
        // Calculate which match in next round and which slot
        const matchesInNextRound = newWinners.filter(m => m.round === nextRound).sort((a, b) => a.match_number - b.match_number);
        const nextMatchIndex = Math.floor(matchIndexInRound / 2);
        const nextMatch = matchesInNextRound[nextMatchIndex];
        const isFirstSlot = matchIndexInRound % 2 === 0;
        
        console.log('Next round matches:', matchesInNextRound.map(m => ({ round: m.round, match_number: m.match_number, bot1_id: m.bot1_id, bot2_id: m.bot2_id })));
        console.log('Next match index:', nextMatchIndex);
        console.log('Next match:', nextMatch);
        console.log('Is first slot:', isFirstSlot);
        
        const advancedWinners = newWinners.map(m => {
          if (nextMatch && m.round === nextRound && m.match_number === nextMatch.match_number) {
            console.log('✓ Updating match', m.match_number, 'in round', nextRound, 'with winner', winnerId, 'in slot', isFirstSlot ? 'bot1' : 'bot2');
            return {
              ...m,
              [isFirstSlot ? 'bot1_id' : 'bot2_id']: winnerId
            };
          }
          return m;
        });
        
        console.log('Advanced winners bracket:', advancedWinners.filter(m => m.round === nextRound).map(m => ({ round: m.round, match_number: m.match_number, bot1_id: m.bot1_id, bot2_id: m.bot2_id })));
        
        updates.winners_bracket = advancedWinners;

        // If no next WB match, this is the WB finalist → goes to Grand Finals bot1
        if (!nextMatch) {
          updates.grand_finals = {
            ...tournament.grand_finals,
            bot1_id: winnerId
          };
        }
        
        // Move loser to correct LB round
        // WB Round 1 losers → LB Round 1
        // WB Round 2 losers → LB Round 2
        // WB Round 3 losers → LB Round 4
        // WB Round N losers → LB Round (N-1)*2  (except WB R1 → LB R1)
        const lbRoundForLoser = round === 1 ? 1 : (round - 1) * 2;
        console.log('=== LOSERS BRACKET PLACEMENT ===');
        console.log('WB round:', round, '→ LB round:', lbRoundForLoser);
        const targetLoserMatch = (updates.losers_bracket || tournament.losers_bracket).find(m => 
          m.round === lbRoundForLoser && 
          (!m.bot1_id || !m.bot2_id) &&
          m.bot1_id !== loserId && 
          m.bot2_id !== loserId
        );
        console.log('Target loser match:', targetLoserMatch);
        
        if (targetLoserMatch) {
          updates.losers_bracket = tournament.losers_bracket.map(m => {
            if (m.round === targetLoserMatch.round && m.match_number === targetLoserMatch.match_number) {
              if (!m.bot1_id) {
                console.log('✓ Placing loser', loserId, 'in match', m.match_number, 'as bot1');
                return { ...m, bot1_id: loserId };
              } else if (!m.bot2_id && m.bot1_id !== loserId) {
                console.log('✓ Placing loser', loserId, 'in match', m.match_number, 'as bot2');
                return { ...m, bot2_id: loserId };
              }
            }
            return m;
          });
          console.log('Updated losers bracket R1:', updates.losers_bracket.filter(m => m.round === 1).map(m => ({ round: m.round, match_number: m.match_number, bot1_id: m.bot1_id, bot2_id: m.bot2_id })));
        } else {
          console.log('⚠️ No target loser match found!');
        }
      } else if (bracket === 'losers') {
        const newLosers = tournament.losers_bracket.map(m => {
          if (m.round === round && m.match_number === match_number) {
            return { ...m, winner_id: winnerId, status: 'complete' };
          }
          return m;
        });
        
        // Check if this is the last LB match
        const maxLBRound = Math.max(...tournament.losers_bracket.map(m => m.round));
        const isLastLoserMatch = round === maxLBRound;

        if (isLastLoserMatch) {
          // Advance to grand finals as bot2
          const winnersFinalWinner = tournament.winners_bracket
            .filter(m => m.status === 'complete')
            .sort((a, b) => b.round - a.round)[0]?.winner_id;
          updates.grand_finals = {
            ...tournament.grand_finals,
            bot2_id: winnerId,
            bot1_id: winnersFinalWinner || tournament.grand_finals?.bot1_id || null
          };
          updates.losers_bracket = newLosers;
        } else {
          // Advance winner to next LB round
          const nextRound = round + 1;
          // Find a slot in the next round that has an open spot
          const nextLoserMatch = newLosers.find(m => 
            m.round === nextRound && (!m.bot1_id || !m.bot2_id) &&
            m.bot1_id !== winnerId && m.bot2_id !== winnerId
          );
          
          if (nextLoserMatch) {
            updates.losers_bracket = newLosers.map(m => {
              if (m.round === nextLoserMatch.round && m.match_number === nextLoserMatch.match_number) {
                return { ...m, [!m.bot1_id ? 'bot1_id' : 'bot2_id']: winnerId };
              }
              return m;
            });
          } else {
            updates.losers_bracket = newLosers;
          }
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

  // Find the next ready match (both bots assigned, status pending)
  const getNextReadyMatch = () => {
    if (!tournament) return null;
    const allMatches = [
      ...(tournament.winners_bracket || []).map(m => ({ ...m, bracket: 'winners' })),
      ...(tournament.losers_bracket || []).map(m => ({ ...m, bracket: 'losers' }))
    ];
    const ready = allMatches.filter(m => m.status === 'pending' && m.bot1_id && m.bot2_id);
    if (ready.length > 0) return ready[0];
    if (tournament.grand_finals?.bot1_id && tournament.grand_finals?.bot2_id && !tournament.grand_finals?.winner_id) {
      return { bracket: 'finals', bot1_id: tournament.grand_finals.bot1_id, bot2_id: tournament.grand_finals.bot2_id };
    }
    return null;
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
          <TabsList className="bg-slate-800/50">
            <TabsTrigger value="registration">Registration</TabsTrigger>
            <TabsTrigger value="bracket">Tournament Bracket</TabsTrigger>
            <TabsTrigger value="overlays">OBS Overlays</TabsTrigger>
          </TabsList>

          {/* Registration Tab */}
          <TabsContent value="registration" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Registered Bots</h2>
              <div className="flex gap-3">
                {(!tournament || tournament.status !== 'in_progress') && (
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
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {bots.map(bot => (
                    <BotCard key={bot.id} bot={bot} />
                  ))}
                </div>
                
                {tournament && (
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
                              <p className="text-sm text-red-400">
                                This will permanently delete:
                              </p>
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
                            <p className="text-xs text-slate-500 mt-1">
                              Format: battlebot + today's date (e.g., battlebot150225)
                            </p>
                          </div>
                          <Button 
                            onClick={handleResetConfirm}
                            disabled={resetTournamentMutation.isPending || !resetPassword}
                            className="w-full bg-red-600 hover:bg-red-700"
                          >
                            {resetTournamentMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
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
                {/* Match State Panel — shown only when tournament is running */}
                {tournament.status === 'in_progress' && (() => {
                  const cm = tournament.current_match;

                  if (!cm) {
                    // Waiting state — show next match preview
                    const nextMatch = getNextReadyMatch();
                    if (!nextMatch) return null;
                    const nb1 = bots.find(b => b.id === nextMatch.bot1_id);
                    const nb2 = bots.find(b => b.id === nextMatch.bot2_id);
                    return (
                      <Card className="bg-slate-900/60 border-slate-600">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
                            <span className="text-green-400 font-bold tracking-widest uppercase text-sm">Next Match Ready</span>
                          </div>
                          <div className="flex items-center justify-center gap-8 text-xl font-bold text-white mb-2">
                            <span>{nb1?.name || 'TBD'}</span>
                            <span className="text-slate-500 text-base">VS</span>
                            <span>{nb2?.name || 'TBD'}</span>
                          </div>
                          <p className="text-center text-slate-400 text-sm">Press green button to start</p>
                        </CardContent>
                      </Card>
                    );
                  }

                  if (cm.match_over) {
                    // Match ended — prompt winner selection
                    const b1 = bots.find(b => b.id === cm.bot1_id);
                    const b2 = bots.find(b => b.id === cm.bot2_id);
                    return (
                      <Card className="bg-yellow-950/40 border-yellow-500/60">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-yellow-400 font-bold tracking-widest uppercase text-sm">
                              ⚡ Match Ended — Select Winner
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Button
                              onClick={() => selectWinnerMutation.mutate(cm.bot1_id)}
                              disabled={selectWinnerMutation.isPending}
                              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-base font-bold py-6"
                            >
                              {b1?.name || 'Bot 1'}
                            </Button>
                            <Button
                              onClick={() => selectWinnerMutation.mutate(cm.bot2_id)}
                              disabled={selectWinnerMutation.isPending}
                              className="flex-1 bg-purple-600 hover:bg-purple-700 text-base font-bold py-6"
                            >
                              {b2?.name || 'Bot 2'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }

                  // Live / Paused state
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
                        <div className="flex items-center justify-center gap-3">
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
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Bracket visualization */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                      <span>{tournament.name}</span>
                      {tournament.current_match && !tournament.current_match.match_over && (
                        <Badge className={tournament.is_paused ? 'bg-orange-500' : 'bg-red-500 animate-pulse'}>
                          {tournament.is_paused ? 'PAUSED' : 'LIVE'}
                        </Badge>
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