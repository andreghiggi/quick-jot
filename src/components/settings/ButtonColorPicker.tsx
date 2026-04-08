import { useState, useRef, useCallback, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette, Upload, Pipette, X, RotateCcw } from 'lucide-react';

interface ButtonColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

const DEFAULT_BUTTON_COLOR = '#ef4444';

export function ButtonColorPicker({ value, onChange }: ButtonColorPickerProps) {
  const effectiveValue = value || DEFAULT_BUTTON_COLOR;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = 400;
      const scale = Math.min(maxW / img.width, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
    };
    img.src = url;
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(c => c.toString(16).padStart(2, '0')).join('');
    onChange(hex);
  }, [onChange]);

  const handleReset = () => {
    onChange(DEFAULT_BUTTON_COLOR);
  };

  const handleRemoveImage = () => {
    setImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Cor dos Botões
        </CardTitle>
        <CardDescription>
          Carregue a sua logomarca e extraia a cor desejada para personalizar os botões do seu cardápio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Color preview */}
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-xl border-2 border-border shadow-sm"
            style={{ backgroundColor: effectiveValue }}
          />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Cor selecionada: {effectiveValue}
            </p>
            <p className="text-xs text-muted-foreground">
              {effectiveValue === DEFAULT_BUTTON_COLOR
                ? 'Cor padrão do sistema (vermelho)'
                : 'Esta cor será aplicada aos botões e à área de novidades do cardápio'}
            </p>
          </div>
          {effectiveValue !== DEFAULT_BUTTON_COLOR && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
              <RotateCcw className="w-4 h-4 mr-1" />
              Resetar
            </Button>
          )}
        </div>

        {/* Image eyedropper */}
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          {!imageUrl ? (
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              Enviar Imagem
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Pipette className="w-4 h-4" />
                  Clique na imagem para escolher a cor
                </p>
                <Button variant="ghost" size="sm" onClick={handleRemoveImage}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="w-full border rounded-lg cursor-crosshair"
                style={{ maxHeight: 300, objectFit: 'contain' }}
              />
            </div>
          )}
        </div>

        {/* Preview button */}
        <div className="space-y-2">
          <Label className="text-sm">Prévia do Botão</Label>
          <div className="flex gap-3">
            <button
              className="px-6 py-2.5 rounded-lg text-white font-medium text-sm shadow-sm"
              style={{ backgroundColor: effectiveValue }}
            >
              Adicionar ao Carrinho
            </button>
            <button
              className="px-6 py-2.5 rounded-lg font-medium text-sm border-2"
              style={{ borderColor: effectiveValue, color: effectiveValue }}
            >
              Ver Detalhes
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
