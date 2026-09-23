# Etapa 5 — Dashboard e gráficos

## Objetivo

Apresentar uma visão clara da situação financeira do período selecionado, usando os mesmos cálculos do restante da aplicação.

## Escopo funcional

- seleção de mês ou intervalo;
- cartões de receitas, despesas, resultado e saldo;
- comparação com o período anterior;
- contas vencidas e próximas do vencimento;
- despesas por categoria;
- evolução de receitas e despesas;
- gastos acumulados no período;
- visão por conta;
- atalhos para listas já filtradas.

## Indicadores

- saldo total atual;
- receitas realizadas e previstas;
- despesas realizadas e previstas;
- resultado realizado e projetado;
- quantidade e valor de pendências vencidas;
- variação percentual em relação ao período equivalente anterior;
- maiores categorias de gasto.

## Gráficos iniciais

### Despesas por categoria

- gráfico de rosca ou barras;
- valor e percentual de cada categoria;
- agrupamento de categorias pequenas em “Outras”, sem perder o detalhamento;
- clique direciona para a lista filtrada.

### Receitas versus despesas

- séries mensais em barras ou linhas;
- distinção entre realizado e previsto;
- período configurável.

### Evolução do saldo

- saldo acumulado por dia ou mês;
- opção de considerar somente realizado ou incluir projeções.

## Regras de negócio

- os números devem vir de serviços de consolidação compartilhados;
- transferências futuras não devem inflar receitas ou despesas;
- lançamentos cancelados são ignorados;
- comparação mensal deve respeitar meses com quantidades diferentes de dias;
- ausência de dados exibe orientação, não um gráfico enganoso;
- cores não podem ser o único meio de distinguir séries.

## Histórias de usuário

- Como usuário, quero saber rapidamente se fechei o mês no positivo.
- Como usuário, quero identificar onde concentro meus gastos.
- Como usuário, quero comparar o período atual com o anterior.
- Como usuário, quero abrir os lançamentos que originaram um indicador.

## Entregáveis de desenvolvimento

- serviço central de consolidação financeira;
- seletor de período;
- cartões de indicadores;
- componentes gráficos com Apache ECharts;
- navegação dos indicadores para filtros correspondentes;
- estados vazios e textos alternativos para gráficos;
- testes dos agregados e comparações.

## Critérios de aceite

- totais do Dashboard coincidem com a listagem usando os mesmos filtros;
- alterar o período atualiza todos os indicadores e gráficos;
- clicar em uma categoria abre somente seus lançamentos;
- gráficos apresentam valores acessíveis também em texto ou tabela;
- o Dashboard funciona sem dados e com grandes volumes de lançamentos;
- realizado e previsto são visualmente distinguíveis.

## Dependências

- movimentações financeiras da Etapa 4.
