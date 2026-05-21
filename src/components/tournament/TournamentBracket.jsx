import React from "react";
import BracketMatch from "./BracketMatch";
import { Trophy, Skull } from "lucide-react";

export default function TournamentBracket({ 
  tournament, 
  bots, 
  onSelectWinner,
  showControls = true 
}) {
  if (!tournament) return null;

  const { winners_bracket = [], losers_bracket = [], grand_finals, current_match } = tournament;

  // Group matches by round
  const winnersRounds = {};
  winners_bracket.forEach(m => {
    const r = Number(m.round);
    if (!winnersRounds[r]) winnersRounds[r] = [];
    winnersRounds[r].push(m);
  });

  const losersRounds = {};
  losers_bracket.forEach(m => {
    const r = Number(m.round);
    if (!losersRounds[r]) losersRounds[r] = [];
    losersRounds[r].push(m);
  });

  const isMatchActive = (bracket, round, matchNum) => {
    return current_match?.bracket === bracket && 
           Number(current_match?.match_number) === Number(matchNum);
  };

  // Build a global sequential match number map: WB rounds first, then LB rounds, then finals
  const globalMatchNum = {};
  let counter = 1;
  const wbRoundsSorted = Object.keys(winnersRounds).sort((a, b) => a - b);
  wbRoundsSorted.forEach(round => {
    winnersRounds[round].sort((a, b) => a.match_number - b.match_number).forEach(m => {
      globalMatchNum[`w-${m.round}-${m.match_number}`] = counter++;
    });
  });
  const lbRoundsSorted = Object.keys(losersRounds).sort((a, b) => a - b);
  lbRoundsSorted.forEach(round => {
    losersRounds[round].sort((a, b) => a.match_number - b.match_number).forEach(m => {
      globalMatchNum[`l-${m.round}-${m.match_number}`] = counter++;
    });
  });
  // Grand finals gets the last number(s) assigned inline

  const isMatchNext = (bracket, round, matchNum) => {
    if (!current_match) {
      // Sort all pending+ready matches by match_number to find the lowest
      const allPending = [...winners_bracket, ...losers_bracket]
        .filter(m => (m.status === 'pending' || m.status === 'pending_hold') && m.bot1_id && m.bot2_id)
        .sort((a, b) => Number(a.match_number) - Number(b.match_number));
      if (allPending.length > 0) {
        // Prefer the override if set
        const override = tournament?.next_match_override;
        const target = override
          ? allPending.find(m => {
              const mb = winners_bracket.some(x => Number(x.match_number) === Number(m.match_number)) ? 'winners' : 'losers';
              return mb === override.bracket && Number(m.match_number) === Number(override.match_number);
            }) || allPending[0]
          : allPending[0];
        const matchBracket = winners_bracket.some(x => Number(x.match_number) === Number(target.match_number)) ? 'winners' : 'losers';
        return matchBracket === bracket && Number(target.match_number) === Number(matchNum);
      }
    }
    return false;
  };

  return (
    <div className="space-y-8 p-4">
      {/* Winners Bracket */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-lg font-bold text-cyan-400">
          <Trophy className="w-5 h-5" />
          <span>WINNERS BRACKET</span>
        </div>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {Object.keys(winnersRounds).sort((a, b) => a - b).map(round => (
            <div key={`w-${round}`} className="flex flex-col gap-4 min-w-[135px]">
              <div className="text-xs text-slate-500 text-center uppercase tracking-wider">
                {Number(round) === 0 ? 'Play-In' : `Round ${round}`}
              </div>
              <div className="flex flex-col gap-4 justify-around flex-1">
                {winnersRounds[round].sort((a, b) => a.match_number - b.match_number).map(match => (
                  <BracketMatch
                    key={`w-${match.round}-${match.match_number}`}
                    match={match}
                    bots={bots}
                    isActive={isMatchActive('winners', match.round, match.match_number)}
                    isNext={isMatchNext('winners', match.round, match.match_number)}
                    onSelectWinner={showControls ? onSelectWinner : undefined}
                    matchLabel={globalMatchNum[`w-${match.round}-${match.match_number}`]}
                    compact
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Losers Bracket */}
      {losers_bracket.length > 0 && (() => {
        const lbRounds = Object.keys(losersRounds).sort((a, b) => a - b);
        const maxMatches = Math.max(...lbRounds.map(r => losersRounds[r].length));
        const SLOT_H = 100; // px per match slot at max density
        const ARENA_H = maxMatches * SLOT_H;
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lg font-bold text-red-400">
              <Skull className="w-5 h-5" />
              <span>LOSERS BRACKET</span>
            </div>
            <div className="flex gap-6 overflow-x-auto pb-4">
              {lbRounds.map(round => {
                const matches = losersRounds[round].sort((a, b) => a.match_number - b.match_number);
                const n = matches.length;
                return (
                  <div key={`l-${round}`} className="flex flex-col min-w-[135px]">
                    <div className="text-xs text-slate-500 text-center uppercase tracking-wider mb-2">
                      Round {round}
                    </div>
                    <div className="relative" style={{ height: `${ARENA_H}px` }}>
                      {matches.map((match, i) => {
                        const topPct = ((i + 0.5) / n) * 100;
                        return (
                          <div
                            key={`l-${match.round}-${match.match_number}`}
                            style={{ position: 'absolute', top: `${topPct}%`, transform: 'translateY(-50%)', left: 0, right: 0 }}
                          >
                            <BracketMatch
                              match={match}
                              bots={bots}
                              isActive={isMatchActive('losers', match.round, match.match_number)}
                              isNext={isMatchNext('losers', match.round, match.match_number)}
                              onSelectWinner={showControls ? onSelectWinner : undefined}
                              matchLabel={globalMatchNum[`l-${match.round}-${match.match_number}`]}
                              compact
                            />
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
      {grand_finals && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-bold text-yellow-400 justify-center">
            <Trophy className="w-6 h-6" />
            <span>GRAND FINALS</span>
            <Trophy className="w-6 h-6" />
          </div>
          <div className="flex justify-center">
            <div className="min-w-[165px]">
              <BracketMatch
                match={{
                  ...grand_finals,
                  status: grand_finals.status || 'pending'
                }}
                bots={bots}
                isActive={current_match?.bracket === 'finals'}
                isNext={!current_match && grand_finals.bot1_id && grand_finals.bot2_id && !grand_finals.winner_id}
                onSelectWinner={showControls ? onSelectWinner : undefined}
                matchLabel={counter}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}