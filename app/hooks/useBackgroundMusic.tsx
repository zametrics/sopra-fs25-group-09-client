import { useEffect, useState } from 'react';

export const useBackgroundMusic = (
  audioSrc: string = "/audio/good-night-lofi-cozy-chill-music-160166.mp3"
) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  // Load saved settings from sessionStorage
  useEffect(() => {
    const savedVolume = sessionStorage.getItem("musicVolume");
    const savedState = sessionStorage.getItem("musicOn");

    if (savedVolume) setVolume(parseFloat(savedVolume));
    if (savedState) setIsPlaying(savedState === "true");
  }, []);

  // Initialize the audio player
  useEffect(() => {
    const newAudio = new Audio(audioSrc);
    newAudio.loop = true;
    newAudio.volume = volume;
    setAudio(newAudio);

    return () => {
      newAudio.pause();
    };
  }, [audioSrc]);

  // Handle playback + updates
  useEffect(() => {
    if (!audio) return;

    audio.volume = volume;
    if (isPlaying) {
      audio.play().catch((err) => {
        console.warn("Autoplay blocked:", err);
      });
    } else {
      audio.pause();
    }

    sessionStorage.setItem("musicVolume", volume.toString());
    sessionStorage.setItem("musicOn", isPlaying.toString());
  }, [volume, isPlaying, audio]);

  const toggle = () => setIsPlaying((prev) => !prev);

  return { isPlaying, toggle, volume, setVolume };
};
