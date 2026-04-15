import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QRCodeSVG } from 'qrcode.react';
import { generatePixPayload } from '@/utils/pixPayload';
import { Copy, Check, Printer } from 'lucide-react';

interface PixQRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  onConfirmPayment: () => void;
}

export function PixQRCodeDialog({
  open,
  onOpenChange,
  amount,
  pixKey,
  merchantName,
  merchantCity,
  onConfirmPayment,
}: PixQRCodeDialogProps) {
  const [copied, setCopied] = useState(false);

  const txId = `PDV${Date.now().toString(36).toUpperCase()}`;

  const payload = generatePixPayload({
    pixKey,
    merchantName,
    merchantCity,
    amount,
    txId,
  });

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>PIX QR Code</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace;
            width: 80mm;
            padding: 5mm;
            text-align: center;
          }
          h2 { font-size: 16px; margin-bottom: 3mm; }
          .amount { font-size: 20px; font-weight: bold; margin: 3mm 0; }
          .qr-container { margin: 4mm auto; }
          .qr-container svg { width: 50mm !important; height: 50mm !important; }
          .copy-paste { 
            font-size: 8px; 
            word-break: break-all; 
            margin: 3mm 0; 
            padding: 2mm;
            border: 1px dashed #000;
          }
          .label { font-size: 10px; color: #666; margin-top: 2mm; }
          .footer { font-size: 9px; margin-top: 4mm; color: #999; }
        </style>
      </head>
      <body>
        <h2>PAGAMENTO PIX</h2>
        <p class="amount">${formatCurrency(amount)}</p>
        <p class="label">Escaneie o QR Code abaixo:</p>
        <div class="qr-container" id="qr"></div>
        <p class="label">Pix Copia e Cola:</p>
        <p class="copy-paste">${payload}</p>
        <p class="footer">Chave: ${pixKey}</p>
        <p class="footer">${merchantName}</p>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <script>
          QRCode.toCanvas(document.createElement('canvas'), '${payload}', { width: 200 }, function(err, canvas) {
            if (!err) document.getElementById('qr').appendChild(canvas);
            setTimeout(function() { window.print(); window.close(); }, 500);
          });
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Pagamento PIX</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <Badge variant="outline" className="text-lg px-4 py-2 font-bold">
            {formatCurrency(amount)}
          </Badge>

          <div className="bg-white p-4 rounded-xl shadow-inner">
            <QRCodeSVG
              value={payload}
              size={220}
              level="M"
              includeMargin
            />
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Escaneie o QR Code com o app do banco ou use o Pix Copia e Cola
          </p>

          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado!' : 'Copiar Código'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrint}
              title="Imprimir QR Code"
            >
              <Printer className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full h-12 text-lg"
            onClick={onConfirmPayment}
          >
            Pagamento Recebido — Confirmar
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
