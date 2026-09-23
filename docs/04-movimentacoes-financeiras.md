# Etapa 4 — Movimentações financeiras

## Objetivo

Implementar o registro, a edição e a consulta de receitas e despesas, formando o núcleo operacional do aplicativo.

## Escopo funcional

- cadastrar receita ou despesa;
- editar, duplicar e excluir um lançamento simples;
- marcar como previsto, pendente, pago ou cancelado;
- pesquisar e filtrar movimentações;
- ordenar e paginar a listagem;
- exibir totais correspondentes aos filtros ativos;
- acessar detalhes do lançamento;
- realizar ações em lote, quando seguras.

## Dados do lançamento

- descrição obrigatória;
- valor positivo obrigatório;
- tipo: receita ou despesa;
- data de competência;
- vencimento opcional;
- data de pagamento, quando efetivado;
- categoria e subcategoria;
- conta;
- forma de pagamento;
- situação;
- tags e observações opcionais.

## Regras de negócio

- o tipo do lançamento deve ser compatível com a categoria;
- somente lançamentos pagos afetam o saldo atual da conta;
- lançamentos previstos e pendentes participam de projeções, não do saldo realizado;
- um lançamento cancelado não participa dos totais;
- marcar como pago solicita ou assume a data de pagamento;
- reabrir um lançamento pago remove seu efeito do saldo realizado;
- valores sempre são positivos; a natureza de receita ou despesa define o sinal nos cálculos;
- exclusões exigem confirmação e devem ser restritas a lançamentos sem vínculos especiais.

## Filtros

- intervalo de competência;
- intervalo de vencimento;
- receita ou despesa;
- situação;
- categoria e subcategoria;
- conta;
- forma de pagamento;
- tags;
- descrição ou observação.

Os filtros ativos devem aparecer de forma visível e poder ser limpos individualmente ou em conjunto.

## Histórias de usuário

- Como usuário, quero registrar uma despesa em poucos passos.
- Como usuário, quero lançar uma receita futura sem alterar o saldo atual.
- Como usuário, quero marcar uma conta como paga no dia do pagamento.
- Como usuário, quero encontrar lançamentos antigos por filtros e texto.
- Como usuário, quero ver o total exato do conjunto que estou consultando.

## Telas e fluxos

### Novo lançamento

1. O usuário escolhe receita ou despesa.
2. Informa descrição, valor, data, categoria, conta e situação.
3. O formulário apresenta validações antes do salvamento.
4. Após salvar, a listagem e os indicadores relacionados são atualizados.

### Pagamento rápido

1. O usuário escolhe um lançamento pendente.
2. Aciona “Marcar como pago”.
3. Confirma conta e data de pagamento.
4. O saldo da conta é recalculado.

## Entregáveis de desenvolvimento

- domínio e casos de uso de movimentações;
- formulário reutilizável para receita e despesa;
- listagem responsiva com filtros;
- detalhe do lançamento;
- cálculo de totais realizados e previstos;
- comandos de alteração de situação;
- testes de valores, datas, situações e impacto no saldo.

## Critérios de aceite

- salvar uma despesa paga reduz o saldo da conta uma única vez;
- editar o valor recalcula corretamente todos os totais afetados;
- lançamentos cancelados não entram em saldo, dashboard ou relatórios;
- filtros alteram tanto a lista quanto seus totais;
- nenhum lançamento aceita valor igual ou inferior a zero;
- o usuário consegue diferenciar visualmente valores realizados e previstos;
- a exclusão não ocorre sem confirmação.

## Dependências

- persistência da Etapa 2;
- categorias e contas da Etapa 3.
