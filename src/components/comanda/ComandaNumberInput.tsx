import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { parseComandaCode } from '@/utils/comandaCode';
import { toast } from 'sonner';

interface Props {
  onSubmit: (comandaNumber: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showCamera?: boolean;
  disabled?: boolean;
  submitLabel?: string;
}

/**
 * Campo de número da comanda: aceita digitação, leitor de código de barras
 * (teclado + Enter) e, opcionalmente, câmera do celular (ZXing — funciona no
 * Chrome/Android e no Safari/iPhone).
 */
export function ComandaNumberInput({
  onSubmit,
  placeholder = 'Nº da comanda ou código',
  autoFocus,
  showCamera,
  disabled,
  submitLabel = 'OK',
}: Props) {
  const [value, setValue] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  function submit(raw: string) {
    const n = parseComandaCode(raw);
    if (!n) {
      toast.error('Número de comanda inválido');
      return;
    }
    setValue('');
    onSubmit(n);
  }

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && !cancelled) {
            cancelled = true;
            controlsRef.current?.stop();
            setScanning(false);
            submit(result.getText());
          }
        });
        controlsRef.current = controls;
        if (cancelled) controls.stop();
      } catch (err) {
        console.error('[ComandaNumberInput] câmera', err);
        toast.error('Não foi possível abrir a câmera. Digite o número.');
        setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit(value);
            }
          }}
          inputMode="numeric"
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
        />
        {showCamera && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setScanning((s) => !s)}
            disabled={disabled}
            aria-label="Ler código com a câmera"
          >
            {scanning ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          </Button>
        )}
        <Button type="button" onClick={() => submit(value)} disabled={disabled || !value.trim()}>
          {submitLabel}
        </Button>
      </div>
      {scanning && (
        <video ref={videoRef} className="w-full rounded-md border bg-muted aspect-video object-cover" muted playsInline />
      )}
    </div>
  );
}
