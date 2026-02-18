
// Sound Effects URLs (using reliable open source placeholders)
const SOUNDS = {
  BUZZ: 'https://assets.mixkit.co/active_storage/sfx/995/995-preview.mp3', // Alarm buzzer
  CORRECT: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3', // Positive ding
  WRONG: 'https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3', // Negative tone
  DAILY_DOUBLE: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3', // Magical/Special
  BOARD_FILL: 'https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3', // Swoosh
  TIME_UP: 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3' // Clock ticking or gong
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
