import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Swords, Weight, Zap, Trophy, Hash } from "lucide-react";

export default function BotDetailModal({ bot, open, onClose }) {
  if (!bot) return null;

  const statusColors = {
    registered: "bg-slate-500",
    active: "bg-green-500",
    eliminated: "bg-red-500",
    champion: "bg-yellow-500 text-black"
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-lg p-0 overflow-hidden">
        {/* Bot Image */}
        <div className="relative w-full aspect-video bg-gradient-to-br from-slate-800 to-slate-900">
          {bot.image_url ? (
            <img src={bot.image_url} alt={bot.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Swords className="w-24 h-24 text-slate-600" />
            </div>
          )}
          {bot.status === 'champion' && (
            <div className="absolute top-3 right-3">
              <Badge className="bg-yellow-500 text-black font-bold text-sm px-3 py-1">🏆 CHAMPION</Badge>
            </div>
          )}
          {bot.status === 'eliminated' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-red-500 font-bold text-3xl tracking-wider">ELIMINATED</span>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-slate-900 to-transparent" />
        </div>

        {/* Bot Info */}
        <div className="px-6 pb-6 pt-2 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl font-black">{bot.name}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-slate-300">
              <Users className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider">Team</div>
                <div className="font-semibold">{bot.team_name}</div>
              </div>
            </div>

            {bot.weight_class && (
              <div className="flex items-center gap-2 text-slate-300">
                <Weight className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Weight Class</div>
                  <div className="font-semibold">{bot.weight_class}</div>
                </div>
              </div>
            )}

            {bot.weapon_type && (
              <div className="flex items-center gap-2 text-slate-300">
                <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Weapon</div>
                  <div className="font-semibold">{bot.weapon_type}</div>
                </div>
              </div>
            )}

            {bot.seed && (
              <div className="flex items-center gap-2 text-slate-300">
                <Hash className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Seed</div>
                  <div className="font-semibold">#{bot.seed}</div>
                </div>
              </div>
            )}
          </div>

          {bot.status && (
            <Badge className={`${statusColors[bot.status]} text-sm px-3 py-1`}>
              {bot.status.toUpperCase()}
            </Badge>
          )}

          {bot.description && (
            <div className="border-t border-slate-700 pt-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Description</div>
              <p className="text-slate-300 leading-relaxed">{bot.description}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}