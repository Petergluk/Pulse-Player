import { useState, useCallback } from 'react';

export function useHeartRate() {
  const [hr, setHr] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(async () => {
    if (!(navigator as any).bluetooth) {
      setError('Web Bluetooth не поддерживается в этом браузере. Используйте Chrome на Android, Windows или macOS.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
      });
      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService('heart_rate');
      const characteristic = await service?.getCharacteristic('heart_rate_measurement');
      
      await characteristic?.startNotifications();
      setIsConnected(true);
      
      characteristic?.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const flags = value.getUint8(0);
        const rate16Bits = flags & 0x1;
        let heartRate;
        if (rate16Bits) {
          heartRate = value.getUint16(1, /*littleEndian=*/true);
        } else {
          heartRate = value.getUint8(1);
        }
        setHr(heartRate);
      });

      device.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setHr(null);
      });

    } catch (err: any) {
      setError(err.message);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    // In a real app we'd keep the device reference to disconnect properly
    setIsConnected(false);
    setHr(null);
  }, []);

  return { hr, connect, disconnect, isConnecting, isConnected, error };
}
