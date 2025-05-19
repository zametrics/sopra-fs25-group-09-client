// app/context/SoundProvider.tsx
"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type SoundKey =
  | "tick"
  | "wordSelect"
  | "correctGuess"
  | "error"
  | "paint"
  | "guess"
  | "roundEnd"
  | "roundLost"
  | "leaderboard"; // add more whenever

type SoundManifest = {
  [key in SoundKey]: string; // Key = SoundKey, Value = string (MP3 path)
};

const manifest: SoundManifest = {
  tick: "/sounds/tick.mp3",
  wordSelect: "/sounds/word-select.mp3",
  correctGuess: "/sounds/correct.mp3",
  error: "/sounds/error.mp3",
  paint: "/sounds/paint.mp3",
  guess: "/sounds/guess.mp3",
  roundEnd: "/sounds/round-end.mp3",
  roundLost: "/sounds/round-lost.mp3",
  leaderboard: "/sounds/leaderbord.mp3",
};

interface SoundContextType {
  play: (key: SoundKey) => void;
  volume: number; // 0-100 slider
  setVolume: (v: number) => void; // persists automatically
  stop: (key: SoundKey) => void;
}

const SoundContext = createContext<SoundContextType | null>(null);

export const SoundProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const activeSfxRef = useRef<Record<SoundKey, HTMLAudioElement | null>>({
    tick: null,
    wordSelect: null,
    correctGuess: null,
    error: null,
    paint: null,
    guess: null,
    roundEnd: null,
    roundLost: null,
    leaderboard: null,
  });
  const [volume, setVolumeState] = useState<number>(() => {
    // restore volume across refreshes / pages
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem("globalVolume")
        : null;
    return stored ? Number(stored) : 50; // default 70 %
  });

  // Pre-load & pool Audio objects
  const audioPool = useRef<Record<SoundKey, HTMLAudioElement[]>>(
    Object.keys(manifest).reduce((acc, key) => {
      acc[key as SoundKey] = [];
      return acc;
    }, {} as Record<SoundKey, HTMLAudioElement[]>)
  );

  //THIS MIGHT BE USED IN THE FUTURE
  // /** get a (possibly reused) HTMLAudioElement, already configured with current volume */
  // const obtainAudio = (key: SoundKey) => {
  //   const pool = audioPool.current[key];
  //   // reuse finished <audio>s to avoid constructing many objects
  //   const instance = pool.find((a) => a.paused) || new Audio(manifest[key]);
  //   instance.volume = volume / 100;
  //   // keep in pool for next time
  //   if (!pool.includes(instance)) pool.push(instance);
  //   return instance;
  // };

  /** public method: play a sound */
  const play = (key: SoundKey) => {
    const audio = new Audio(manifest[key]);
    audio.volume = volume / 100;

    // If the sound is long, store it in the active ref
    activeSfxRef.current[key]?.pause(); // stop if already playing
    activeSfxRef.current[key] = audio;

    audio.play().catch((err) => {
      console.warn(`SFX play error for "${key}":`, err);
    });

    // Optional: clean up when sound ends
    audio.onended = () => {
      if (activeSfxRef.current[key] === audio) {
        activeSfxRef.current[key] = null;
      }
    };
  };

  const stop = (key: SoundKey) => {
    const audio = activeSfxRef.current[key];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      activeSfxRef.current[key] = null;
    }
  };

  /** keep localStorage in sync */
  const setVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(100, v));
    setVolumeState(clamped);
    localStorage.setItem("globalVolume", String(clamped));
  };

  /** update volume on all pooled <audio>s when the slider changes */
  useEffect(() => {
    for (const pool of Object.values(audioPool.current))
      pool.forEach((a) => (a.volume = volume / 100));
  }, [volume]);

  return (
    <SoundContext.Provider value={{ play, stop, volume, setVolume }}>
      {children}
    </SoundContext.Provider>
  );
};

/** convenience hook */
export const useSound = () => {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    console.warn("⚠️ useSound was used outside of SoundProvider");
    return {
      play: () => {},
      stop: () => {},
      playMusic: () => {},
      stopMusic: () => {},
      volume: 100,
      setVolume: () => {},
    };
  }
  return ctx;
};
