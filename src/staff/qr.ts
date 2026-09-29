import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

const COLORS = { dark: '#140f0cff', light: '#ffffffff' };

/** Link encoded in a table's QR code. */
export const tableQrUrl = (base: string, code: string) => `${base}/t/${code}`;
/** Link encoded in the general (entrance) QR code: guests then enter their table number. */
export const generalQrUrl = (base: string) => `${base}/table?src=qr`;

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: COLORS });
}

export function qrPngDataUrl(text: string, width = 1200): Promise<string> {
  return QRCode.toDataURL(text, { width, margin: 2, errorCorrectionLevel: 'M', color: COLORS });
}

export function useQrSvg(text: string | null): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    if (text) void qrSvg(text).then((s) => !cancelled && setSvg(s));
    return () => {
      cancelled = true;
    };
  }, [text]);
  return svg;
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
