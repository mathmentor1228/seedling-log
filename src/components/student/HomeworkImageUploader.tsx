// STUDENT-APP-V1: Multi-image uploader with compression, preview, and delete
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Camera, X, Loader2 } from 'lucide-react';
import { compressImage } from '@/lib/imageCompression';

const MAX_FILES = 30;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB before compression

interface ImageItem {
  id: string;
  file: File;
  preview: string;
}

interface HomeworkImageUploaderProps {
  images: ImageItem[];
  onImagesChange: (images: ImageItem[]) => void;
  disabled?: boolean;
}

export type { ImageItem };

export default function HomeworkImageUploader({
  images,
  onImagesChange,
  disabled = false,
}: HomeworkImageUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';

    const remaining = MAX_FILES - images.length;
    if (remaining <= 0) {
      toast({
        title: '최대 개수 초과',
        description: `사진은 최대 ${MAX_FILES}장까지 업로드할 수 있습니다.`,
        variant: 'destructive',
      });
      return;
    }

    const selected = files.slice(0, remaining);
    if (files.length > remaining) {
      toast({
        title: '일부만 추가됨',
        description: `최대 ${MAX_FILES}장까지만 가능합니다. ${remaining}장만 추가됩니다.`,
      });
    }

    // Validate types
    const validFiles = selected.filter((f) => {
      if (!f.type.startsWith('image/')) {
        toast({
          title: '지원하지 않는 형식',
          description: `${f.name}은(는) 이미지 파일이 아닙니다.`,
          variant: 'destructive',
        });
        return false;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast({
          title: '용량 초과',
          description: `${f.name}의 크기가 10MB를 초과합니다.`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    });

    if (!validFiles.length) return;

    setIsCompressing(true);
    try {
      const newItems: ImageItem[] = [];
      for (const file of validFiles) {
        const compressed = await compressImage(file);
        const preview = URL.createObjectURL(compressed);
        newItems.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: compressed,
          preview,
        });
      }
      onImagesChange([...images, ...newItems]);
    } catch {
      toast({
        title: '압축 실패',
        description: '이미지 압축 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsCompressing(false);
    }
  };

  const removeImage = (id: string) => {
    const item = images.find((i) => i.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    onImagesChange(images.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((item) => (
            <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden border">
              <img
                src={item.preview}
                alt="미리보기"
                className="w-full h-full object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6"
                onClick={() => removeImage(item.id)}
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {images.length < MAX_FILES && (
        <Button
          variant="outline"
          className="w-full h-24 flex flex-col gap-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isCompressing}
        >
          {isCompressing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">압축 중...</span>
            </>
          ) : (
            <>
              <Camera className="w-6 h-6" />
              <span className="text-xs">
                사진 촬영 / 선택 ({images.length}/{MAX_FILES})
              </span>
            </>
          )}
        </Button>
      )}
    </div>
  );
}
