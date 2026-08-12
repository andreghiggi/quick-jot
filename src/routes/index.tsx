// O roteamento para múltiplas impressoras foi ajustado.
// Baixe o arquivo auto_printer.py atualizado em Configurações > Impressão.
// Utilize o arquivo printer_map.json (também disponível para download) para mapear os nomes das impressoras do Windows.
// O script agora consulta a versão online do Comanda Tech por padrão.
// O mesmo arquivo precisa funcionar caso o sistema não tenha duas impressoras.
// Erro na execução: crie uma verificação no Windows e, se precisar, inclua no arquivo a remoção deles para fazer isso automaticamente. Deixe o arquivo rodando de qualquer forma.
// Mude a versão do python para 3.12 pra facilitar a instalação e faça tudo em um processo só.
// Solução definitiva: o inicializador v1.5 agora utiliza o caminho absoluto do Python detectado pelo instalador (python_detectado.txt) para evitar falhas de execução quando o executável está em pastas com espaços, como 'C:\Program Files'.
