import React, { useRef, useState } from 'react';
import { Settings, Activity, Footprints, Music } from 'lucide-react';

interface BpmDisplayProps {
  mode: 'fixed' | 'hr' | 'steps';
  targetBpm: number;
  actualBpm: number | null;
  isCooldown: boolean;
  onChangeBpm?: (bpm: number) => void;
}

export function BpmDisplay({ mode, targetBpm, actualBpm, isCooldown, onChangeBpm }: BpmDisplayProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [manualRotation, setManualRotation] = useState(0);
  const lastAngleRef = useRef<number>(0);
  const totalDeltaRef = useRef<number>(0);
  const startBpmRef = useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode !== 'fixed' || !onChangeBpm) return;
    if (!wheelRef.current) return;
    
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    lastAngleRef.current = angle;
    totalDeltaRef.current = 0;
    startBpmRef.current = targetBpm;
    setIsDragging(true);
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || mode !== 'fixed' || !onChangeBpm) return;
    if (!wheelRef.current) return;
    
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    
    let delta = angle - lastAngleRef.current;
    // Handle wrap around (e.g., from 179 to -179)
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    totalDeltaRef.current += delta;
    lastAngleRef.current = angle;
    
    setManualRotation(prev => prev + delta);
    
    // Every 2 degrees of rotation = 1 BPM change (more sensitive)
    const degreesPerBpm = 2; 
    const bpmChange = Math.trunc(totalDeltaRef.current / degreesPerBpm);
    
    onChangeBpm(Math.min(200, Math.max(60, startBpmRef.current + bpmChange)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const isInteractive = mode === 'fixed';

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="w-full flex flex-row items-start justify-center max-w-xl mx-auto">
        <div className="flex-1 flex justify-center">
          {isInteractive ? (
            <button
              onClick={(e) => { e.stopPropagation(); onChangeBpm?.(Math.max(60, targetBpm - 1)); }}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-800/30 backdrop-blur-md border border-gray-700/50 flex items-center justify-center text-2xl sm:text-3xl font-bold hover:bg-gray-700/50 text-gray-300 z-10 active:scale-95 transition-transform shadow-lg"
            >
              -
            </button>
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 opacity-0 pointer-events-none" />
          )}
        </div>

        <div 
          ref={wheelRef}
          className={`relative w-56 h-56 sm:w-64 sm:h-64 shrink-0 flex items-center justify-center ${isInteractive ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Outer animated ring */}
          <div 
            className={`absolute inset-0 rounded-full border-4 ${isCooldown ? 'border-blue-500/30' : 'border-red-500/30'} ${!isDragging ? 'animate-[spin_10s_linear_infinite]' : ''}`} 
            style={isDragging ? { transform: `rotate(${manualRotation}deg)` } : {}}
          />
          <div 
            className={`absolute inset-2 rounded-full border-4 border-dashed ${isCooldown ? 'border-blue-500/40' : 'border-red-500/40'} ${!isDragging ? 'animate-[spin_15s_linear_infinite_reverse]' : ''}`} 
            style={isDragging ? { transform: `rotate(${-manualRotation}deg)` } : {}}
          />
          
          {/* Inner circle */}
          <div className={`absolute inset-5 sm:inset-6 rounded-full ${isCooldown ? 'bg-blue-500/10' : 'bg-red-500/10'} backdrop-blur-sm flex flex-col items-center justify-center shadow-[inset_0_0_50px_rgba(0,0,0,0.1)] transition-all duration-200 ${isDragging ? 'bg-red-500/20 scale-105' : ''}`}>
            <span className="text-gray-400 text-xs sm:text-sm font-medium uppercase tracking-wider mb-1">
              {mode === 'fixed' ? 'Целевой BPM' : mode === 'hr' ? 'Пульс' : 'Шаги'}
            </span>
            <span className={`text-5xl sm:text-6xl font-bold tracking-tighter ${isCooldown ? 'text-blue-400' : 'text-white'}`}>
              {actualBpm || targetBpm}
            </span>
            <span className="text-gray-500 text-xs sm:text-sm mt-1">уд/мин</span>
          </div>

          {/* Mode Icon Badge */}
          <div className={`absolute -bottom-4 bg-gray-800 p-3 rounded-full border-4 border-black shadow-lg transition-transform ${isDragging ? 'scale-110' : ''}`}>
            {mode === 'fixed' && <Music className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />}
            {mode === 'hr' && <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" />}
            {mode === 'steps' && <Footprints className="w-5 h-5 sm:w-6 sm:h-6 text-green-400" />}
          </div>
        </div>

        <div className="flex-1 flex justify-center">
          {isInteractive ? (
            <button
              onClick={(e) => { e.stopPropagation(); onChangeBpm?.(Math.min(200, targetBpm + 1)); }}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gray-800/30 backdrop-blur-md border border-gray-700/50 flex items-center justify-center text-2xl sm:text-3xl font-bold hover:bg-gray-700/50 text-gray-300 z-10 active:scale-95 transition-transform shadow-lg"
            >
              +
            </button>
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 opacity-0 pointer-events-none" />
          )}
        </div>
      </div>

      {isCooldown && (
        <div className="mt-8 px-4 py-2 bg-blue-500/20 text-blue-300 rounded-full text-sm font-medium animate-pulse">
          Режим заминки: снижение темпа
        </div>
      )}
    </div>
  );
}
