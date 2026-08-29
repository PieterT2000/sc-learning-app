export async function transcribeAudio(blob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('audio', blob, filename);

  const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'Transcription failed.');
  return data.transcript || '';
}
