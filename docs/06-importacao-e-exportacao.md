# Etapa 6 — Importação e exportação

## Objetivo

Garantir a portabilidade dos dados por meio de backups JSON e permitir a análise externa de listagens em CSV.

## Exportação JSON

O backup completo conterá:

- `schemaVersion`;
- versão do aplicativo;
- data e hora da exportação;
- configurações;
- categorias, contas e cartões;
- movimentações e seus vínculos;
- recorrências, orçamentos e metas.

Fluxo:

1. O usuário solicita a exportação.
2. O aplicativo cria um snapshot consistente dos dados.
3. O arquivo é validado internamente.
4. O navegador baixa o JSON com nome padronizado.

Nome sugerido: `financas-backup-AAAA-MM-DD-HHmm.json`.

## Importação JSON

Fluxo:

1. O usuário seleciona o arquivo.
2. O aplicativo lê e valida conteúdo, estrutura e versão.
3. É exibido um resumo com quantidades, período e eventuais avisos.
4. O usuário confirma a substituição dos dados atuais.
5. Um backup automático dos dados atuais é preparado.
6. A importação ocorre em uma transação única.
7. Os dados são recarregados e conferidos.

## Modos futuros de importação

- substituir todos os dados, modo inicial obrigatório;
- mesclar arquivos, somente após existir estratégia segura para conflitos e duplicidades.

## Exportação CSV

- usa os filtros ativos da listagem;
- inclui colunas legíveis de descrição, tipo, valor, datas, situação, categoria, conta e tags;
- codificação UTF-8 com BOM e separador `;`, para abertura compatível com planilhas configuradas para `pt-BR`;
- datas são exibidas em formato legível `dd de mmm. de aaaa` e valores em reais usam decimal com vírgula, sem linha de totais;
- totais não são misturados às linhas de dados.

## Regras de segurança e integridade

- um arquivo inválido nunca altera os dados atuais;
- versões desconhecidas são rejeitadas com mensagem clara;
- migrações ocorrem antes da gravação definitiva;
- vínculos inexistentes ou duplicados são reportados;
- nenhuma importação acontece silenciosamente;
- arquivos JSON acima de 10 MiB são rejeitados antes da validação do conteúdo;
- o aplicativo não envia o arquivo para a internet;
- o tamanho máximo suportado deve ser documentado e validado.

## Histórias de usuário

- Como usuário, quero baixar um backup completo dos meus dados.
- Como usuário, quero continuar meu controle em outra sessão importando o backup.
- Como usuário, quero revisar o conteúdo antes de substituir os dados atuais.
- Como usuário, quero exportar uma consulta para abrir em uma planilha.

## Entregáveis de desenvolvimento

- serializador e desserializador versionados;
- esquema de validação do JSON;
- migradores entre versões;
- tela de prévia da importação;
- transação de substituição e restauração de segurança;
- gerador de CSV;
- testes com arquivos válidos, inválidos, incompletos e antigos.

## Critérios de aceite

- exportar e reimportar preserva todos os dados e relacionamentos;
- um JSON malformado exibe erro sem alterar o banco;
- a confirmação mostra quantos registros serão importados;
- cancelar a importação mantém o estado atual intacto;
- o CSV contém exatamente as movimentações filtradas;
- valores com centavos e textos acentuados abrem corretamente em planilhas comuns.

## Dependências

- modelo versionado e persistência da Etapa 2;
- entidades implementadas até a etapa vigente.
