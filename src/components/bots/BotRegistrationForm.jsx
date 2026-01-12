import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { Upload, Loader2, Plus } from "lucide-react";

const WEIGHT_CLASSES = ["Antweight", "Beetleweight", "Hobbyweight", "Featherweight", "Lightweight", "Middleweight", "Heavyweight"];

export default function BotRegistrationForm({ onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    team_name: "",
    weight_class: "",
    weapon_type: "",
    description: "",
    image_url: ""
  });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFormData(prev => ({ ...prev, image_url: file_url }));
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await base44.entities.Bot.create({
      ...formData,
      status: "registered"
    });
    setFormData({
      name: "",
      team_name: "",
      weight_class: "",
      weapon_type: "",
      description: "",
      image_url: ""
    });
    setSubmitting(false);
    onSuccess?.();
  };

  return (
    <Card className="bg-slate-900/80 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Plus className="w-5 h-5 text-cyan-400" />
          Register New Bot
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Bot Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                className="bg-slate-800 border-slate-600 text-white"
                placeholder="Enter bot name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Team Name *</Label>
              <Input
                value={formData.team_name}
                onChange={(e) => setFormData(prev => ({ ...prev, team_name: e.target.value }))}
                required
                className="bg-slate-800 border-slate-600 text-white"
                placeholder="Enter team name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Weight Class</Label>
              <Select
                value={formData.weight_class}
                onValueChange={(value) => setFormData(prev => ({ ...prev, weight_class: value }))}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Select weight class" />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHT_CLASSES.map(wc => (
                    <SelectItem key={wc} value={wc}>{wc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Weapon Type</Label>
              <Input
                value={formData.weapon_type}
                onChange={(e) => setFormData(prev => ({ ...prev, weapon_type: e.target.value }))}
                className="bg-slate-800 border-slate-600 text-white"
                placeholder="e.g., Spinner, Flipper, Hammer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="bg-slate-800 border-slate-600 text-white"
              placeholder="Tell us about your bot..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Bot Photo</Label>
            <div className="flex items-center gap-4">
              {formData.image_url && (
                <img src={formData.image_url} alt="Bot preview" className="w-20 h-20 object-cover rounded-lg" />
              )}
              <label className="flex-1">
                <div className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 border border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-cyan-500 transition-colors">
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-slate-400" />
                      <span className="text-slate-400">Upload Image</span>
                    </>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={submitting || !formData.name || !formData.team_name}
            className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Register Bot
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}