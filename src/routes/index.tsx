// O roteamento para múltiplas impressoras foi ajustado.
// Baixe o arquivo auto_printer.py atualizado em Configurações > Impressão.
// Utilize o arquivo printer_map.json (também disponível para download) para mapear os nomes das impressoras do Windows.
// O script agora consulta a versão online do Comanda Tech por padrão.
// O mesmo arquivo precisa funcionar caso o sistema não tenha duas impressoras.
// Erro na execução: crie uma verificação no Windows e, se precisar, inclua no arquivo a remoção deles para fazer isso automaticamente. Deixe o arquivo rodando de qualquer forma.
// Mude a versão do python para 3.12 pra facilitar a instalação e faça tudo em um processo só.
// Próximos passos: Vá em Configurações > Impressão e baixe os 3 arquivos essenciais: 1. instalador_impressao.cmd (para preparar o Python e dependências), 2. iniciar_impressao.cmd (para abrir o monitoramento) e 3. auto_printer.py (o cérebro da impressão).
