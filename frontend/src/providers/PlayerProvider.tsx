"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";

interface Station {
  id: string;
  name: string;
  slug: string;
  publicUrl?: string | null;
  streamHost?: string | null;
  streamPort?: number | null;
}

interface PlayerContextType {
  currentStation: Station | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  playStation: (station: Station) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = volume;

    const handleCanPlay = () => setIsLoading(false);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);

    audioRef.current.addEventListener('canplay', handleCanPlay);
    audioRef.current.addEventListener('waiting', handleWaiting);
    audioRef.current.addEventListener('playing', handlePlaying);
    audioRef.current.addEventListener('pause', handlePause);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.removeEventListener('canplay', handleCanPlay);
        audioRef.current.removeEventListener('waiting', handleWaiting);
        audioRef.current.removeEventListener('playing', handlePlaying);
        audioRef.current.removeEventListener('pause', handlePause);
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const playStation = (station: Station) => {
    if (!audioRef.current) return;
    
    // Resolve stream URL
    let url = "";
    if (station.publicUrl) {
      url = station.publicUrl;
    } else if (station.streamHost && station.streamPort) {
      url = `http://${station.streamHost}:${station.streamPort}/stream`;
    }

    if (!url) {
      console.error("No valid stream URL for this station.");
      return;
    }

    // Append timestamp to bust cache for live streams
    url = `${url}?t=${Date.now()}`;

    if (currentStation?.id === station.id && isPlaying) {
      // Pause if already playing this station
      audioRef.current.pause();
      return;
    }

    setCurrentStation(station);
    setIsLoading(true);
    audioRef.current.src = url;
    audioRef.current.play().catch(e => {
      console.error("Playback failed:", e);
      setIsLoading(false);
      setIsPlaying(false);
    });
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentStation) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  return (
    <PlayerContext.Provider
      value={{
        currentStation,
        isPlaying,
        isLoading,
        volume,
        playStation,
        togglePlay,
        setVolume,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within a PlayerProvider");
  return context;
}
