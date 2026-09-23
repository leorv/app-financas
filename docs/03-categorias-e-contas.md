# Etapa 3 — Categorias e contas

## Objetivo

Disponibilizar os cadastros que classificam os lançamentos e representam onde o dinheiro está armazenado.

## Categorias

Funcionalidades:

- listar categorias de receita e despesa separadamente;
- criar categoria com nome, tipo, cor e ícone;
- criar subcategorias;
- editar e reordenar categorias;
- arquivar e reativar categorias;
- carregar um conjunto inicial opcional de categorias.

Regras:

- o nome é obrigatório e único dentro do mesmo tipo e nível;
- uma categoria de receita não pode ser usada em despesa e vice-versa;
- categorias utilizadas não podem ser excluídas, apenas arquivadas;
- arquivar uma categoria impede novos usos, mas preserva relatórios históricos;
- uma subcategoria sempre herda o tipo de sua categoria principal.

## Contas

Funcionalidades:

- criar conta corrente, poupança, dinheiro, carteira digital ou investimento;
- informar nome, instituição opcional, cor, ícone e saldo inicial;
- definir a conta padrão;
- listar saldo atual e situação da conta;
- editar, arquivar e reativar contas;
- consultar o histórico de uma conta.

Regras:

- o saldo atual é calculado a partir do saldo inicial e das movimentações efetivadas;
- movimentações previstas não alteram o saldo atual;
- uma conta com movimentações não pode ser excluída;
- somente uma conta ativa pode ser a padrão;
- arquivar uma conta impede novos lançamentos, mas mantém seu histórico.

## Histórias de usuário

- Como usuário, quero personalizar categorias para refletir meus hábitos.
- Como usuário, quero separar meu dinheiro por conta.
- Como usuário, quero ocultar contas antigas sem perder o histórico.
- Como usuário, quero identificar categorias e contas por cor e ícone.

## Telas e fluxos

- lista de categorias agrupada por tipo;
- formulário de categoria e subcategoria;
- lista de contas com saldo e estado;
- formulário de conta;
- detalhe da conta com resumo e link para movimentações filtradas.

## Entregáveis de desenvolvimento

- casos de uso de categorias e contas;
- formulários reativos com validação;
- listas com busca, ordenação e estado vazio;
- cálculo de saldo da conta;
- dados iniciais opcionais;
- testes das regras de arquivamento, unicidade e saldo.

## Critérios de aceite

- uma categoria criada fica disponível no formulário de movimentação;
- categorias arquivadas permanecem visíveis em lançamentos históricos;
- o saldo inicial é exibido corretamente antes de existirem movimentações;
- uma conta arquivada não aparece entre as opções de novos lançamentos;
- não é possível salvar nomes obrigatórios em branco ou duplicados;
- a conta padrão é selecionada automaticamente em um novo lançamento.

## Dependências

- modelo de dados e persistência da Etapa 2.
