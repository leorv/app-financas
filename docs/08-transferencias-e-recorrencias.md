# Etapa 8 — Transferências e recorrências

## Objetivo

Registrar movimentações entre contas sem distorcer resultados e automatizar compromissos financeiros repetitivos.

## Transferências

Dados:

- conta de origem;
- conta de destino;
- valor;
- data;
- situação;
- descrição e observação opcionais.

Regras:

- origem e destino devem ser diferentes;
- contas precisam estar ativas no momento da criação;
- uma transferência paga reduz a origem e aumenta o destino pelo mesmo valor;
- transferências não compõem receitas ou despesas consolidadas;
- os dois efeitos pertencem ao mesmo vínculo e são alterados atomicamente;
- cancelar ou reabrir desfaz os dois efeitos;
- taxas bancárias são despesas separadas e opcionais.

## Recorrências

Frequências iniciais:

- semanal;
- mensal;
- anual;
- intervalo personalizado simples.

Configuração:

- data inicial e data final opcional;
- quantidade máxima opcional;
- modelo do lançamento;
- frequência;
- política para datas inexistentes, como dia 31;
- criação como previsto ou pendente.

## Estratégia de geração

- ocorrências são materializadas dentro de uma janela configurada;
- cada ocorrência guarda vínculo com a regra que a originou;
- o processo é idempotente e não cria duplicidades;
- novas ocorrências podem ser geradas ao abrir o aplicativo ou avançar o período de projeção.

## Alteração de recorrência

O usuário escolherá entre:

- alterar somente esta ocorrência;
- alterar esta e as futuras;
- alterar a regra completa quando não houver conflito com histórico realizado.

Ocorrências pagas anteriores permanecem imutáveis em alterações futuras.

## Histórias de usuário

- Como usuário, quero transferir dinheiro sem registrar receita fictícia.
- Como usuário, quero lançar automaticamente aluguel, salário e assinaturas.
- Como usuário, quero corrigir apenas uma ocorrência excepcional.
- Como usuário, quero encerrar uma recorrência sem perder o histórico.

## Entregáveis de desenvolvimento

- caso de uso transacional de transferência;
- regras e gerador idempotente de recorrências;
- formulário e visualização da série;
- diálogo de escopo da edição;
- integração com projeções;
- testes de atomicidade, calendário, encerramento e duplicidade.

## Critérios de aceite

- uma transferência paga mantém o saldo total consolidado inalterado;
- falha em um lado da transferência impede toda a operação;
- reexecutar o gerador não duplica ocorrências;
- recorrência mensal no dia 31 segue a política informada para meses curtos;
- editar “esta e as futuras” não modifica ocorrências pagas anteriores;
- encerrar uma regra impede novas ocorrências e mantém as existentes.

## Dependências

- contas da Etapa 3;
- movimentações e situações da Etapa 4.
