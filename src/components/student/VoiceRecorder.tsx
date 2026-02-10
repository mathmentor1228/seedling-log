// VOICE-RECORD-V1: Voice recorder component for homework submission
import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Play, Pause, Trash2, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const MAX_DURATION_SEC = 300; // 5 minutes

export interface RecordedAudio {
  blob: Blob;
  url: string;
  duration: number; // seconds
}

interface VoiceRecorderProps {
  audio: RecordedAudio | null;
  onAudioChange: (audio: RecordedAudio | null) => void;
  disabled?: boolean;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceRecorder({ audio, onAudioChange, disabled = false }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (audio?.url) URL.revokeObjectURL(audio.url);
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm, fallback to mp4
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        onAudioChange({ blob, url, duration: elapsed });
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.start(1000); // collect every 1s
      setIsRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= MAX_DURATION_SEC) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, [elapsed, onAudioChange]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const deleteRecording = useCallback(() => {
    if (audio?.url) URL.revokeObjectURL(audio.url);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    onAudioChange(null);
    setPlayProgress(0);
    setIsPlaying(false);
    setElapsed(0);
  }, [audio, onAudioChange]);

  const togglePlayback = useCallback(() => {
    if (!audio) return;

    if (isPlaying && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(audio.url);
      audioPlayerRef.current.onended = () => {
        setIsPlaying(false);
        setPlayProgress(0);
      };
      audioPlayerRef.current.ontimeupdate = () => {
        if (audioPlayerRef.current && audio.duration > 0) {
          setPlayProgress((audioPlayerRef.current.currentTime / audio.duration) * 100);
        }
      };
    }

    audioPlayerRef.current.play();
    setIsPlaying(true);
  }, [audio, isPlaying]);

  const progressPercent = isRecording ? (elapsed / MAX_DURATION_SEC) * 100 : playProgress;

  // Recording state
  if (isRecording) {
    return (
      <div className="space-y-3 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm font-medium text-red-600">녹음 중</span>
          </div>
          <span className="text-sm font-mono text-muted-foreground">
            {formatTime(elapsed)} / {formatTime(MAX_DURATION_SEC)}
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
        <Button
          variant="destructive"
          className="w-full"
          onClick={stopRecording}
        >
          <Square className="w-4 h-4 mr-2" />
          녹음 중지
        </Button>
      </div>
    );
  }

  // Has recorded audio
  if (audio) {
    return (
      <div className="space-y-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">🎙️ 녹음 완료</span>
          <span className="text-xs text-muted-foreground">{formatTime(audio.duration)}</span>
        </div>
        <Progress value={playProgress} className="h-2" />
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={togglePlayback}
            disabled={disabled}
          >
            {isPlaying ? (
              <><Pause className="w-4 h-4 mr-2" /> 일시정지</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> 재생</>
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={deleteRecording}
            disabled={disabled}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Initial state - start recording button
  return (
    <Button
      variant="outline"
      className="w-full h-20 flex flex-col gap-1"
      onClick={startRecording}
      disabled={disabled}
    >
      <Mic className="w-6 h-6" />
      <span className="text-xs">음성 녹음 (최대 5분)</span>
    </Button>
  );
}
