// TTS utility: select best available English voice
let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceLoaded = false;

function getBestEnglishVoice(): SpeechSynthesisVoice | null {
  if (voiceLoaded) return cachedVoice;
  
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  
  // Priority order for natural-sounding voices
  const preferred = [
    'Google US English',
    'Google UK English Female',
    'Google UK English Male',
    'Samantha',           // macOS/iOS
    'Karen',              // macOS/iOS Australian
    'Daniel',             // macOS/iOS British
    'Microsoft Aria',     // Windows 11
    'Microsoft Jenny',    // Windows 11
    'Microsoft Guy',      // Windows 11
    'Microsoft Zira',     // Windows 10
    'Microsoft David',    // Windows 10
  ];
  
  for (const name of preferred) {
    const match = voices.find(v => v.name.includes(name));
    if (match) {
      cachedVoice = match;
      voiceLoaded = true;
      return cachedVoice;
    }
  }
  
  // Fallback: any en-US voice
  const enUs = voices.find(v => v.lang === 'en-US');
  if (enUs) {
    cachedVoice = enUs;
    voiceLoaded = true;
    return cachedVoice;
  }
  
  // Fallback: any English voice
  const enAny = voices.find(v => v.lang.startsWith('en'));
  cachedVoice = enAny || null;
  voiceLoaded = true;
  return cachedVoice;
}

// Preload voices (they load async in some browsers)
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    voiceLoaded = false;
    getBestEnglishVoice();
  };
  // Trigger initial load
  getBestEnglishVoice();
}

export function speakEnglish(word: string) {
  if (!('speechSynthesis' in window)) return;
  
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  utterance.pitch = 1.0;
  
  const voice = getBestEnglishVoice();
  if (voice) {
    utterance.voice = voice;
  }
  
  window.speechSynthesis.speak(utterance);
}
