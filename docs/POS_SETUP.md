# ComandaTech POS - App para Maquininha Smart

## Arquitetura

```
src/
├── types/pos.ts          # Tipos TypeScript
├── services/
│   ├── posStorage.ts     # IndexedDB offline-first
│   ├── posPayment.ts     # Abstração SDK pagamento
│   └── posSync.ts        # Sincronização com backend
├── hooks/usePOS.ts       # Hook principal
├── components/pos/
│   ├── POSHeader.tsx     # Header com status
│   ├── POSKeypad.tsx     # Teclado numérico
│   ├── POSPaymentMethods.tsx # Seleção de forma
│   ├── POSTransactionResult.tsx # Resultado
│   └── POSHistory.tsx    # Histórico
└── pages/POS.tsx         # Tela principal
```

## Build para Android (Capacitor)

### Pré-requisitos
- Node.js 18+
- Android Studio
- JDK 17+

### Passos

1. **Exportar para GitHub**
   - Clique em "Export to GitHub" no Lovable
   - Clone o repositório localmente

2. **Instalar dependências**
   ```bash
   npm install
   ```

3. **Adicionar Capacitor Android**
   ```bash
   npx cap add android
   ```

4. **Build do projeto**
   ```bash
   npm run build
   ```

5. **Sincronizar com Android**
   ```bash
   npx cap sync android
   ```

6. **Abrir no Android Studio**
   ```bash
   npx cap open android
   ```

7. **Gerar APK**
   - No Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)

## Integração com SDK de Pagamento

Para integrar com SDKs reais (Stone, PagSeguro, Cielo), será necessário:

### Stone SDK
```bash
npm install @stoneco/stone-capacitor-plugin
```

Editar `src/services/posPayment.ts`:
```typescript
import { StonePlugin } from '@stoneco/stone-capacitor-plugin';

class StoneSDK implements PaymentSDK {
  async initialize(): Promise<void> {
    await StonePlugin.initialize({ 
      stoneCode: 'SEU_STONE_CODE' 
    });
  }
  
  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const result = await StonePlugin.makeTransaction({
      amount: request.amount * 100, // centavos
      typeOfTransaction: request.paymentMethod === 'credit' ? 1 : 2,
      installments: request.installments || 1,
    });
    return {
      success: result.success,
      nsu: result.nsu,
      authorizationCode: result.authorizationCode,
    };
  }
}
```

### PagSeguro SDK
Similar, usando o plugin nativo do PagSeguro.

### Cielo SDK
Similar, usando o plugin nativo da Cielo.

## Funcionalidades

- ✅ Login do operador
- ✅ Teclado numérico para valor
- ✅ Seleção de forma de pagamento (Crédito, Débito, PIX)
- ✅ Processamento (simulado)
- ✅ Resultado (aprovado/recusado)
- ✅ Armazenamento offline (IndexedDB)
- ✅ Sincronização automática com backend
- ✅ Histórico de transações
- ✅ Status online/offline
- ✅ Layout otimizado para POS touch

## Rota de Acesso

Acesse `/pos` no navegador ou no app para testar.
