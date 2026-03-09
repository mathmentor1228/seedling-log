import logoImg from '@/assets/logo-thementor.png';

export function BrandFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30 py-4 px-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <img src={logoImg} alt="더 멘토 학원 로고" className="h-10 w-auto object-contain" />
        <p className="text-xs text-muted-foreground text-center sm:text-right">
          더 멘토 학원 | 대표: 황은지 &nbsp;Copyright © {year}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
