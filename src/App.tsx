import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings as SettingsIcon, Activity, Footprints, Music, AlertCircle, FolderOpen } from 'lucide-react';
import { useHeartRate } from './hooks/useHeartRate';
import { usePedometer } from './hooks/usePedometer';
import { useJamendo, Track } from './hooks/useJamendo';
import { Player } from './components/Player';
import { BpmDisplay } from './components/BpmDisplay';
import { BpmScanner } from './components/BpmScanner';

type Mode = 'fixed' | 'hr' | 'steps';
type Source = 'jamendo' | 'local';

const ALL_GENRES = ['any', 'pop', 'rock', 'electronic', 'hiphop', 'jazz', 'indie', 'filmscore', 'classical', 'chillout', 'ambient', 'folk', 'metal', 'latin', 'rnb', 'reggae', 'punk', 'country', 'house', 'blues'];

export default function App() {
  const [mode, setMode] = useState<Mode>('fixed');
  const [source, setSource] = useState<Source>('jamendo');
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showScanner, setShowScanner] = useState(false);
  
  const [fixedBpm, setFixedBpm] = useState(120);
  const [targetBpm, setTargetBpm] = useState(120);
  
  // Jamendo Settings
  const [genre, setGenre] = useState<string>(() => localStorage.getItem('pulseplayer_genre') || 'any');
  const [enabledGenres, setEnabledGenres] = useState<string[]>(() => {
    const saved = localStorage.getItem('pulseplayer_enabled_genres');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return ALL_GENRES;
  });

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'library' | 'settings' | 'intervals'>('settings');
  const [cooldownEnabled, setCooldownEnabled] = useState<boolean>(() => localStorage.getItem('pulseplayer_cooldown_enabled') !== 'false');
  const [maxHrThreshold, setMaxHrThreshold] = useState(180);
  const [cooldownDuration, setCooldownDuration] = useState(60); // seconds
  
  // Intervals
  const [intervalsEnabled, setIntervalsEnabled] = useState<boolean>(() => localStorage.getItem('pulseplayer_intervals_enabled') === 'true');
  const [intervalUpperHr, setIntervalUpperHr] = useState<number>(() => Number(localStorage.getItem('pulseplayer_intervals_upper') ?? 180));
  const [intervalLowerHr, setIntervalLowerHr] = useState<number>(() => Number(localStorage.getItem('pulseplayer_intervals_lower') ?? 90));
  const [intervalRunBpm, setIntervalRunBpm] = useState<number>(() => Number(localStorage.getItem('pulseplayer_intervals_run_target') ?? 160));
  const [intervalWalkBpm, setIntervalWalkBpm] = useState<number>(() => Number(localStorage.getItem('pulseplayer_intervals_walk_target') ?? 110));
  const [intervalPhase, setIntervalPhase] = useState<'running' | 'walking'>('running');
  
  const [intervalRandomize, setIntervalRandomize] = useState<boolean>(() => localStorage.getItem('pulseplayer_intervals_randomize') === 'true');
  const [intervalVariance, setIntervalVariance] = useState<number>(() => Number(localStorage.getItem('pulseplayer_intervals_variance') ?? 20));
  const activeIntervalBpmRef = useRef<number | null>(null);

  const [crossfadeDuration, setCrossfadeDuration] = useState<number>(() => Number(localStorage.getItem('pulseplayer_crossfade') ?? 3));
  const [bpmWindowSize, setBpmWindowSize] = useState<number>(() => Number(localStorage.getItem('pulseplayer_window') ?? 60));
  const [playToEnd, setPlayToEnd] = useState<boolean>(() => localStorage.getItem('pulseplayer_playtoend') === 'true');
  
  const bpmHistoryRef = useRef<{time: number, bpm: number}[]>([]);
  const [appliedBpm, setAppliedBpm] = useState(120);

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

  // Cleanup local URLs on unmount
  useEffect(() => {
    return () => {
      localTracks.forEach(track => {
        if (track.audio.startsWith('blob:')) {
          URL.revokeObjectURL(track.audio);
        }
      });
    };
  }, [localTracks]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('pulseplayer_genre', genre);
    localStorage.setItem('pulseplayer_enabled_genres', JSON.stringify(enabledGenres));
    localStorage.setItem('pulseplayer_crossfade', String(crossfadeDuration));
    localStorage.setItem('pulseplayer_window', String(bpmWindowSize));
    localStorage.setItem('pulseplayer_playtoend', String(playToEnd));
    localStorage.setItem('pulseplayer_cooldown_enabled', String(cooldownEnabled));
    localStorage.setItem('pulseplayer_intervals_enabled', String(intervalsEnabled));
    localStorage.setItem('pulseplayer_intervals_upper', String(intervalUpperHr));
    localStorage.setItem('pulseplayer_intervals_lower', String(intervalLowerHr));
    localStorage.setItem('pulseplayer_intervals_run_target', String(intervalRunBpm));
    localStorage.setItem('pulseplayer_intervals_walk_target', String(intervalWalkBpm));
    localStorage.setItem('pulseplayer_intervals_randomize', String(intervalRandomize));
    localStorage.setItem('pulseplayer_intervals_variance', String(intervalVariance));
  }, [genre, enabledGenres, crossfadeDuration, bpmWindowSize, playToEnd, cooldownEnabled, intervalsEnabled, intervalUpperHr, intervalLowerHr, intervalRunBpm, intervalWalkBpm, intervalRandomize, intervalVariance]);

  // Handle Mode Changes
  useEffect(() => {
    if (mode !== 'hr') disconnectHr();
    if (mode !== 'steps') stopSteps();
    setIsCooldown(false);
  }, [mode, disconnectHr, stopSteps]);

  // Determine Target BPM based on mode and cooldown
  useEffect(() => {
    let newTarget = 120;

    if (intervalsEnabled && mode === 'hr' && hr) {
      if (intervalPhase === 'running' && hr >= intervalUpperHr) {
        setIntervalPhase('walking');
        let nextTarget = intervalWalkBpm;
        if (intervalRandomize) nextTarget += Math.floor(Math.random() * (intervalVariance * 2 + 1)) - intervalVariance;
        activeIntervalBpmRef.current = nextTarget;
        newTarget = nextTarget;
      } else if (intervalPhase === 'walking' && hr <= intervalLowerHr) {
        setIntervalPhase('running');
        let nextTarget = intervalRunBpm;
        if (intervalRandomize) nextTarget += Math.floor(Math.random() * (intervalVariance * 2 + 1)) - intervalVariance;
        activeIntervalBpmRef.current = nextTarget;
        newTarget = nextTarget;
      } else {
        if (activeIntervalBpmRef.current === null) {
           let base = intervalPhase === 'running' ? intervalRunBpm : intervalWalkBpm;
           if (intervalRandomize) base += Math.floor(Math.random() * (intervalVariance * 2 + 1)) - intervalVariance;
           activeIntervalBpmRef.current = base;
        }
        newTarget = activeIntervalBpmRef.current;
      }
    } else if (isCooldown && cooldownStartBpm && cooldownStartTime) {
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

    // Only update if difference is significant to avoid constant fetching or if mode is fixed
    if (Math.abs(newTarget - targetBpm) > 5 || mode === 'fixed' || (intervalsEnabled && newTarget !== targetBpm)) {
      setTargetBpm(newTarget);
    }
  }, [mode, fixedBpm, hr, stepsBpm, isCooldown, cooldownStartBpm, cooldownStartTime, cooldownDuration, targetBpm, intervalsEnabled, intervalPhase, intervalUpperHr, intervalLowerHr, intervalRunBpm, intervalWalkBpm, intervalRandomize, intervalVariance]);

  // Check for Cooldown Trigger
  useEffect(() => {
    if (cooldownEnabled && mode === 'hr' && hr && hr >= maxHrThreshold && !isCooldown && !intervalsEnabled) {
      setIsCooldown(true);
      setCooldownStartBpm(hr);
      setCooldownStartTime(Date.now());
    }
  }, [hr, maxHrThreshold, mode, isCooldown, cooldownEnabled, intervalsEnabled]);

  // Smooth BPM over time window
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      if (intervalsEnabled && mode === 'hr') {
        if (appliedBpm !== targetBpm) {
          setAppliedBpm(targetBpm);
          bpmHistoryRef.current = [];
        }
        return;
      }

      bpmHistoryRef.current.push({ time: now, bpm: targetBpm });
      
      const cutoff = now - (bpmWindowSize * 1000);
      bpmHistoryRef.current = bpmHistoryRef.current.filter(entry => entry.time >= cutoff);
      
      if (bpmHistoryRef.current.length > 0) {
        const sum = bpmHistoryRef.current.reduce((acc, curr) => acc + curr.bpm, 0);
        const avg = Math.round(sum / bpmHistoryRef.current.length);
        
        if (Math.abs(avg - appliedBpm) >= 5) {
          setAppliedBpm(avg);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [targetBpm, bpmWindowSize, appliedBpm, intervalsEnabled, mode]);

  // Fetch tracks when applied BPM changes significantly
  useEffect(() => {
    if (playToEnd) return; // Wait for track to end naturally
    
    if (source === 'jamendo') {
      fetchTracks(appliedBpm, genre).then(() => setCurrentTrackIndex(0));
    } else {
      if (localTracks.length === 0) return;
      let closestIndex = 0;
      let minDiff = Infinity;
      localTracks.forEach((track, index) => {
        const diff = Math.abs(track.bpm - appliedBpm);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = index;
        }
      });
      setCurrentTrackIndex(closestIndex);
    }
  }, [appliedBpm, playToEnd, source, genre, localTracks, fetchTracks]);

  const handleNextTrack = useCallback((manual = false) => {
    if (manual) {
      setAppliedBpm(targetBpm);
      bpmHistoryRef.current = [];
    }
    
    const bpmToUse = manual ? targetBpm : appliedBpm;

    if (source === 'jamendo') {
      if (currentTrackIndex < tracks.length - 1) {
        setCurrentTrackIndex(prev => prev + 1);
      } else {
        fetchTracks(bpmToUse, genre).then(() => setCurrentTrackIndex(0));
      }
    } else {
      // Local tracks logic: find the track with BPM closest to bpmToUse
      if (localTracks.length === 0) return;
      
      let closestIndex = 0;
      let minDiff = Infinity;
      
      localTracks.forEach((track, index) => {
        if (index === currentTrackIndex && localTracks.length > 1) return;
        const diff = Math.abs(track.bpm - bpmToUse);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = index;
        }
      });
      
      setCurrentTrackIndex(closestIndex);
    }
  }, [currentTrackIndex, tracks.length, localTracks, fetchTracks, targetBpm, appliedBpm, genre, source]);

  const handleLocalFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    // Сначала очищаем старые blob URLs (для предотвращения утечек памяти)
    localTracks.forEach(track => {
      if (track.audio.startsWith('blob:')) {
        URL.revokeObjectURL(track.audio);
      }
    });

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
          {ALL_GENRES.filter(g => enabledGenres.includes(g)).map(g => (
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
        </div>

        {/* Errors */}
        {(hrError || stepsError) && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-start gap-3 mb-4 shrink-0">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{hrError || stepsError}</p>
          </div>
        )}

        {/* BPM Display & Track Count */}
        <div className="flex-1 flex flex-col justify-center items-center min-h-[320px] py-4">
          <BpmDisplay 
            mode={mode} 
            targetBpm={targetBpm} 
            actualBpm={actualBpm} 
            isCooldown={isCooldown} 
            onChangeBpm={setFixedBpm}
          />
          
          <div className="text-center text-gray-500 text-sm mt-12 shrink-0">
            {source === 'jamendo' 
              ? (isLoadingTracks ? 'Подбор треков...' : `Найдено треков: ${tracks.length}`)
              : `Локальных треков: ${localTracks.length}`
            }
          </div>
        </div>
      </main>

      {/* Player */}
      <div className="shrink-0">
        <Player currentTrack={currentTrack} onNextTrack={handleNextTrack} crossfadeDuration={crossfadeDuration} />
      </div>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col p-6 overflow-y-auto scrollbar-hide">
          <div className="flex justify-between items-center mb-6 mt-4">
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

          <div className="flex bg-gray-800 rounded-xl p-1 mb-6 shrink-0">
            <button
              onClick={() => setSettingsTab('library')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                settingsTab === 'library' 
                  ? 'bg-gray-700 text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Библиотеки
            </button>
            <button
              onClick={() => setSettingsTab('settings')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                settingsTab === 'settings' 
                  ? 'bg-gray-700 text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Настройки
            </button>
            <button
              onClick={() => setSettingsTab('intervals')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                settingsTab === 'intervals' 
                  ? 'bg-gray-700 text-white shadow-sm' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Интервалы
            </button>
          </div>
          
          <div className="space-y-6 pb-8">
            {settingsTab === 'intervals' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-between bg-gray-800 p-3 rounded-xl">
                  <label className="text-sm font-medium text-white">
                    Интервальный бег (по пульсу)
                  </label>
                  <input 
                    type="checkbox" 
                    checked={intervalsEnabled}
                    onChange={(e) => setIntervalsEnabled(e.target.checked)}
                    className="w-5 h-5 accent-blue-500"
                  />
                </div>

                {intervalsEnabled && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">Пульс для перехода на шаг</label>
                        <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-red-400">{intervalUpperHr} BPM</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setIntervalUpperHr(Math.max(intervalLowerHr + 10, intervalUpperHr - 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                        <input 
                          type="range" min="120" max="220" step="5"
                          value={intervalUpperHr}
                          onChange={(e) => setIntervalUpperHr(Math.max(intervalLowerHr + 10, Number(e.target.value)))}
                          className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                        <button onClick={() => setIntervalUpperHr(Math.min(220, intervalUpperHr + 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">Пульс для перехода на бег</label>
                        <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-blue-400">{intervalLowerHr} BPM</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setIntervalLowerHr(Math.max(60, intervalLowerHr - 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                        <input 
                          type="range" min="60" max="180" step="5"
                          value={intervalLowerHr}
                          onChange={(e) => setIntervalLowerHr(Math.min(intervalUpperHr - 10, Number(e.target.value)))}
                          className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <button onClick={() => setIntervalLowerHr(Math.min(180, intervalLowerHr + 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                      </div>
                    </div>

                    <hr className="border-gray-800" />

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">Целевой темп для бега</label>
                        <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-300">{intervalRunBpm} BPM</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setIntervalRunBpm(Math.max(130, intervalRunBpm - 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                        <input 
                          type="range" min="130" max="220" step="5"
                          value={intervalRunBpm}
                          onChange={(e) => setIntervalRunBpm(Number(e.target.value))}
                          className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500"
                        />
                        <button onClick={() => setIntervalRunBpm(Math.min(220, intervalRunBpm + 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">Целевой темп для шага</label>
                        <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-300">{intervalWalkBpm} BPM</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setIntervalWalkBpm(Math.max(60, intervalWalkBpm - 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                        <input 
                          type="range" min="60" max="130" step="5"
                          value={intervalWalkBpm}
                          onChange={(e) => setIntervalWalkBpm(Number(e.target.value))}
                          className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                        />
                        <button onClick={() => setIntervalWalkBpm(Math.min(130, intervalWalkBpm + 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                      </div>
                    </div>

                    <hr className="border-gray-800" />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg border border-gray-700/50">
                        <label className="text-sm text-gray-300 cursor-pointer flex-1" htmlFor="randomize-toggle">
                          Рандомный темп
                        </label>
                        <input 
                          id="randomize-toggle"
                          type="checkbox" 
                          checked={intervalRandomize}
                          onChange={(e) => setIntervalRandomize(e.target.checked)}
                          className="w-5 h-5 accent-purple-500"
                        />
                      </div>
                      
                      {intervalRandomize && (
                        <div className="animate-in fade-in slide-in-from-top-2">
                          <div className="flex justify-between items-center mb-2">
                            <label className="text-sm text-gray-400">Диапазон разброса (±)</label>
                            <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-purple-400">
                              ±{intervalVariance} BPM
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button onClick={() => setIntervalVariance(Math.max(0, intervalVariance - 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                            <input 
                              type="range" min="0" max="50" step="5"
                              value={intervalVariance}
                              onChange={(e) => setIntervalVariance(Number(e.target.value))}
                              className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <button onClick={() => setIntervalVariance(Math.min(50, intervalVariance + 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="bg-gray-900 p-4 rounded-xl text-sm text-gray-400">
                  <p className="mb-2"><strong className="text-white">Как работают интервалы:</strong></p>
                  <p className="leading-relaxed">Эта функция работает только в режиме "Пульс". Когда ваш пульс достигает верхнего порога, приложение меняет трек на спокойный для ходьбы. Как только вы восстановитесь и пульс упадет ниже нижнего порога, включится быстрый трек для бега.</p>
                </div>
              </div>
            )}

            {settingsTab === 'library' && (
              <div className="space-y-6 animate-in fade-in duration-300">
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

                <div className="bg-gray-900 p-4 rounded-xl text-sm text-gray-400">
                  <p className="mb-2"><strong className="text-white">Jamendo API:</strong></p>
                  <p className="leading-relaxed mb-3">
                    Jamendo использует теги, проставленные самими авторами треков. Иногда они могут быть неточными (например, автор указал 120 BPM, а реальный темп 80). 
                    Для более точного контроля используйте свои локальные файлы.
                  </p>
                  
                  <div className="mt-4 mb-4">
                    <p className="text-white font-medium mb-2">Отображаемые жанры:</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_GENRES.map(g => (
                        <button
                          key={g}
                          onClick={() => {
                            setEnabledGenres(prev => {
                              // Prevent disabling the last genre
                              if (prev.includes(g) && prev.length === 1) return prev;
                              
                              const newGenres = prev.includes(g) 
                                ? prev.filter(item => item !== g)
                                : [...prev, g];
                                
                              // If we just disabled the currently selected genre, switch to the first available
                              if (prev.includes(g) && genre === g && newGenres.length > 0) {
                                setGenre(newGenres[0]);
                              }
                              
                              return newGenres;
                            });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            enabledGenres.includes(g)
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                          }`}
                        >
                          {g === 'any' ? 'Любой' : g.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="mb-2"><strong className="text-white">Локальные файлы:</strong></p>
                  <p className="leading-relaxed">
                    Вы можете загрузить свои MP3 файлы. Приложение попытается найти BPM в названии файла (например, "Track_120bpm.mp3") или в ID3 тегах.
                  </p>
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      setShowScanner(true);
                    }}
                    className="w-full py-3 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Activity className="w-5 h-5" />
                    Сканер BPM для локальных файлов
                  </button>
                </div>
              </div>
            )}

            {settingsTab === 'settings' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-300">Длительность кроссфейда</label>
                    <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-300">{crossfadeDuration} сек</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setCrossfadeDuration(Math.max(0, crossfadeDuration - 1))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                    <input 
                      type="range" min="0" max="10" step="1"
                      value={crossfadeDuration}
                      onChange={(e) => setCrossfadeDuration(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <button onClick={() => setCrossfadeDuration(Math.min(10, crossfadeDuration + 1))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-300">Окно усреднения темпа</label>
                    <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-300">{bpmWindowSize} сек</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setBpmWindowSize(Math.max(10, bpmWindowSize - 10))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                    <input 
                      type="range" min="10" max="120" step="10"
                      value={bpmWindowSize}
                      onChange={(e) => setBpmWindowSize(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <button onClick={() => setBpmWindowSize(Math.min(120, bpmWindowSize + 10))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    Приложение будет менять трек только если ваш темп стабильно держится на новом уровне в течение этого времени.
                  </p>
                </div>

                <div className="flex items-center justify-between bg-gray-800 p-3 rounded-xl">
                  <label className="text-sm font-medium text-white">
                    Слушать трек до конца
                  </label>
                  <input 
                    type="checkbox" 
                    checked={playToEnd}
                    onChange={(e) => setPlayToEnd(e.target.checked)}
                    className="w-5 h-5 accent-blue-500"
                  />
                </div>

                <hr className="border-gray-800" />

                <div className="flex items-center justify-between bg-gray-800 p-3 rounded-xl">
                  <label className="text-sm font-medium text-white">
                    Автоматическая заминка
                  </label>
                  <input 
                    type="checkbox" 
                    checked={cooldownEnabled}
                    onChange={(e) => setCooldownEnabled(e.target.checked)}
                    className="w-5 h-5 accent-blue-500"
                  />
                </div>

                {cooldownEnabled && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">Порог пульса для заминки</label>
                        <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-300">{maxHrThreshold} BPM</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setMaxHrThreshold(Math.max(140, maxHrThreshold - 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                        <input 
                          type="range" min="140" max="220" step="5"
                          value={maxHrThreshold}
                          onChange={(e) => setMaxHrThreshold(Number(e.target.value))}
                          className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <button onClick={() => setMaxHrThreshold(Math.min(220, maxHrThreshold + 5))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-300">Длительность заминки</label>
                        <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-300">{cooldownDuration} сек</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setCooldownDuration(Math.max(30, cooldownDuration - 10))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">-</button>
                        <input 
                          type="range" min="30" max="300" step="10"
                          value={cooldownDuration}
                          onChange={(e) => setCooldownDuration(Number(e.target.value))}
                          className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <button onClick={() => setCooldownDuration(Math.min(300, cooldownDuration + 10))} className="w-8 h-8 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-300 hover:bg-gray-700 transition-colors">+</button>
                      </div>
                    </div>
                    
                    <div className="bg-gray-900 p-4 rounded-xl text-sm text-gray-400">
                      <p className="mb-2"><strong className="text-white">Как это работает:</strong></p>
                      <p className="leading-relaxed">Если пульс превысит порог, приложение перейдет в режим заминки и будет плавно подбирать треки с более низким BPM в течение указанного времени, чтобы помочь вам восстановиться.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BPM Scanner Modal */}
      {showScanner && (
        <BpmScanner onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
