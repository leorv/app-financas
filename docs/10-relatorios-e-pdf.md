# Etapa 10 — Relatórios e PDF

## Objetivo

Gerar relatórios financeiros consistentes e legíveis no navegador, incluindo um resumo mensal consolidado, usando a biblioteca `pdfmake`.

## Tipos de relatório

### Resumo mensal consolidado

- competência e data de geração;
- saldo inicial e final;
- receitas, despesas e resultado;
- valores realizados e previstos;
- despesas por categoria;
- resumo por conta;
- resumo de cartões e faturas;
- orçamento planejado versus realizado;
- maiores despesas;
- pendências e vencimentos relevantes;
- gráficos e tabelas resumidas.

### Relatórios analíticos

- receitas e despesas por período;
- despesas por categoria;
- extrato de conta;
- compras e faturas de cartão;
- orçamento planejado versus realizado;
- fluxo de caixa e projeção;
- evolução patrimonial;
- movimentações conforme filtros ativos.

## Configuração do relatório

O usuário poderá escolher:

- tipo de relatório;
- período;
- contas, cartões, categorias e situações;
- inclusão de previstos;
- seções e gráficos;
- orientação retrato ou paisagem quando aplicável;
- exibição ou ocultação de saldos sensíveis.

## Fluxo de geração

1. O usuário seleciona o relatório e seus filtros.
2. O aplicativo valida se há dados compatíveis.
3. Uma prévia resumida informa conteúdo, período e filtros.
4. O serviço de consolidação cria um modelo independente de apresentação.
5. Gráficos selecionados são convertidos em imagens locais.
6. O `pdfmake` monta e baixa o PDF.
7. A interface informa sucesso ou apresenta erro recuperável.

## Padrão visual do documento

- página A4;
- margens consistentes;
- título, período e data de emissão;
- cabeçalho discreto e rodapé paginado;
- valores monetários alinhados e formatados;
- tabelas com cabeçalho repetido em novas páginas;
- indicação dos filtros aplicados;
- cores com contraste suficiente e alternativa textual aos gráficos;
- nome padronizado, como `resumo-financeiro-2026-09.pdf`.

## Regras de negócio

- relatórios usam os mesmos consolidadores do Dashboard;
- gerar PDF não altera nenhum dado financeiro;
- transferências e pagamentos de fatura não duplicam receitas ou despesas;
- lançamentos cancelados não aparecem, salvo relatório específico de auditoria;
- horário de geração é apenas metadado, não afeta a competência;
- tabelas longas não podem cortar linhas ou perder cabeçalhos;
- todo processamento ocorre localmente, sem upload de dados.

## Histórias de usuário

- Como usuário, quero baixar um resumo do mês para arquivar ou compartilhar.
- Como usuário, quero gerar um relatório usando os filtros da minha consulta.
- Como usuário, quero entender quais critérios foram aplicados ao documento.
- Como usuário, quero ocultar saldos ao compartilhar um relatório.

## Entregáveis de desenvolvimento

- modelos de relatório independentes da interface;
- serviço compartilhado de consolidação;
- fábrica de documentos `pdfmake`;
- conversão local dos gráficos;
- tela de configuração e prévia;
- templates dos relatórios iniciais;
- testes de conteúdo e snapshots estruturais dos documentos;
- testes visuais com documentos curtos, longos e sem dados.

## Critérios de aceite

- valores do resumo mensal coincidem com o Dashboard para o mesmo período;
- o PDF informa período, moeda, geração e filtros;
- relatórios com várias páginas repetem cabeçalho de tabela e exibem paginação;
- textos extensos não se sobrepõem nem saem da página;
- ocultar saldos remove esses valores de todas as seções relacionadas;
- o arquivo é gerado sem conexão com a internet;
- falha ao criar um gráfico não produz um PDF silenciosamente incompleto.

## Primeira entrega recomendada

1. Resumo mensal consolidado.
2. Movimentações filtradas.
3. Despesas por categoria.
4. Extrato de conta.
5. Fatura de cartão.
6. Orçamento versus realizado.

## Dependências

- movimentações da Etapa 4;
- consolidação e gráficos da Etapa 5;
- cartões da Etapa 7;
- orçamentos e metas da Etapa 9.
