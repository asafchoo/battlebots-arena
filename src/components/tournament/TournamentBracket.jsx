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
    if (!winnersRounds[m.round]) winnersRounds[m.round] = [];
    winnersRounds[m.round].push(m);
  });

  const losersRounds = {};
  losers_bracket.forEach(m => {
    if (!losersRounds[m.round]) losersRounds[m.round] = [];
    losersRounds[m.round].push(m);
  });

  const isMatchActive = (bracket, round, matchNum) => {
    return current_match?.bracket === bracket && 
           current_match?.round === round && 
           current_match?.match_number === matchNum;
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
    // Find next pending match
    if (!current_match) {
      const firstPending = [...winners_bracket, ...losers_bracket]
        .find(m => m.status === 'pending' && m.bot1_id && m.bot2_id);
      if (firstPending) {
        const matchBracket = winners_bracket.includes(firstPending) ? 'winners' : 'losers';
        return matchBracket === bracket && firstPending.round === round && firstPending.match_number === matchNum;
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
                Round {round}
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
      {losers_bracket.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-bold text-red-400">
            <Skull className="w-5 h-5" />
            <span>LOSERS BRACKET</span>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4">
            {Object.keys(losersRounds).sort((a, b) => a - b).map(round => (
              <div key={`l-${round}`} className="flex flex-col gap-4 min-w-[135px]">
                <div className="text-xs text-slate-500 text-center uppercase tracking-wider">
                  Round {round}
                </div>
                <div className="flex flex-col gap-4 justify-around flex-1">
                  {losersRounds[round].sort((a, b) => a.match_number - b.match_number).map(match => (
                    <BracketMatch
                      key={`l-${match.round}-${match.match_number}`}
                      match={match}
                      bots={bots}
                      isActive={isMatchActive('losers', match.round, match.match_number)}
                      isNext={isMatchNext('losers', match.round, match.match_number)}
                      onSelectWinner={showControls ? onSelectWinner : undefined}
                      matchLabel={globalMatchNum[`l-${match.round}-${match.match_number}`]}
                      compact
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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