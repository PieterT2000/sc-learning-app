/**
 * iOS Safari's MediaRecorder does not support audio/webm at all - it records
 * in audio/mp4 (occasionally audio/aac). Chrome/Firefox support
 * audio/webm;codecs=opus. We probe in priority order and use whatever the
 * browser actually supports rather than hardcoding one format.
 */
export function getSupportedMimeType(): string {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('aac')) return 'aac';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}
