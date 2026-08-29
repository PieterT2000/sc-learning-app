export interface VoiceActivityHandle {
  stop: () => void;
}

/**
 * Samples microphone amplitude via Web Audio's AnalyserNode and calls
 * onSample(rms) on every animation frame (rms is roughly 0..1, silence near 0).
 *
 * This runs alongside MediaRecorder on the *same* MediaStream without
 * interfering with it - both are independent consumers of the same live
 * audio track, so recording and level-monitoring don't conflict.
 */
export function startVoiceActivityMonitor(
  stream: MediaStream,
  onSample: (rms: number) => void
): VoiceActivityHandle {
  const AudioContextClass: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextClass();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const buffer = new Uint8Array(analyser.fftSize);
  let rafId = 0;
  let stopped = false;

  function tick() {
    if (stopped) return;
    analyser.getByteTimeDomainData(buffer);

    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      const normalized = (buffer[i] - 128) / 128; // Uint8 PCM centered at 128 = silence
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / buffer.length);

    onSample(rms);
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      source.disconnect();
      audioContext.close().catch(() => {});
    },
  };
}
