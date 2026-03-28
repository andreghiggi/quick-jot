import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, Pencil, Save, X, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface WhatsAppMessageTemplatesProps {
  googleReviewUrl?: string;
  companyId?: string;
  updateSetting: (key: string, value: string) => Promise<boolean>;
}

const SYSTEM_VARIABLES = ['{{nome}}', '{{num}}', '{{loja}}', '{{tempo}}', '{{endereco}}', '{{link_cardapio}}', '{{chave_pix}}'];

const TEMPLATE_CONFIGS = [
  {
    status: 'Confirmado',
    settingKey: 'whatsapp_msg_pending',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    defaultMsg: '{{nome}}, seu pedido {{num}} foi confirmado pelo {{loja}}! Em breve começaremos a preparar. 😊',
    hint: 'Enviada quando o pedido é confirmado.',
  },
  {
    status: 'Cobrança PIX',
    settingKey: 'whatsapp_msg_pix',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
    defaultMsg: '💳 *Pagamento via PIX*\n\n{{nome}}, para finalizar seu pedido {{num}}, faça o pagamento via PIX:\n\n🔑 Chave PIX para copiar:\n`{{chave_pix}}`\n\nCopie a chave acima e cole no seu app de pagamento. Obrigado! 😊',
    hint: 'Enviada junto com a confirmação quando o cliente escolheu PIX. Use {{chave_pix}} para inserir a chave cadastrada.',
  },
  {
    status: 'Em Preparo',
    settingKey: 'whatsapp_msg_preparing',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    defaultMsg: '{{nome}}, seu pedido {{num}} já está sendo preparado com carinho pela equipe do {{loja}}. Tempo estimado: {{tempo}}. Avisaremos quando estiver pronto!',
    hint: 'Enviada quando o pedido entra em preparo.',
  },
  {
    status: 'Pronto (Retirada)',
    settingKey: 'whatsapp_msg_ready_pickup',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    defaultMsg: '{{nome}}, seu pedido {{num}} está pronto e disponível para retirada no {{loja}}! Estamos te esperando! 🏪',
    hint: 'Enviada quando o pedido está pronto para retirada.',
  },
  {
    status: 'Pronto (Entrega)',
    settingKey: 'whatsapp_msg_ready_delivery',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    defaultMsg: '{{nome}}, seu pedido {{num}} está prontinho e já vai sair para entrega. Fique de olho! 🛵',
    hint: 'Enviada quando o pedido está saindo para entrega.',
  },
  {
    status: 'Finalizado',
    settingKey: 'whatsapp_msg_delivered',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    defaultMsg: '{{nome}}, seu pedido {{num}} foi finalizado. Obrigado por escolher o {{loja}}, esperamos que tenha gostado!',
    hint: 'Enviada quando o pedido é finalizado.',
  },
  {
    status: 'Follow-up (30min após entrega)',
    settingKey: 'whatsapp_msg_followup',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
    defaultMsg: '{{nome}}, que bom ter você como cliente do {{loja}}! 😊\n\nEsperamos que tenha gostado do seu pedido. Quando quiser pedir novamente, é só acessar nosso cardápio:\n\n🛒 {{link_cardapio}}\n\nTe esperamos! 💛',
    hint: 'Enviada automaticamente 30 minutos após o pedido ser entregue, com link para novo pedido.',
  },
];

// Editor that prevents editing/deleting variables
function ProtectedVariableEditor({ value, onChange, variables }: { value: string; onChange: (v: string) => void; variables: string[] }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  // Split text into segments (text parts and variables)
  const splitIntoSegments = useCallback((text: string) => {
    const regex = new RegExp(`(${variables.map(v => v.replace(/[{}]/g, '\\$&')).join('|')})`, 'g');
    return text.split(regex).filter(Boolean);
  }, [variables]);

  // Rebuild text from contenteditable
  const extractText = useCallback(() => {
    if (!editorRef.current) return value;
    let result = '';
    editorRef.current.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent || '';
      } else if (node instanceof HTMLElement) {
        if (node.dataset.variable) {
          result += node.dataset.variable;
        } else {
          result += node.textContent || '';
        }
      }
    });
    return result;
  }, [value]);

  // Render segments into the contenteditable
  const renderContent = useCallback(() => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    // Save cursor position roughly
    let cursorOffset = 0;
    let foundCursor = false;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(editorRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      cursorOffset = preRange.toString().length;
      foundCursor = true;
    }

    isInternalUpdate.current = true;
    editorRef.current.innerHTML = '';
    const segments = splitIntoSegments(value);
    segments.forEach(seg => {
      if (variables.includes(seg)) {
        const span = document.createElement('span');
        span.contentEditable = 'false';
        span.dataset.variable = seg;
        span.className = 'inline-flex items-center bg-secondary text-secondary-foreground px-1.5 py-0 rounded text-xs font-mono mx-0.5 select-none';
        span.textContent = seg;
        editorRef.current!.appendChild(span);
      } else {
        const textNode = document.createTextNode(seg);
        editorRef.current!.appendChild(textNode);
      }
    });

    // Restore cursor
    if (foundCursor && sel) {
      try {
        let remaining = cursorOffset;
        const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const len = node.textContent?.length || 0;
          if (remaining <= len) {
            const newRange = document.createRange();
            newRange.setStart(node, remaining);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            break;
          }
          remaining -= len;
        }
      } catch {}
    }
    isInternalUpdate.current = false;
  }, [value, variables, splitIntoSegments]);

  useEffect(() => {
    renderContent();
  }, [value]);

  const handleInput = useCallback(() => {
    if (isInternalUpdate.current) return;
    const newText = extractText();
    onChange(newText);
  }, [extractText, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current) return;
    
    const range = sel.getRangeAt(0);
    
    // Prevent deleting into a variable span
    if (e.key === 'Backspace') {
      const node = range.startContainer;
      if (range.startOffset === 0 && node.previousSibling instanceof HTMLElement && node.previousSibling.dataset.variable) {
        e.preventDefault();
      }
    }
    if (e.key === 'Delete') {
      const node = range.startContainer;
      const offset = range.startOffset;
      const len = node.textContent?.length || 0;
      if (offset === len && node.nextSibling instanceof HTMLElement && node.nextSibling.dataset.variable) {
        e.preventDefault();
      }
    }
  }, []);

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      className="min-h-[80px] p-3 border rounded-md bg-background text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring whitespace-pre-wrap"
      style={{ wordBreak: 'break-word' }}
    />
  );
}

export function WhatsAppMessageTemplates({ googleReviewUrl, companyId, updateSetting }: WhatsAppMessageTemplatesProps) {
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Load custom messages from store_settings
  useEffect(() => {
    if (!companyId) {
      setLoadingTemplates(false);
      return;
    }
    const loadMessages = async () => {
      try {
        const { data } = await (await import('@/integrations/supabase/client')).supabase
          .from('store_settings')
          .select('key, value')
          .eq('company_id', companyId)
          .in('key', TEMPLATE_CONFIGS.map(t => t.settingKey));

        const map: Record<string, string> = {};
        data?.forEach(s => {
          if (s.value) map[s.key] = s.value;
        });
        setCustomMessages(map);
      } catch (e) {
        console.error('Error loading message templates:', e);
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadMessages();
  }, [companyId]);

  function getDisplayMessage(config: typeof TEMPLATE_CONFIGS[0]) {
    return customMessages[config.settingKey] || config.defaultMsg;
  }

  function startEditing(config: typeof TEMPLATE_CONFIGS[0]) {
    setEditingKey(config.settingKey);
    setEditValue(customMessages[config.settingKey] || config.defaultMsg);
  }

  function cancelEditing() {
    setEditingKey(null);
    setEditValue('');
  }

  async function saveMessage(settingKey: string) {
    if (!editValue.trim()) {
      toast.error('A mensagem não pode estar vazia');
      return;
    }

    setSaving(true);
    const success = await updateSetting(settingKey, editValue.trim());
    setSaving(false);

    if (success) {
      setCustomMessages(prev => ({ ...prev, [settingKey]: editValue.trim() }));
      setEditingKey(null);
      toast.success('Mensagem salva com sucesso!');
    }
  }

  async function resetToDefault(config: typeof TEMPLATE_CONFIGS[0]) {
    setSaving(true);
    const success = await updateSetting(config.settingKey, '');
    setSaving(false);

    if (success) {
      setCustomMessages(prev => {
        const next = { ...prev };
        delete next[config.settingKey];
        return next;
      });
      setEditingKey(null);
      toast.success('Mensagem restaurada ao padrão!');
    }
  }

  // Highlight variables in the displayed message
  function renderMessageWithHighlights(msg: string) {
    const parts = msg.split(/({{[^}]+}})/g);
    return parts.map((part, i) => {
      if (SYSTEM_VARIABLES.includes(part)) {
        return (
          <Badge key={i} variant="secondary" className="mx-0.5 text-xs font-mono px-1.5 py-0">
            {part}
          </Badge>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  if (loadingTemplates) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-green-600" />
          Mensagens automáticas por status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground mb-4">
          Personalize as mensagens enviadas automaticamente ao cliente quando o status do pedido muda. Clique no ícone de edição para alterar.
        </p>

        {TEMPLATE_CONFIGS.map((config) => (
          <div key={config.settingKey} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge className={config.color}>{config.status}</Badge>
              <div className="flex gap-1">
                {editingKey !== config.settingKey && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditing(config)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {editingKey === config.settingKey ? (
              <div className="space-y-2">
                <ProtectedVariableEditor
                  value={editValue}
                  onChange={setEditValue}
                  variables={SYSTEM_VARIABLES}
                />
                <p className="text-xs text-muted-foreground">
                  {config.hint} As variáveis destacadas não podem ser removidas. Clique em uma variável abaixo para adicioná-la.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {SYSTEM_VARIABLES.map(v => (
                    <button
                      key={v}
                      type="button"
                      className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded font-mono hover:bg-secondary/80 transition-colors"
                      onClick={() => {
                        setEditValue(prev => prev + v);
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  {customMessages[config.settingKey] && (
                    <Button variant="outline" size="sm" onClick={() => resetToDefault(config)} disabled={saving} className="gap-1">
                      <RotateCcw className="h-3 w-3" />
                      Padrão
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={() => saveMessage(config.settingKey)} disabled={saving} className="gap-1">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed">
                {renderMessageWithHighlights(getDisplayMessage(config))}
              </p>
            )}

            {customMessages[config.settingKey] && editingKey !== config.settingKey && (
              <p className="text-xs text-primary">✏️ Mensagem personalizada</p>
            )}
          </div>
        ))}

        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Variáveis disponíveis:</strong> {'{{nome}}'} = primeiro nome do cliente, {'{{num}}'} = código do pedido, {'{{loja}}'} = nome do estabelecimento, {'{{tempo}}'} = tempo estimado de preparo, {'{{endereco}}'} = endereço da loja, {'{{link_cardapio}}'} = link do cardápio público, {'{{chave_pix}}'} = chave PIX cadastrada. As variáveis são substituídas automaticamente ao enviar.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
