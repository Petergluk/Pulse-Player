import { useState, useEffect, useCallback } from 'react';

export function usePedometer() {
  const [stepsBpm, setStepsBpm] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTracking = useCallback(async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        if (permission !== 'granted') {
          setError('Доступ к датчикам движения запрещен');
          return;
        }
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }
    
    if (!window.DeviceMotionEvent) {
      setError('Акселерометр не поддерживается на этом устройстве');
      return;
    }

    setIsTracking(true);
    setError(null);
  }, []);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    setStepsBpm(null);
  }, []);

  useEffect(() => {
    if (!isTracking) return;

    let lastPeakTime = 0;
    let stepTimes: number[] = [];
    
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
      
      const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      
      // Простой алгоритм детекции шагов (пиков ускорения)
      // В реальности требуется фильтрация нижних частот
      if (mag > 12) { 
        const now = Date.now();
        if (now - lastPeakTime > 300) { // Debounce 300ms (max ~200 steps/min)
          lastPeakTime = now;
          stepTimes.push(now);
          if (stepTimes.length > 10) stepTimes.shift(); // Храним последние 10 шагов
          
          if (stepTimes.length > 1) {
            const duration = (stepTimes[stepTimes.length - 1] - stepTimes[0]) / 1000 / 60; // в минутах
            if (duration > 0) {
              const currentBpm = Math.round((stepTimes.length - 1) / duration);
              if (currentBpm > 40 && currentBpm < 220) {
                setStepsBpm(currentBpm);
              }
            }
          }
        }
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isTracking]);

  return { stepsBpm, startTracking, stopTracking, isTracking, error };
}
