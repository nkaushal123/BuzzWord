
// Sound Effects URLs
const SOUNDS = {
  // Updated to a short, sharp game buzzer (no longer a 5s alarm)
  BUZZ: 'https://assets.mixkit.co/active_storage/sfx/996/996-preview.mp3', 
  // Updated to a satisfying success/win chime
  CORRECT: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3', 
  // Standard negative tone
  WRONG: 'https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3', 
  // Magic/Special sound
  DAILY_DOUBLE: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3', 
  // Swoosh sound
  BOARD_FILL: 'https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3', 
  // Clock ticking
  TIME_UP: 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3' 
};

type SoundType = keyof typeof SOUNDS;

class SoundManager {
  private audioCache: Record<string, HTMLAudioElement> = {};

  constructor() {
    // Preload sounds
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.volume = 0.5; // Default volume
      this.audioCache[key] = audio;
    });
  }

  play(type: SoundType) {
    const audio = this.audioCache[type];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.warn("Audio play failed (user interaction needed first):", e));
    }
  }
}

export const soundService = new SoundManager();
