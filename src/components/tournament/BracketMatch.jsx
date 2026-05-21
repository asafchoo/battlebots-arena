import React, { useState } from "react";
import { cn } from "@/lib/utils";

export default function BracketMatch({ 
  match, 
  bots, 
  isActive, 
  isNext,
  onSelectWinner,
  compact = false,
  matchLabel = null
}) {
  const [showManual, setShowManual] = React.useState(false);

  const bot1 = bots.find(b => b.id === match.bot1_id);
  const bot2 = bots.find(b => b.id === match.bot2_id);
  
  // Can manually pick winner when: active match OR both bots present and no winner yet
  const canPickWinner = onSelectWinner && !match.winner_id && bot1 && bot2 && 
    (isActive || match.status === 'in_progress');

  const getSlotStyle = (botId) => {
    if (match.winner_id === botId) return "bg-green-600/30 border-green-500 text-green-400";
    if (match.winner_id && match.winner_id !== botId) return "bg-red-900/30 border-red-800 text-red-400 line-through opacity-50";
    return "bg-slate-800/80 border-slate-600 text-slate-300";
  };

  return (
    <div className={cn(
      "relative transition-all duration-300",
      isActive && "scale-105 z-10",
      isNext && "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900 rounded-lg"
    )}>
      {isNext && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-cyan-500 text-black text-[10px] font-bold rounded animate-pulse">
          NEXT
        </div>
      )}
      {matchLabel && !isNext && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-700 text-slate-300 text-[10px] font-bold rounded">
          #{matchLabel}
        </div>
      )}
      {matchLabel && isNext && (
        <div className="absolute -top-5 right-0 px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[9px] rounded">
          #{matchLabel}
        </div>
      )}
      <div className={cn(
        "flex flex-col gap-1 p-1.5 rounded-lg backdrop-blur-sm",
        isActive ? "bg-cyan-900/40 border border-cyan-400" : "bg-slate-900/60 border border-slate-700"
      )}>
        {/* Bot 1 Slot */}
        <div className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-all",
          compact ? "text-xs" : "text-sm",
          getSlotStyle(match.bot1_id),
        )}>
          {bot1?.image_url && (
            <img src={bot1.image_url} alt="" className="w-5 h-5 rounded object-cover" />
          )}
          <span className="truncate flex-1 font-medium">
            {bot1?.name || (match.bot1_id ? "TBD" : "—")}
          </span>
        </div>
        
        {/* VS Divider */}
        <div className="text-center text-[10px] text-slate-500 font-mono">VS</div>
        
        {/* Bot 2 Slot */}
        <div className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-all",
          compact ? "text-xs" : "text-sm",
          getSlotStyle(match.bot2_id),
        )}>
          {bot2?.image_url && (
            <img src={bot2.image_url} alt="" className="w-5 h-5 rounded object-cover" />
          )}
          <span className="truncate flex-1 font-medium">
            {bot2?.name || (match.bot2_id ? "TBD" : "—")}
          </span>
        </div>

        {/* Manual winner selection — always available for active match */}
        {canPickWinner && !showManual && (
          <button
            onClick={() => setShowManual(true)}
            className="mt-1 w-full text-[10px] text-yellow-400 border border-yellow-700/50 rounded py-0.5 hover:bg-yellow-900/30 transition-colors"
          >
            הכרע ניצחון
          </button>
        )}
        {canPickWinner && showManual && (
          <div className="mt-1 flex gap-1">
            <button
              onClick={() => { onSelectWinner(bot1.id); setShowManual(false); }}
              className="flex-1 text-[10px] font-bold bg-cyan-700 hover:bg-cyan-600 text-white rounded py-1 truncate px-1"
            >
              {bot1.name}
            </button>
            <button
              onClick={() => { onSelectWinner(bot2.id); setShowManual(false); }}
              className="flex-1 text-[10px] font-bold bg-purple-700 hover:bg-purple-600 text-white rounded py-1 truncate px-1"
            >
              {bot2.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}