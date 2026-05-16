import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Swords, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function BotCard({ bot, onClick, selected, isAuthenticated }) {
  const queryClient = useQueryClient();

  const deleteBotMutation = useMutation({
    mutationFn: () => base44.entities.Bot.delete(bot.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  return (
    <Card
      className={`relative cursor-pointer transition-all duration-300 hover:scale-[1.02] overflow-hidden bg-slate-900 border-slate-700 ${
        selected ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-400/20' : 'hover:shadow-xl'
      }`}
      onClick={onClick}
    >
      {isAuthenticated && (
        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete ${bot.name}?`)) deleteBotMutation.mutate();
          }}
          className="absolute top-2 left-2 z-10 h-7 w-7 bg-red-500/90 hover:bg-red-600 text-white"
        >
          <X className="w-4 h-4" />
        </Button>
      )}

      <div className="aspect-square relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900">
        {bot.image_url ? (
          <img src={bot.image_url} alt={bot.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Swords className="w-16 h-16 text-slate-600" />
          </div>
        )}
        {bot.status === 'champion' && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-yellow-500 text-black font-bold">🏆 CHAMPION</Badge>
          </div>
        )}
        {bot.status === 'eliminated' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-red-500 font-bold text-xl tracking-wider">ELIMINATED</span>
          </div>
        )}
      </div>

      <CardContent className="p-4 bg-white">
        <h3 className="font-bold text-lg text-slate-900 truncate">{bot.name}</h3>
        <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
          <Users className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{bot.team_name}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {bot.weight_class && (
            <Badge variant="outline" className="text-xs border-cyan-500 text-cyan-600">
              {bot.weight_class}
            </Badge>
          )}
          {bot.weapon_type && (
            <Badge variant="outline" className="text-xs border-purple-500 text-purple-600">
              {bot.weapon_type}
            </Badge>
          )}
          {bot.seed && (
            <Badge variant="outline" className="text-xs border-slate-400 text-slate-500">
              #{bot.seed}
            </Badge>
          )}
        </div>
        {bot.description && (
          <p className="text-xs text-slate-500 mt-2 line-clamp-2">{bot.description}</p>
        )}
      </CardContent>
    </Card>
  );
}