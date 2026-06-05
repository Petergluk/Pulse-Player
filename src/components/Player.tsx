import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, ChevronUp, ChevronDown } from 'lucide-react';
import { Track } from '../hooks/useJamendo';
import { motion } from 'motion/react';

interface PlayerProps {
  currentTrack: Track | null;
  onNextTrack: (manual?: boolean) => void;
  crossfadeDuration?: number;
}

export function Player({ currentTrack, onNextTrack, crossfadeDuration = 0 }: PlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const audio1Ref = useRef<HTMLAudioElement | null>(null);
  const audio2Ref = useRef<HTMLAudioElement | null>(null);
  const [activePlayer, setActivePlayer] = useState<1 | 2>(1);
  const [track1, setTrack1] = useState<Track | null>(currentTrack);
  const [track2, setTrack2] = useState<Track | null>(null);
  
  const isTransitioningRef = useRef(false);
  const fadeIntervalRef = useRef<any>(null);
  const hasInteracted = useRef(false);

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const markInteracted = () => {
      hasInteracted.current = true;
      window.removeEventListener('click', markInteracted);
      window.removeEventListener('touchstart', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
    window.addEventListener('click', markInteracted);
    window.addEventListener('touchstart', markInteracted);
    window.addEventListener('keydown', markInteracted);
    return () => {
      window.removeEventListener('click', markInteracted);
      window.removeEventListener('touchstart', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
  }, []);

  // Handle track changes and crossfading
  useEffect(() => {
    if (!currentTrack) return;
    
    // Reset transition flag when a new track arrives
    isTransitioningRef.current = false;
    
    // Determine which player is next
    const isPlayer1Active = activePlayer === 1;
    // If the current track is already loaded in the active player, do nothing (initial load)
    if (isPlayer1Active && track1?.id === currentTrack.id) return;
    if (!isPlayer1Active && track2?.id === currentTrack.id) return;

    const prevAudio = isPlayer1Active ? audio1Ref.current : audio2Ref.current;
    const nextAudio = isPlayer1Active ? audio2Ref.current : audio1Ref.current;
    const nextPlayer = isPlayer1Active ? 2 : 1;
    
    if (nextPlayer === 1) setTrack1(currentTrack);
    else setTrack2(currentTrack);
    
    if (nextAudio) {
      nextAudio.src = currentTrack.audio;
      
      // Prevent autoplay if user hasn't interacted yet to comply with browser policies
      if (!hasInteracted.current) {
        setActivePlayer(nextPlayer);
        setIsPlaying(false);
        return;
      }

      // If we are crossfading and currently playing, start next audio at volume 0
      const shouldCrossfade = crossfadeDuration > 0 && isPlaying && prevAudio && !prevAudio.paused;
      nextAudio.volume = shouldCrossfade ? 0 : 1;
      
      nextAudio.play().then(() => {
        setIsPlaying(true);
        setActivePlayer(nextPlayer);
        
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        
        if (shouldCrossfade && prevAudio) {
          const stepMs = 50;
          const fadeAmount = stepMs / (crossfadeDuration * 1000);
          
          fadeIntervalRef.current = setInterval(() => {
            let done = false;
            
            // Fade out previous
            if (prevAudio.volume - fadeAmount > 0) {
              prevAudio.volume -= fadeAmount;
            } else {
              prevAudio.volume = 0;
              prevAudio.pause();
              done = true;
            }
            
            // Fade in next
            if (nextAudio.volume + fadeAmount < 1) {
              nextAudio.volume += fadeAmount;
            } else {
              nextAudio.volume = 1;
            }
            
            if (done) clearInterval(fadeIntervalRef.current);
          }, stepMs);
        } else if (prevAudio) {
          prevAudio.pause();
          prevAudio.volume = 1;
        }
      }).catch((e) => {
        if (e.name === 'AbortError') {
          // Play request was interrupted by a call to pause() or a new track load.
          // This is expected during rapid track changes or play/pause toggles.
          return;
        }
        console.error("Playback failed:", e);
        setIsPlaying(false);
        setActivePlayer(nextPlayer);
      });
    }
  }, [currentTrack, crossfadeDuration]); // Intentionally omitting activePlayer/track1/track2 to avoid loops

  // Handle time updates and automatic crossfade trigger
  useEffect(() => {
    const activeAudio = activePlayer === 1 ? audio1Ref.current : audio2Ref.current;
    if (!activeAudio) return;

    const updateProgress = () => {
      setProgress((activeAudio.currentTime / activeAudio.duration) * 100 || 0);
      setCurrentTime(activeAudio.currentTime || 0);
      setDuration(activeAudio.duration || 0);
      
      // Trigger crossfade before the track ends
      if (crossfadeDuration > 0 && activeAudio.duration > 0) {
        const timeRemaining = activeAudio.duration - activeAudio.currentTime;
        if (timeRemaining <= crossfadeDuration && !isTransitioningRef.current) {
          isTransitioningRef.current = true;
          onNextTrack(false);
        }
      }
    };

    const handleEnded = () => {
      if (!isTransitioningRef.current) {
        isTransitioningRef.current = true;
        onNextTrack(false);
      }
    };

    activeAudio.addEventListener('timeupdate', updateProgress);
    activeAudio.addEventListener('ended', handleEnded);

    return () => {
      activeAudio.removeEventListener('timeupdate', updateProgress);
      activeAudio.removeEventListener('ended', handleEnded);
    };
  }, [activePlayer, onNextTrack, crossfadeDuration]);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    hasInteracted.current = true;
    const activeAudio = activePlayer === 1 ? audio1Ref.current : audio2Ref.current;
    if (!activeAudio || !currentTrack) return;
    
    if (isPlaying) {
      activeAudio.pause();
      setIsPlaying(false);
    } else {
      activeAudio.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        if (err.name === 'AbortError') return;
        console.error("Manual playback failed:", err);
        setIsPlaying(false);
      });
    }
  };

  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.y < -50) {
      setIsExpanded(true);
    } else if (info.offset.y > 50) {
      setIsExpanded(false);
    }
  };

  return (
    <>
      {/* Spacer to prevent content from being hidden behind the compact player */}
      <div className="h-24 shrink-0" />

      <motion.div 
        className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40 flex flex-col overflow-hidden max-w-md mx-auto"
        animate={{ height: isExpanded ? '75dvh' : '96px' }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
      >
        <audio ref={audio1Ref} />
        <audio ref={audio2Ref} />

        {/* Drag Handle & Compact View Area */}
        <div 
          className="w-full flex flex-col cursor-pointer shrink-0"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="w-full flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-gray-700 rounded-full" />
          </div>

          {/* Compact View Content */}
          <div className={`px-4 pb-4 flex items-center gap-3 transition-opacity duration-300 ${isExpanded ? 'opacity-0 h-0 overflow-hidden pb-0' : 'opacity-100'}`}>
            {currentTrack ? (
              <>
                <img 
                  src={currentTrack.image || 'https://picsum.photos/seed/music/100/100'} 
                  alt="Cover" 
                  className="w-12 h-12 rounded-lg object-cover shadow-md shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="font-semibold text-sm truncate">{currentTrack.name}</h3>
                  <p className="text-gray-400 text-xs truncate">{currentTrack.artist_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={togglePlay}
                    disabled={!currentTrack}
                    className="w-12 h-12 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-transform active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onNextTrack(true); }}
                    disabled={!currentTrack}
                    className="w-12 h-12 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-full transition-transform active:scale-95"
                  >
                    <SkipForward className="w-5 h-5 fill-current" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-lg bg-gray-800 animate-pulse shrink-0" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-800 rounded w-3/4 mb-2 animate-pulse" />
                  <div className="h-3 bg-gray-800 rounded w-1/2 animate-pulse" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Expanded View Content */}
        <div className={`flex-1 min-h-0 px-6 pb-6 flex flex-col transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {currentTrack ? (
            <>
              <div className="flex-1 min-h-0 flex items-center justify-center py-2">
                <img 
                  src={currentTrack.image || 'https://picsum.photos/seed/music/400/400'} 
                  alt="Cover" 
                  className="h-full max-w-full object-contain rounded-2xl shadow-2xl"
                  style={{ aspectRatio: '1 / 1' }}
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="mb-4 text-center shrink-0">
                <h3 className="font-bold text-xl truncate mb-1">{currentTrack.name}</h3>
                <p className="text-gray-400 text-base truncate mb-2">{currentTrack.artist_name}</p>
                <div className="inline-block px-3 py-1 bg-gray-800 rounded-full text-xs font-medium text-gray-300">
                  {currentTrack.bpm} BPM
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 min-h-0 flex items-center justify-center py-2">
                <div 
                  className="h-full max-w-full rounded-2xl bg-gray-800 animate-pulse" 
                  style={{ aspectRatio: '1 / 1' }}
                />
              </div>
              <div className="mb-4 flex flex-col items-center shrink-0">
                <div className="h-7 bg-gray-800 rounded w-3/4 mb-2 animate-pulse" />
                <div className="h-5 bg-gray-800 rounded w-1/2 mb-2 animate-pulse" />
                <div className="h-6 bg-gray-800 rounded-full w-20 animate-pulse" />
              </div>
            </>
          )}

          {/* Progress Bar */}
          <div className="mb-5 shrink-0">
            <div className="relative flex items-center h-6 group">
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={progress || 0}
                onChange={(e) => {
                  const activeAudio = activePlayer === 1 ? audio1Ref.current : audio2Ref.current;
                  if (activeAudio && activeAudio.duration) {
                    const newTime = (Number(e.target.value) / 100) * activeAudio.duration;
                    activeAudio.currentTime = newTime;
                    setProgress(Number(e.target.value));
                    setCurrentTime(newTime);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-100 ease-linear group-hover:bg-blue-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* Thumb */}
              <div 
                className="absolute h-3 w-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform pointer-events-none"
                style={{ left: `calc(${progress || 0}% - 6px)` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 font-medium px-1 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between px-4 shrink-0">
            <button 
              onClick={() => {
                const newMuted = !isMuted;
                setIsMuted(newMuted);
                if (audio1Ref.current) audio1Ref.current.muted = newMuted;
                if (audio2Ref.current) audio2Ref.current.muted = newMuted;
              }}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>
            
            <button 
              onClick={togglePlay}
              disabled={!currentTrack}
              className="w-[72px] h-[72px] flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-transform active:scale-95 disabled:opacity-50 disabled:hover:bg-blue-500 shadow-lg shadow-blue-500/20 shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-current" />
              ) : (
                <Play className="w-8 h-8 fill-current ml-1" />
              )}
            </button>
            
            <button 
              onClick={() => onNextTrack(true)}
              disabled={!currentTrack}
              className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <SkipForward className="w-8 h-8 fill-current" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
