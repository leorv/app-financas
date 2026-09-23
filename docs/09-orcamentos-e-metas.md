# Etapa 9 — Orçamentos e metas

## Objetivo

Permitir o planejamento de gastos e o acompanhamento de objetivos financeiros.

## Orçamentos

Funcionalidades:

- orçamento total mensal;
- limites por categoria;
- cópia opcional do mês anterior;
- acompanhamento de realizado, comprometido e disponível;
- alertas visuais em faixas configuráveis;
- comparação entre planejado e realizado;
- histórico mensal.

Regras:

- despesas canceladas não consomem orçamento;
- o realizado considera despesas pagas;
- o comprometido pode incluir pendentes e previstas conforme preferência explícita;
- transferências e pagamentos de fatura não contam novamente como gasto;
- compras do cartão são atribuídas segundo uma política única de competência;
- categorias sem limite podem aparecer no total geral;
- alterar o orçamento não altera lançamentos.

## Metas financeiras

Dados:

- título e descrição;
- valor-alvo;
- valor inicial;
- data-alvo opcional;
- conta relacionada opcional;
- cor, ícone e estado.

Funcionalidades:

- registrar aporte e retirada;
- acompanhar percentual e valor restante;
- estimar aporte mensal necessário quando houver prazo;
- marcar meta como concluída, pausada ou cancelada;
- consultar histórico de contribuições.

## Histórias de usuário

- Como usuário, quero definir quanto posso gastar em alimentação neste mês.
- Como usuário, quero ser avisado ao me aproximar do limite.
- Como usuário, quero comparar meu planejamento com o resultado real.
- Como usuário, quero acompanhar uma reserva de emergência até o valor desejado.

## Telas e fluxos

- visão mensal de orçamento com barras de progresso;
- edição do orçamento total e por categoria;
- lista de metas;
- detalhe da meta com progresso e histórico;
- formulário de aporte ou retirada;
- atalhos do Dashboard para limites excedidos.

## Entregáveis de desenvolvimento

- domínio e consolidação de orçamentos;
- configuração da política de comprometimento;
- domínio de metas e contribuições;
- telas, formulários e indicadores;
- integração com Dashboard e relatórios;
- testes de competência, limites, progresso e arredondamento.

## Critérios de aceite

- o consumo por categoria coincide com as despesas correspondentes;
- pagamentos de fatura não duplicam o consumo do orçamento;
- faixas de alerta são perceptíveis sem depender somente de cor;
- uma contribuição atualiza imediatamente o progresso da meta;
- a estimativa mensal não é exibida como garantia de conclusão;
- copiar um orçamento cria um novo período sem alterar o anterior.

## Dependências

- movimentações da Etapa 4;
- consolidação do Dashboard da Etapa 5;
- cartões da Etapa 7 para evitar dupla contagem.
