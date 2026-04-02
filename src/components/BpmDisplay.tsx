import { Settings, Activity, Footprints, Music } from 'lucide-react';

interface BpmDisplayProps {
  mode: 'fixed' | 'hr' | 'steps';
  targetBpm: number;
  actualBpm: number | null;
  isCooldown: boolean;
}

export function BpmDisplay({ mode, targetBpm, actualBpm, isCooldown }: BpmDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* Outer animated ring */}
        <div className={`absolute inset-0 rounded-full border-4 ${isCooldown ? 'border-blue-500/30' : 'border-red-500/30'} animate-[spin_10s_linear_infinite]`} />
        <div className={`absolute inset-2 rounded-full border-4 border-dashed ${isCooldown ? 'border-blue-500/40' : 'border-red-500/40'} animate-[spin_15s_linear_infinite_reverse]`} />
        
        {/* Inner circle */}
        <div className={`absolute inset-6 rounded-full ${isCooldown ? 'bg-blue-500/10' : 'bg-red-500/10'} backdrop-blur-sm flex flex-col items-center justify-center shadow-[inset_0_0_50px_rgba(0,0,0,0.1)]`}>
          <span className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1">
            {mode === 'fixed' ? 'Целевой BPM' : mode === 'hr' ? 'Пульс' : 'Шаги'}
          </span>
          <span className={`text-6xl font-bold tracking-tighter ${isCooldown ? 'text-blue-400' : 'text-white'}`}>
            {actualBpm || targetBpm}
          </span>
          <span className="text-gray-500 text-sm mt-1">уд/мин</span>
        </div>

        {/* Mode Icon Badge */}
        <div className="absolute -bottom-4 bg-gray-800 p-3 rounded-full border-4 border-black shadow-lg">
          {mode === 'fixed' && <Music className="w-6 h-6 text-blue-400" />}
          {mode === 'hr' && <Activity className="w-6 h-6 text-red-400" />}
          {mode === 'steps' && <Footprints className="w-6 h-6 text-green-400" />}
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
