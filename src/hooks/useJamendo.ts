import { useState, useCallback } from 'react';

export interface Track {
  id: string;
  name: string;
  artist_name: string;
  audio: string;
  image: string;
  bpm: number;
}

// Hardcoded library of tracks with known BPMs for the prototype as a fallback
const MOCK_LIBRARY: Track[] = [
  { id: '1', name: 'Slow Morning', artist_name: 'Chillout Vibes', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890755&format=mp31', image: 'https://picsum.photos/seed/chill/200/200', bpm: 70 },
  { id: '2', name: 'Walking Pace', artist_name: 'Acoustic Guitars', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890756&format=mp31', image: 'https://picsum.photos/seed/walk/200/200', bpm: 90 },
  { id: '3', name: 'Steady Jog', artist_name: 'Synthwave', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890757&format=mp31', image: 'https://picsum.photos/seed/jog/200/200', bpm: 110 },
  { id: '4', name: 'Running Beat', artist_name: 'Electronic', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890758&format=mp31', image: 'https://picsum.photos/seed/run/200/200', bpm: 130 },
  { id: '5', name: 'Sprint Energy', artist_name: 'Dance', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890759&format=mp31', image: 'https://picsum.photos/seed/sprint/200/200', bpm: 150 },
  { id: '6', name: 'Max Effort', artist_name: 'Hardstyle', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890760&format=mp31', image: 'https://picsum.photos/seed/max/200/200', bpm: 170 },
  { id: '7', name: 'Warmup Groove', artist_name: 'Lo-Fi', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890761&format=mp31', image: 'https://picsum.photos/seed/warmup/200/200', bpm: 100 },
  { id: '8', name: 'Cardio Flow', artist_name: 'House', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890762&format=mp31', image: 'https://picsum.photos/seed/cardio/200/200', bpm: 120 },
  { id: '9', name: 'Power Walk', artist_name: 'Pop', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890763&format=mp31', image: 'https://picsum.photos/seed/power/200/200', bpm: 105 },
  { id: '10', name: 'High Intensity', artist_name: 'Techno', audio: 'https://prod-1.storage.jamendo.com/?trackid=1890764&format=mp31', image: 'https://picsum.photos/seed/hiit/200/200', bpm: 160 }
];

export function useJamendo() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTracks = useCallback(async (targetBpm: number, genre: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Округляем BPM до ближайшего кратного 5 (например, 122 -> 120, 123 -> 125)
      // В Jamendo авторы обычно тегируют треки круглыми числами (120bpm, 125bpm и т.д.)
      const roundedBpm = Math.round(targetBpm / 5) * 5;
      const clientId = import.meta.env.VITE_JAMENDO_CLIENT_ID || '4399f0de';
      
      let url = `https://api.jamendo.com/v3.0/tracks/?client_id=${clientId}&format=json&limit=15&tags=${roundedBpm}bpm&include=musicinfo&audioformat=mp32`;
      
      if (genre && genre !== 'any') {
        url += `&tags=${genre}`;
      }
      
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          // Преобразуем ответ API в наш формат
          const apiTracks: Track[] = data.results.map((t: any) => {
            let trackBpm = roundedBpm;
            if (Array.isArray(t.musicinfo?.tags?.vartags)) {
              const bpmTag = t.musicinfo.tags.vartags.find((tag: any) => typeof tag === 'string' && tag.endsWith('bpm'));
              if (bpmTag) {
                const parsed = parseInt(bpmTag.replace('bpm', ''), 10);
                if (!isNaN(parsed)) {
                  trackBpm = parsed;
                }
              }
            }
            
            return {
              id: t.id,
              name: t.name,
              artist_name: t.artist_name,
              audio: t.audio,
              image: t.image || t.album_image || `https://picsum.photos/seed/${t.id}/200/200`,
              bpm: trackBpm
            };
          });
          
          setTracks(apiTracks);
          return apiTracks;
        }
      }
      
      throw new Error("No tracks found from API");
    } catch (err: any) {
      console.warn(`Jamendo API недоступен или не нашел треков. Используем встроенную библиотеку.`);
      
      const minBpm = targetBpm - 20;
      const maxBpm = targetBpm + 20;
      
      let matchedTracks = MOCK_LIBRARY.filter(t => t.bpm >= minBpm && t.bpm <= maxBpm)
        .sort((a, b) => Math.abs(a.bpm - targetBpm) - Math.abs(b.bpm - targetBpm));
      
      // Если в заданном диапазоне ничего нет, просто берем ближайшие по BPM
      if (matchedTracks.length === 0) {
        matchedTracks = [...MOCK_LIBRARY]
          .sort((a, b) => Math.abs(a.bpm - targetBpm) - Math.abs(b.bpm - targetBpm))
          .slice(0, 5);
      }
      
      setTracks(matchedTracks);
      setError(null); // Очищаем ошибку, чтобы UI не показывал "0 треков"
      return matchedTracks;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { tracks, fetchTracks, isLoading, error };
}
