// TEACHER-HW-SUBMISSION-VIEW-V2: Carousel for viewing multiple student submission images with zoom
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

interface SubmissionImageCarouselProps {
  images: string[];
  submittedAt?: string | null;
  note?: string | null;
}

export default function SubmissionImageCarousel({ images, submittedAt, note }: SubmissionImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const goTo = (idx: number) => {
    if (idx >= 0 && idx < images.length) {
      setCurrentIndex(idx);
      resetZoom();
    }
  };

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const zoomIn = () => setScale((s) => Math.min(s + 0.5, 5));
  const zoomOut = () => {
    setScale((s) => {
      const next = Math.max(s - 0.5, 1);
      if (next === 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setScale((s) => {
      const next = Math.max(1, Math.min(s + delta, 5));
      if (next === 1) setTranslate({ x: 0, y: 0 });
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
    if (scale > 1) {
      resetZoom();
    } else {
      setScale(2.5);
    }
  }, [scale, resetZoom]);

  return (
    <div className="space-y-3">
      {/* Zoom controls */}
      <div className="flex items-center justify-end gap-1">
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={zoomOut} disabled={scale <= 1}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={zoomIn} disabled={scale >= 5}>
          <ZoomIn className="w-4 h-4" />
        </Button>
        {scale > 1 && (
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={resetZoom}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Main image with navigation */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg bg-muted select-none"
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={images[currentIndex]}
          alt={`숙제 인증 ${currentIndex + 1}`}
          className="w-full max-h-[60vh] object-contain transition-transform duration-150"
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            pointerEvents: 'none',
          }}
          draggable={false}
          onError={(e) => {
            e.currentTarget.src = '';
            e.currentTarget.alt = '이미지를 불러올 수 없습니다';
          }}
        />

        {images.length > 1 && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-80 hover:opacity-100 z-10"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-80 hover:opacity-100 z-10"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === images.length - 1}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>

            {/* Page indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-1 rounded-full z-10">
              {currentIndex + 1} / {images.length}
            </div>
          </>
        )}

        {/* Zoom hint */}
        {scale === 1 && (
          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full z-10">
            더블클릭 또는 스크롤로 확대
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => { setCurrentIndex(idx); resetZoom(); }}
              className={`w-16 h-16 rounded border-2 overflow-hidden flex-shrink-0 transition-all ${
                idx === currentIndex ? 'border-primary ring-1 ring-primary' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={url} alt={`썸네일 ${idx + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Meta info */}
      <div className="text-sm text-muted-foreground space-y-1">
        {submittedAt && (
          <p>
            <span className="font-medium">제출 시간:</span>{' '}
            {format(new Date(submittedAt), 'yyyy-MM-dd HH:mm')}
          </p>
        )}
        {note && (
          <p>
            <span className="font-medium">학생 메모:</span> {note}
          </p>
        )}
      </div>
    </div>
  );
}
