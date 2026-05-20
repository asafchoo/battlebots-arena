import React from "react";
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
  const bot1 = bots.find(b => b.id === match.bot1_id);
  const bot2 = bots.find(b => b.id === match.bot2_id);
  
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
        <button
          onClick={() => match.status === 'in_progress' && bot1 && onSelectWinner?.(bot1.id)}
          disabled={match.status !== 'in_progress' || !bot1}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-all",
            compact ? "text-xs" : "text-sm",
            getSlotStyle(match.bot1_id),
            match.status === 'in_progress' && bot1 && "hover:bg-cyan-900/30 hover:border-cyan-500 cursor-pointer"
          )}
        >
          {bot1?.image_url && (
            <img src={bot1.image_url} alt="" className="w-5 h-5 rounded object-cover" />
          )}
          <span className="truncate flex-1 font-medium">
            {bot1?.name || (match.bot1_id ? "TBD" : "—")}
          </span>
        </button>
        
        {/* VS Divider */}
        <div className="text-center text-[10px] text-slate-500 font-mono">VS</div>
        
        {/* Bot 2 Slot */}
        <button
          onClick={() => match.status === 'in_progress' && bot2 && onSelectWinner?.(bot2.id)}
          disabled={match.status !== 'in_progress' || !bot2}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-all",
            compact ? "text-xs" : "text-sm",
            getSlotStyle(match.bot2_id),
            match.status === 'in_progress' && bot2 && "hover:bg-cyan-900/30 hover:border-cyan-500 cursor-pointer"
          )}
        >
          {bot2?.image_url && (
            <img src={bot2.image_url} alt="" className="w-5 h-5 rounded object-cover" />
          )}
          <span className="truncate flex-1 font-medium">
            {bot2?.name || (match.bot2_id ? "TBD" : "—")}
          </span>
        </button>
      </div>
    </div>
  );
}