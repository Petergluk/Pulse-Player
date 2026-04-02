import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings as SettingsIcon, Activity, Footprints, Music, AlertCircle, FolderOpen } from 'lucide-react';
import { useHeartRate } from './hooks/useHeartRate';
import { usePedometer } from './hooks/usePedometer';
import { useJamendo, Track } from './hooks/useJamendo';
import { Player } from './components/Player';
import { BpmDisplay } from './components/BpmDisplay';

type Mode = 'fixed' | 'hr' | 'steps';
type Source = 'jamendo' | 'local';

export default function App() {
  const [mode, setMode] = useState<Mode>('fixed');
  const [source, setSource] = useState<Source>('jamendo');
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [fixedBpm, setFixedBpm] = useState(120);
  const [targetBpm, setTargetBpm] = useState(120);
  
  // Jamendo Settings
  const [genre, setGenre] = useState<string>(() => localStorage.getItem('pulseplayer_genre') || 'any');

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [maxHrThreshold, setMaxHrThreshold] = useState(180);
  const [cooldownDuration, setCooldownDuration] = useState(60); // seconds
  
  // Cooldown State
  const [isCooldown, setIsCooldown] = useState(false);
  const [cooldownStartBpm, setCooldownStartBpm] = useState<number | null>(null);
  const [cooldownStartTime, setCooldownStartTime] = useState<number | null>(null);

  const { hr, connect: connectHr, disconnect: disconnectHr, isConnecting: isConnectingHr, isConnected: isConnectedHr, error: hrError } = useHeartRate();
  const { stepsBpm, startTracking: startSteps, stopTracking: stopSteps, isTracking: isTrackingSteps, error: stepsError } = usePedometer();
  const { tracks, fetchTracks, isLoading: isLoadingTracks } = useJamendo();

  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const currentList = source === 'jamendo' ? tracks : localTracks;
  const currentTrack = currentList[currentTrackIndex] || null;

  // Persist Jamendo settings
  useEffect(() => {
    localStorage.setItem('pulseplayer_genre', genre);
  }, [genre]);

  // Handle Mode Changes
  useEffect(() => {
    if (mode !== 'hr') disconnectHr();
    if (mode !== 'steps') stopSteps();
    setIsCooldown(false);
  }, [mode, disconnectHr, stopSteps]);

  // Determine Target BPM based on mode and cooldown
  useEffect(() => {
    let newTarget = 120;

    if (isCooldown && cooldownStartBpm && cooldownStartTime) {
      const elapsed = (Date.now() - cooldownStartTime) / 1000;
      if (elapsed >= cooldownDuration) {
        newTarget = Math.max(60, cooldownStartBpm * 0.7); // End of cooldown
      } else {
        // Interpolate BPM downwards
        const progress = elapsed / cooldownDuration;
        const dropAmount = cooldownStartBpm * 0.3; // Drop by 30%
        newTarget = Math.round(cooldownStartBpm - (dropAmount * progress));
      }
    } else {
      if (mode === 'fixed') newTarget = fixedBpm;
      if (mode === 'hr') newTarget = hr || fixedBpm;
      if (mode === 'steps') newTarget = stepsBpm || fixedBpm;
    }

    // Only update if difference is significant to avoid constant fetching
    if (Math.abs(newTarget - targetBpm) > 5) {
      setTargetBpm(newTarget);
    }
  }, [mode, fixedBpm, hr, stepsBpm, isCooldown, cooldownStartBpm, cooldownStartTime, cooldownDuration, targetBpm]);

  // Check for Cooldown Trigger
  useEffect(() => {
    if (mode === 'hr' && hr && hr >= maxHrThreshold && !isCooldown) {
      setIsCooldown(true);
      setCooldownStartBpm(hr);
      setCooldownStartTime(Date.now());
    }
  }, [hr, maxHrThreshold, mode, isCooldown]);

  // Fetch tracks when target BPM changes significantly
  useEffect(() => {
    if (source === 'jamendo') {
      fetchTracks(targetBpm, genre).then(() => setCurrentTrackIndex(0));
    }
  }, [targetBpm, genre, fetchTracks, source]);

  const handleNextTrack = useCallback(() => {
    const currentList = source === 'jamendo' ? tracks : localTracks;
    if (currentTrackIndex < currentList.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
    } else {
      if (source === 'jamendo') {
        fetchTracks(targetBpm, genre).then(() => setCurrentTrackIndex(0));
      } else {
        setCurrentTrackIndex(0); // Loop local tracks
      }
    }
  }, [currentTrackIndex, tracks.length, localTracks.length, fetchTracks, targetBpm, genre, source]);

  const handleLocalFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newTracks: Track[] = files.filter(f => f.type.startsWith('audio/')).map((file, index) => {
      let bpm = 120;
      
      // 1. Явное указание (например, "track 130bpm.mp3" или "130 bpm")
      const explicitMatch = file.name.match(/(\d{2,3})\s*bpm/i);
      if (explicitMatch) {
        bpm = parseInt(explicitMatch[1], 10);
      } else {
        // 2. Формат "11_080-Название" или "080_Название" (3 цифры с разделителями)
        const prefixMatch = file.name.match(/(?:^\d{1,2}_)?(\d{3})[-_ ]/);
        if (prefixMatch) {
          bpm = parseInt(prefixMatch[1], 10);
        } else {
          // 3. Любое число от 60 до 220, отделенное пробелами или тире
          const anyNumberMatch = file.name.match(/(?:^|[-_ ])(\d{2,3})(?:[-_ ]|$)/);
          if (anyNumberMatch) {
            const parsed = parseInt(anyNumberMatch[1], 10);
            if (parsed >= 60 && parsed <= 220) {
              bpm = parsed;
            }
          }
        }
      }
      
      return {
        id: `local-${Date.now()}-${index}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        artist_name: 'Локальный файл',
        audio: URL.createObjectURL(file),
        image: 'https://picsum.photos/seed/local/200/200',
        bpm: bpm
      };
    });
    
    if (newTracks.length > 0) {
      setLocalTracks(newTracks);
      setSource('local');
      setCurrentTrackIndex(0);
    }
  };

  const actualBpm = mode === 'hr' ? hr : mode === 'steps' ? stepsBpm : fixedBpm;

  return (
    <div className="h-[100dvh] w-full bg-black text-white font-sans flex flex-col max-w-md mx-auto relative overflow-hidden">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">PulsePlayer</h1>
        <button 
          onClick={() => {
            setShowSettings(true);
          }}
          className="p-2 -mr-2 text-gray-400 hover:text-white transition-colors"
        >
          <SettingsIcon className="w-6 h-6" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-6 overflow-y-auto scrollbar-hide pb-4">
        {/* Mode Selector */}
        <div className="flex bg-gray-900 rounded-2xl p-1 mb-6">
          {(['fixed', 'hr', 'steps'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
                mode === m 
                  ? 'bg-gray-800 text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m === 'fixed' && 'Фикс'}
              {m === 'hr' && 'Пульс'}
              {m === 'steps' && 'Шаги'}
            </button>
          ))}
        </div>

        {/* Genre Selector */}
        <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-hide shrink-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {['any', 'pop', 'rock', 'electronic', 'hiphop', 'jazz', 'indie', 'filmscore', 'classical', 'chillout', 'ambient', 'folk', 'metal', 'latin', 'rnb', 'reggae', 'punk', 'country', 'house', 'blues'].map(g => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                genre === g ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {g === 'any' ? 'Любой жанр' : g.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Connection/Action Buttons */}
        <div className="flex justify-center mb-4 min-h-[48px]">
          {mode === 'hr' && !isConnectedHr && (
            <button 
              onClick={connectHr}
              disabled={isConnectingHr}
              className="px-6 py-3 bg-red-500/20 text-red-400 rounded-full font-medium flex items-center gap-2 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              <Activity className="w-5 h-5" />
              {isConnectingHr ? 'Подключение...' : 'Подключить пульсометр'}
            </button>
          )}
          {mode === 'steps' && !isTrackingSteps && (
            <button 
              onClick={startSteps}
              className="px-6 py-3 bg-green-500/20 text-green-400 rounded-full font-medium flex items-center gap-2 hover:bg-green-500/30 transition-colors"
            >
              <Footprints className="w-5 h-5" />
              Начать отслеживание шагов
            </button>
          )}
          {mode === 'fixed' && (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setFixedBpm(Math.max(60, fixedBpm - 5))}
                className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl font-bold hover:bg-gray-700"
              >-</button>
              <span className="text-xl font-medium w-16 text-center">{fixedBpm}</span>
              <button 
                onClick={() => setFixedBpm(Math.min(200, fixedBpm + 5))}
                className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl font-bold hover:bg-gray-700"
              >+</button>
            </div>
          )}
        </div>

        {/* Errors */}
        {(hrError || stepsError) && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-start gap-3 mb-4 shrink-0">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{hrError || stepsError}</p>
          </div>
        )}

        {/* BPM Display */}
        <div className="flex-1 flex flex-col justify-center -mt-8">
          <BpmDisplay 
            mode={mode} 
            targetBpm={targetBpm} 
            actualBpm={actualBpm} 
            isCooldown={isCooldown} 
          />
        </div>

        <div className="text-center text-gray-500 text-sm mt-auto mb-8 shrink-0">
          {source === 'jamendo' 
            ? (isLoadingTracks ? 'Подбор треков...' : `Найдено треков: ${tracks.length}`)
            : `Локальных треков: ${localTracks.length}`
          }
        </div>
      </main>

      {/* Player */}
      <div className="shrink-0">
        <Player currentTrack={currentTrack} onNextTrack={handleNextTrack} />
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col p-6 overflow-y-auto scrollbar-hide">
          <div className="flex justify-between items-center mb-8 mt-4">
            <h2 className="text-2xl font-bold">Настройки</h2>
            <button 
              onClick={() => {
                setShowSettings(false);
              }} 
              className="text-blue-400 font-medium hover:text-blue-300"
            >
              Готово
            </button>
          </div>
          
          <div className="space-y-8 pb-8">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Источник музыки
              </label>
              <div className="flex bg-gray-800 rounded-xl p-1">
                <button
                  onClick={() => setSource('jamendo')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                    source === 'jamendo' 
                      ? 'bg-gray-700 text-white shadow-sm' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Jamendo API
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                    source === 'local' 
                      ? 'bg-gray-700 text-white shadow-sm' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  Мои файлы
                </button>
              </div>
              {source === 'local' && localTracks.length > 0 && (
                <p className="text-xs text-green-400 mt-2">
                  Загружено треков: {localTracks.length}
                </p>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleLocalFiles} 
                multiple 
                accept="audio/*" 
                className="hidden" 
                // @ts-ignore
                webkitdirectory=""
                directory=""
              />
            </div>

            <hr className="border-gray-800" />

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Порог пульса для заминки (BPM)
              </label>
              <input 
                type="range" 
                min="140" max="220" step="5"
                value={maxHrThreshold}
                onChange={(e) => setMaxHrThreshold(Number(e.target.value))}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="text-right mt-2 font-mono text-xl">{maxHrThreshold}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Длительность заминки (сек)
              </label>
              <input 
                type="range" 
                min="30" max="300" step="10"
                value={cooldownDuration}
                onChange={(e) => setCooldownDuration(Number(e.target.value))}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="text-right mt-2 font-mono text-xl">{cooldownDuration}</div>
            </div>
            
            <div className="bg-gray-900 p-4 rounded-xl text-sm text-gray-400">
              <p className="mb-2"><strong className="text-white">Как это работает:</strong></p>
              <p>Если пульс превысит порог, приложение перейдет в режим заминки и будет плавно подбирать треки с более низким BPM в течение указанного времени, чтобы помочь вам восстановиться.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
