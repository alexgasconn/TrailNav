let audio: AudioContext | null = null;

export function enableAlertAudio() {
    try {
        audio ??= new AudioContext();
        void audio.resume().catch(() => undefined);
    } catch { return; }
}

export function playAlert(message: string, sound: boolean, voice: boolean) {
    if (sound && audio?.state === 'running') {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.35);
    }
    if (voice && 'speechSynthesis' in window && document.visibilityState === 'visible') {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = 'es-ES';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }
}