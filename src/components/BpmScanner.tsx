import React, { useState, useRef } from 'react';
import { analyze } from 'web-audio-beat-detector';
import { ID3Writer } from 'browser-id3-writer';
import { Activity, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface ScanResult {
  name: string;
  status: 'pending' | 'scanning' | 'writing' | 'success' | 'error';
  bpm?: number;
  error?: string;
}

export function BpmScanner({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expectedTempo, setExpectedTempo] = useState<'auto' | 'slow' | 'fast'>('auto');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustBpm = (detectedBpm: number, tempoPreference: 'auto' | 'slow' | 'fast') => {
    let finalBpm = detectedBpm;
    if (tempoPreference === 'slow' && finalBpm > 105) {
      finalBpm = Math.round(finalBpm / 2);
    } else if (tempoPreference === 'fast' && finalBpm < 95) {
      finalBpm = Math.round(finalBpm * 2);
    }
    return finalBpm;
  };

  const processFilesFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    
    setIsProcessing(true);
    const initialResults = files.map(f => ({
      name: f.name,
      status: 'pending' as const
    }));
    setResults(initialResults);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'scanning' } : r));
        
        let audioContext: AudioContext | null = null;
        try {
          audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = await file.arrayBuffer();
          
          // 1. Detect BPM
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
          const tempo = await analyze(audioBuffer);
          const roundedBpm = adjustBpm(Math.round(tempo), expectedTempo);

          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'writing', bpm: roundedBpm } : r));

          // 2. Write ID3 Tag
          const writer = new ID3Writer(arrayBuffer);
          writer.setFrame('TBPM', roundedBpm);
          writer.addTag();
          const taggedBuffer = (writer as any).arrayBuffer;

          // 3. Download the modified file
          const blob = new Blob([taggedBuffer], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          // Небольшая задержка, чтобы браузер не заблокировал множественные скачивания
          await new Promise(r => setTimeout(r, 800));

          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'success' } : r));
        } catch (err: any) {
          console.error(`Error processing ${file.name}:`, err);
          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: err.message } : r));
        } finally {
          if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close().catch(console.error);
          }
        }
      }
    } catch (err: any) {
      console.error("Error in fallback processing:", err);
      alert("Произошла ошибка: " + err.message);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const processFiles = async () => {
    try {
      const isIframe = window.self !== window.top;
      
      if ('showOpenFilePicker' in window && !isIframe) {
        setIsProcessing(true);
        const handles = await (window as any).showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'MP3 Audio Files',
            accept: { 'audio/mpeg': ['.mp3'] }
          }]
        });

        const initialResults = handles.map((h: any) => ({
          name: h.name,
          status: 'pending'
        }));
        setResults(initialResults);

        for (let i = 0; i < handles.length; i++) {
          const handle = handles[i];
          
          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'scanning' } : r));
          
          let audioContext: AudioContext | null = null;
          try {
            const file = await handle.getFile();
            const arrayBuffer = await file.arrayBuffer();
            
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            
            // 1. Detect BPM
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
            const tempo = await analyze(audioBuffer);
            const roundedBpm = adjustBpm(Math.round(tempo), expectedTempo);

            setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'writing', bpm: roundedBpm } : r));

            // 2. Write ID3 Tag
            const writer = new ID3Writer(arrayBuffer);
            writer.setFrame('TBPM', roundedBpm);
            writer.addTag();
            const taggedBuffer = (writer as any).arrayBuffer;

            // 3. Save back to file
            try {
              const writable = await handle.createWritable();
              await writable.write(taggedBuffer);
              await writable.close();
            } catch (writeErr: any) {
              console.warn(`Failed to write directly to ${handle.name}, falling back to download:`, writeErr);
              // Fallback to download if direct write fails (e.g., permission denied for subsequent files)
              const blob = new Blob([taggedBuffer], { type: 'audio/mpeg' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.name;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              
              await new Promise(r => setTimeout(r, 800));
            }

            setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'success' } : r));
          } catch (err: any) {
            console.error(`Error processing ${handle.name}:`, err);
            setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: err.message } : r));
          } finally {
            if (audioContext && audioContext.state !== 'closed') {
              await audioContext.close().catch(console.error);
            }
          }
        }
        setIsProcessing(false);
      } else {
        fileInputRef.current?.click();
      }
    } catch (err: any) {
      setIsProcessing(false);
      if (err.name !== 'AbortError') {
        console.error("Failed to open file picker:", err);
        fileInputRef.current?.click();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-400" />
            BPM Сканер
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          <p className="text-gray-400 text-sm mb-6">
            Этот инструмент проанализирует ваши MP3 файлы, определит их темп (BPM) и запишет результат прямо в ID3 теги файла.
            <br/><br/>
            <span className="text-yellow-500">Внимание: Прямая перезапись файлов поддерживается только в браузерах Chrome/Edge на ПК. В других случаях (или если браузер заблокирует запись множества файлов) файлы с обновленными тегами будут скачаны.</span>
          </p>

          {!isProcessing && results.length === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Ожидаемый темп (помогает избежать ошибок х2)</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setExpectedTempo('auto')}
                    className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors ${expectedTempo === 'auto' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    Авто
                  </button>
                  <button
                    onClick={() => setExpectedTempo('slow')}
                    className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors ${expectedTempo === 'slow' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    Медленный (&lt;100)
                  </button>
                  <button
                    onClick={() => setExpectedTempo('fast')}
                    className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors ${expectedTempo === 'fast' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    Быстрый (&gt;100)
                  </button>
                </div>
              </div>

              <button
                onClick={processFiles}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Activity className="w-5 h-5" />
                Выбрать файлы и начать
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={processFilesFallback}
                multiple
                accept="audio/mpeg"
                className="hidden"
              />
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((result, idx) => (
                <div key={idx} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-medium text-white truncate">{result.name}</p>
                    <p className="text-xs text-gray-400">
                      {result.status === 'pending' && 'Ожидание...'}
                      {result.status === 'scanning' && 'Анализ аудио...'}
                      {result.status === 'writing' && 'Запись тегов...'}
                      {result.status === 'success' && <span className="text-green-400">Готово ({result.bpm} BPM)</span>}
                      {result.status === 'error' && <span className="text-red-400" title={result.error}>Ошибка: {result.error}</span>}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {(result.status === 'scanning' || result.status === 'writing') && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
                    {result.status === 'success' && <CheckCircle className="w-5 h-5 text-green-400" />}
                    {result.status === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {results.length > 0 && !isProcessing && (
          <div className="p-4 border-t border-gray-800 shrink-0">
            <button
              onClick={onClose}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
