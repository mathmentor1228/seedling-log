// MATH-QUESTION-ROOM-IMAGE-VIEWER-V1: Zoom, rotate, pan image viewer modal
import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, X, Maximize2 } from 'lucide-react';

interface ImageViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt?: string;
}

export default function ImageViewerModal({ open, onOpenChange, src, alt }: ImageViewerModalProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const zoomIn = () => setScale(s => Math.min(s + 0.5, 5));
  const zoomOut = () => {
    setScale(s => {
      const next = Math.max(s - 0.5, 0.5);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  };
  const rotateRight = () => setRotation(r => r + 90);
  const rotateLeft = () => setRotation(r => r - 90);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setScale(s => {
      const next = Math.max(0.5, Math.min(s + delta, 5));
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [scale, translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTranslate({ x: dragStart.current.tx + dx, y: dragStart.current.ty + dy });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (scale > 1) reset();
    else setScale(2.5);
  }, [scale, reset]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-black/95 border-0 [&>button]:hidden">
        {/* Controls */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={zoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-white text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={zoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-white/30 mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={rotateLeft}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          <span className="text-white text-xs w-10 text-center">{rotation % 360}°</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={rotateRight}>
            <RotateCw className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-white/30 mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={reset}>
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 z-20 h-8 w-8 text-white hover:bg-white/20 rounded-full"
          onClick={() => handleOpenChange(false)}
        >
          <X className="w-5 h-5" />
        </Button>

        {/* Image */}
        <div
          className="w-full h-[90vh] flex items-center justify-center overflow-hidden select-none"
          style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          <img
            src={src}
            alt={alt || '이미지'}
            className="max-w-full max-h-full object-contain transition-transform duration-150"
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
              pointerEvents: 'none',
            }}
            draggable={false}
          />
        </div>

        {/* Hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/50 text-[10px]">
          더블클릭: 확대/초기화 · 스크롤: 줌 · 드래그: 이동
        </div>
      </DialogContent>
    </Dialog>
  );
}
