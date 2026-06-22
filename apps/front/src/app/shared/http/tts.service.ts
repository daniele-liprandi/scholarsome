import { Injectable } from "@angular/core";

@Injectable({
  providedIn: "root"
})
export class TtsService {
  private currentAudio: HTMLAudioElement | null = null;

  speak(text: string): void {
    const cleaned = text.replace(/<[^>]+>/g, "").trim();
    if (!cleaned) return;

    this.stop();

    const chunks = this.chunk(cleaned);
    this.playGoogleChunks(chunks, 0);
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio = null;
    }
    window.speechSynthesis.cancel();
  }

  private chunk(text: string, maxLength = 200): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      let cutAt = remaining.lastIndexOf(" ", maxLength);
      if (cutAt <= 0) cutAt = maxLength;
      chunks.push(remaining.slice(0, cutAt).trim());
      remaining = remaining.slice(cutAt).trim();
    }

    if (remaining) chunks.push(remaining);
    return chunks;
  }

  private playGoogleChunks(chunks: string[], index: number): void {
    if (index >= chunks.length) return;

    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunks[index])}&tl=en&client=gtx&ttsspeed=1`;
    const audio = new Audio(url);
    this.currentAudio = audio;

    audio.onended = () => {
      this.currentAudio = null;
      this.playGoogleChunks(chunks, index + 1);
    };

    audio.onerror = () => {
      this.currentAudio = null;
      this.fallbackSystemTts(chunks.join(" "));
    };

    audio.play().catch(() => {
      this.currentAudio = null;
      this.fallbackSystemTts(chunks.join(" "));
    });
  }

  private fallbackSystemTts(text: string): void {
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
}
