import { CameraOff, Hash, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Notice, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useSite } from '@/lib/queries';
import { parseQrPayload, type QrPayload } from './table';

type Detect = (video: HTMLVideoElement) => Promise<string | null>;

type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

/** Native BarcodeDetector where available (Android/Chrome), jsQR everywhere else (iOS, desktop). */
async function createDetector(): Promise<Detect> {
  const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes('qr_code')) {
        const detector = new Native({ formats: ['qr_code'] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      /* fall back to jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 800 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  };
}

type Status = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'insecure';

/**
 * In-site QR scanner. The camera is requested only when this component mounts,
 * i.e. right after the guest taps "Scan". Manual entry is always offered.
 */
export default function QrScanner({
  onDetected,
  onCancel,
  onUseNumber,
}: {
  onDetected: (payload: Extract<QrPayload, { kind: 'table' } | { kind: 'general' }>) => void;
  onCancel: () => void;
  onUseNumber: () => void;
}) {
  const { t } = useI18n();
  const site = useSite();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [warning, setWarning] = useState<string | null>(null);
  const publicUrl = site.data?.publicUrl ?? null;
  const callbacks = useRef({ onDetected });
  callbacks.current = { onDetected };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    (async () => {
      if (!window.isSecureContext) return setStatus('insecure');
      if (!navigator.mediaDevices?.getUserMedia) return setStatus('unavailable');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        const name = (err as DOMException).name;
        return setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
      if (stopped) return stream.getTracks().forEach((track) => track.stop());
      const video = videoRef.current!;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay of a muted inline video is allowed; ignore */
      }
      setStatus('scanning');
      const detect = await createDetector();

      const tick = async () => {
        if (stopped) return;
        let text: string | null = null;
        try {
          text = await detect(video);
        } catch {
          text = null;
        }
        if (text) {
          const payload = parseQrPayload(text, publicUrl);
          if (payload.kind === 'table' || payload.kind === 'general') {
            stop();
            callbacks.current.onDetected(payload);
            return;
          }
          setWarning(payload.kind === 'foreign' ? t.table.foreignQr : t.table.notTableQr);
        }
        timer = window.setTimeout(() => void tick(), 160);
      };
      void tick();
    })();

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failed = status === 'denied' || status === 'unavailable' || status === 'insecure';
  return (
    <div className="space-y-4" data-testid="qr-scanner">
      {failed ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-ink-900 px-6 py-10 text-center text-cream-50">
          <CameraOff className="size-10 text-gold-400" aria-hidden />
          <p className="max-w-sm leading-relaxed">
            {status === 'denied' ? t.table.cameraDenied : status === 'insecure' ? t.table.cameraInsecure : t.table.cameraUnavailable}
          </p>
        </div>
      ) : (
        <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-ink-950 sm:aspect-video">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay aria-label={t.table.cameraTitle} />
          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center text-cream-100">
              <Spinner label={t.table.cameraStarting} />
            </div>
          )}
          {status === 'scanning' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <div className="relative size-[62%] max-w-72">
                {['top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'].map(
                  (c) => (
                    <span key={c} className={`absolute size-10 border-gold-400 ${c}`} />
                  ),
                )}
                <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-gold-400/80 shadow-[0_0_18px_rgba(222,184,119,0.9)]" />
              </div>
            </div>
          )}
          <p className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink-950/85 to-transparent px-4 pt-10 pb-4 text-center text-sm text-cream-50">
            {t.table.cameraHint}
          </p>
        </div>
      )}
      {warning && <Notice tone="warn">{warning}</Notice>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="dark" size="lg" className="flex-1" onClick={onUseNumber}>
          <Hash className="size-4.5" aria-hidden />
          {t.table.useNumber}
        </Button>
        <Button variant="outline-dark" size="lg" onClick={onCancel}>
          <X className="size-4.5" aria-hidden />
          {t.table.stopCamera}
        </Button>
      </div>
    </div>
  );
}
