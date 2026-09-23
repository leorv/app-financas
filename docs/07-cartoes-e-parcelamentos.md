# Etapa 7 — Cartões e parcelamentos

## Objetivo

Controlar compras no crédito, limite disponível, fechamento, vencimento e pagamento das faturas.

## Cadastro do cartão

- nome e bandeira opcional;
- conta usada no pagamento;
- limite total;
- dia de fechamento;
- dia de vencimento;
- cor, ícone e estado ativo ou arquivado.

## Compras no cartão

- compra à vista ou parcelada;
- descrição, valor total, data, categoria e cartão;
- quantidade de parcelas e primeira competência;
- geração das parcelas com valor e sequência;
- vínculo de todas as parcelas à compra original;
- visualização do impacto no limite e nas faturas.

## Faturas

- período de compras conforme o fechamento;
- data de vencimento;
- total, situação e lançamentos componentes;
- estados aberta, fechada, paga, vencida e cancelada;
- pagamento total inicialmente;
- geração de movimentação na conta vinculada quando a fatura é paga.

## Regras de negócio

- a data da compra e o fechamento definem a fatura de competência;
- o limite disponível considera compras ainda comprometidas, independentemente do pagamento da fatura;
- a soma das parcelas deve ser exatamente igual ao valor total, distribuindo diferenças de centavos de forma determinística;
- pagar uma fatura reduz o saldo da conta apenas uma vez;
- compras no cartão não reduzem diretamente o saldo da conta;
- editar ou excluir uma compra deve atualizar parcelas, faturas e limite;
- faturas pagas exigem tratamento explícito antes de alterações retroativas;
- cartões com histórico podem ser arquivados, não excluídos.

## Histórias de usuário

- Como usuário, quero saber quanto ainda posso gastar no cartão.
- Como usuário, quero identificar em qual fatura uma compra cairá.
- Como usuário, quero registrar uma compra parcelada sem criar cada parcela manualmente.
- Como usuário, quero pagar a fatura e refletir o débito na conta correta.

## Telas e fluxos

- lista de cartões com limite utilizado e próxima fatura;
- detalhe do cartão com faturas e compras;
- formulário do cartão;
- formulário de compra com simulação das parcelas;
- detalhe da fatura;
- fluxo de fechamento e pagamento.

## Entregáveis de desenvolvimento

- domínio de cartões, compras, parcelas e faturas;
- calculadora de competência e parcelamento;
- cálculo do limite;
- telas e formulários;
- integração com movimentações e contas;
- testes para fechamento, meses curtos, centavos e pagamento.

## Critérios de aceite

- uma compra realizada após o fechamento entra na fatura seguinte;
- uma compra de valor não divisível gera parcelas cuja soma permanece exata;
- o pagamento da fatura cria apenas um débito na conta;
- limite, total da fatura e parcelas são atualizados após edição;
- o usuário consegue rastrear uma parcela até a compra original;
- cartões arquivados preservam todas as faturas anteriores.

## Fora do escopo inicial

- juros rotativos;
- pagamento mínimo;
- renegociação de fatura;
- importação automática de instituições financeiras.

## Decisões de implementação

- O valor-base da parcela é arredondado para baixo em centavos; as sobras são distribuídas, uma por uma, nas primeiras parcelas. A soma permanece exatamente igual ao valor original.
- Quando o dia de vencimento não é posterior ao fechamento, o vencimento fica no mês seguinte. Em fevereiro e outros meses curtos, o dia é limitado ao último dia civil existente.
- Totais de fatura e limite são reconstruídos a partir das parcelas. O pagamento cria uma movimentação especial vinculada à fatura, que reduz a conta, mas não é contado novamente como despesa.
- A inclusão das entidades de compras e faturas atualizou o snapshot para a versão 2; a Etapa 8 evolui o esquema para a versão 3, e backups anteriores recebem campos neutros durante a migração.

## Dependências

- contas e categorias da Etapa 3;
- movimentações da Etapa 4.
