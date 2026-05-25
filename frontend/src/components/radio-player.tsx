"use client";

import React from "react";
import { usePlayer } from "@/providers/PlayerProvider";
import { Play, Pause, Volume2, Radio } from "lucide-react";

export function RadioPlayer() {
  const { currentStation, isPlaying, isLoading, togglePlay, volume, setVolume } = usePlayer();

  if (!currentStation) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 p-4 shadow-2xl transition-all duration-300">
      <div className="container mx-auto max-w-5xl flex items-center justify-between">
        
        {/* Station Info */}
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Radio className="text-white w-6 h-6" />
          </div>
          <div>
            <h4 className="text-white font-bold text-lg leading-tight">{currentStation.name}</h4>
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2.5 w-2.5">
                {isPlaying && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPlaying ? 'bg-red-500' : 'bg-slate-500'}`}></span>
              </span>
              <span className="text-slate-400 text-sm font-medium">
                {isLoading ? "Buffering..." : isPlaying ? "LIVE" : "Paused"}
              </span>
            </div>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center space-x-6">
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className="w-14 h-14 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause fill="currentColor" className="w-6 h-6" />
            ) : (
              <Play fill="currentColor" className="w-6 h-6 ml-1" />
            )}
          </button>
        </div>

        {/* Volume Controls */}
        <div className="hidden md:flex items-center space-x-3 w-48">
          <Volume2 className="text-slate-400 w-5 h-5" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
