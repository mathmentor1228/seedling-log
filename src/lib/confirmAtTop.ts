import { toast } from 'sonner';

// Blocking yes/no prompt shown as a persistent toast at the top of the screen.
// Resolves false on cancel or dismiss so nothing is saved without an explicit yes.
export function confirmAtTop(opts: { title: string; description: string; confirmLabel: string; cancelLabel?: string }): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const done = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
    toast.warning(opts.title, {
      description: opts.description,
      position: 'top-center',
      duration: Infinity,
      className: 'tuition-confirm-toast',
      action: { label: opts.confirmLabel, onClick: () => done(true) },
      cancel: { label: opts.cancelLabel ?? '취소', onClick: () => done(false) },
      onDismiss: () => done(false),
      onAutoClose: () => done(false),
    });
  });
}

// Keep a Radix dialog open while the user answers a top toast.
export function keepOpenOnToast(event: { target: EventTarget | null; preventDefault: () => void }) {
  if ((event.target as HTMLElement | null)?.closest?.('[data-sonner-toaster]')) event.preventDefault();
}
