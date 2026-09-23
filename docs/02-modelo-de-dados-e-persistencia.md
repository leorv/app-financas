# Etapa 2 — Modelo de dados e persistência

## Objetivo

Definir o modelo financeiro central e garantir que os dados sejam gravados e recuperados localmente de forma íntegra.

## Entidades iniciais

- configurações;
- categoria e subcategoria;
- conta;
- cartão;
- movimentação;
- regra de recorrência;
- orçamento;
- meta financeira.

Todas as entidades terão UUID, data de criação, data de alteração e estado ativo ou arquivado quando aplicável.

## Regras de representação

- valores monetários serão números inteiros em centavos;
- datas civis serão gravadas como `YYYY-MM-DD`, sem conversão indevida de fuso horário;
- instantes de auditoria usarão ISO 8601 em UTC;
- relacionamentos usarão identificadores, não cópias completas das entidades;
- totais reconstruíveis não serão persistidos;
- registros financeiros não serão apagados silenciosamente;
- cada evolução incompatível do formato incrementará `schemaVersion`.

## Persistência

O IndexedDB será a fonte local persistente. Uma camada de repositórios deverá isolar a interface das particularidades do banco do navegador.

Operações necessárias:

- iniciar e atualizar a estrutura local;
- salvar alterações de forma transacional;
- consultar por identificador, data e relacionamentos;
- criar snapshot para backup;
- restaurar dados validados;
- executar migrações de versões anteriores;
- limpar os dados após confirmação explícita.

## Histórias de usuário

- Como usuário, quero encontrar meus dados ao voltar ao aplicativo.
- Como usuário, quero saber quando os dados foram salvos pela última vez.
- Como usuário, quero ser avisado se o navegador não permitir armazenamento local.
- Como usuário, quero limpar todos os dados quando decidir reiniciar meu controle financeiro.

## Tratamento de falhas

- uma falha de gravação não pode ser apresentada como sucesso;
- alterações ainda não persistidas devem permanecer na tela para nova tentativa;
- uma migração com erro deve preservar o banco anterior;
- falta de espaço deve gerar orientação para exportar um backup e liberar armazenamento;
- o aplicativo deve diferenciar ausência de dados de falha ao carregá-los.

## Entregáveis de desenvolvimento

- tipos e interfaces do domínio;
- adaptadores para valores monetários e datas;
- banco IndexedDB versionado;
- repositórios e serviço de transação;
- mecanismo de migração;
- indicador de salvamento e última alteração;
- testes de persistência, migração e recuperação de falhas.

## Critérios de aceite

- dados criados continuam disponíveis após fechar e reabrir o navegador;
- `R$ 10,10` é armazenado como `1010` centavos;
- datas não mudam ao utilizar fusos horários diferentes;
- falhas de gravação são informadas e não descartam o formulário atual;
- uma migração nunca deixa o banco parcialmente atualizado;
- limpar os dados exige confirmação e retorna o aplicativo ao primeiro acesso.

## Dependências

- fundação da aplicação e configurações básicas da Etapa 1.
