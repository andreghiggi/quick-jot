/**
 * PIX BR Code (EMV) Payload Generator
 * Follows Banco Central do Brasil specification for static PIX QR Codes.
 * Reference: Manual de Padrões para Iniciação do PIX (BCB)
 */

// CRC16-CCITT (0xFFFF) used by EMV QR Code
function crc16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
    crc &= 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

export interface PixPayloadOptions {
  /** PIX key (CPF, CNPJ, email, phone, or random key) */
  pixKey: string;
  /** Merchant/beneficiary name (max 25 chars) */
  merchantName: string;
  /** Merchant city (max 15 chars) */
  merchantCity: string;
  /** Transaction amount in BRL (e.g., 10.50) */
  amount?: number;
  /** Transaction ID / reference label (max 25 chars, alphanumeric) */
  txId?: string;
  /** Additional info / description */
  description?: string;
}

/**
 * Generates a PIX BR Code payload string (EMV format)
 * that can be encoded into a QR Code or used as "Pix Copia e Cola".
 */
export function generatePixPayload(options: PixPayloadOptions): string {
  const {
    pixKey,
    merchantName,
    merchantCity,
    amount,
    txId = '***',
    description,
  } = options;

  // 00 - Payload Format Indicator
  let payload = tlv('00', '01');

  // 01 - Point of Initiation Method (12 = one-time/dynamic)
  payload += tlv('01', '12');

  // 26 - Merchant Account Information (PIX)
  let mai = tlv('00', 'BR.GOV.BCB.PIX');
  mai += tlv('01', pixKey);
  if (description) {
    mai += tlv('02', description.substring(0, 72));
  }
  payload += tlv('26', mai);

  // 52 - Merchant Category Code
  payload += tlv('52', '0000');

  // 53 - Transaction Currency (986 = BRL)
  payload += tlv('53', '986');

  // 54 - Transaction Amount (optional)
  if (amount && amount > 0) {
    payload += tlv('54', amount.toFixed(2));
  }

  // 58 - Country Code
  payload += tlv('58', 'BR');

  // 59 - Merchant Name (max 25)
  payload += tlv('59', merchantName.substring(0, 25).toUpperCase());

  // 60 - Merchant City (max 15)
  payload += tlv('60', merchantCity.substring(0, 15).toUpperCase());

  // 62 - Additional Data Field Template
  const additionalData = tlv('05', txId.substring(0, 25));
  payload += tlv('62', additionalData);

  // 63 - CRC16 (placeholder + calculate)
  payload += '6304';
  const checksum = crc16(payload);
  payload += checksum;

  return payload;
}
