// TEACHER-HW-SUBMISSION-VIEW-V2: Carousel for viewing multiple student submission images
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface SubmissionImageCarouselProps {
  images: string[];
  submittedAt?: string | null;
  note?: string | null;
}

export default function SubmissionImageCarousel({ images, submittedAt, note }: SubmissionImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goTo = (idx: number) => {
    if (idx >= 0 && idx < images.length) setCurrentIndex(idx);
  };

  return (
    <div className="space-y-4">
      {/* Main image with navigation */}
      <div className="relative">
        <img
          src={images[currentIndex]}
          alt={`숙제 인증 ${currentIndex + 1}`}
          className="w-full rounded-lg max-h-[60vh] object-contain bg-muted"
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
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-80 hover:opacity-100"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-80 hover:opacity-100"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === images.length - 1}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>

            {/* Page indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
              {currentIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
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
