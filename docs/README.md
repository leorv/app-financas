# Documentação funcional

Esta pasta divide o aplicativo de finanças pessoais em escopos de desenvolvimento independentes e incrementais. Cada especificação descreve o comportamento esperado, regras de negócio, critérios de aceite e sequência de entrega.

## Roadmap

| Etapa | Escopo | Resultado principal | Dependências |
| --- | --- | --- | --- |
| 1 | [Fundação e experiência](01-fundacao-e-experiencia.md) | Aplicação navegável, responsiva e preparada para crescer | Nenhuma |
| 2 | [Modelo de dados e persistência](02-modelo-de-dados-e-persistencia.md) | Dados financeiros armazenados com segurança no navegador | Etapa 1 |
| 3 | [Categorias e contas](03-categorias-e-contas.md) | Cadastros básicos necessários aos lançamentos | Etapas 1 e 2 |
| 4 | [Movimentações financeiras](04-movimentacoes-financeiras.md) | Receitas e despesas com filtros e totais consistentes | Etapas 2 e 3 |
| 5 | [Dashboard e gráficos](05-dashboard-e-graficos.md) | Visão mensal consolidada e indicadores visuais | Etapa 4 |
| 6 | [Importação e exportação](06-importacao-e-exportacao.md) | Backup JSON, restauração segura e exportação CSV | Etapas 2 a 4 |
| 7 | [Cartões e parcelamentos](07-cartoes-e-parcelamentos.md) | Controle de limite, compras e faturas | Etapas 3 e 4 |
| 8 | [Transferências e recorrências](08-transferencias-e-recorrencias.md) | Automação de lançamentos e movimentação entre contas | Etapas 3 e 4 |
| 9 | [Orçamentos e metas](09-orcamentos-e-metas.md) | Planejamento financeiro e acompanhamento de objetivos | Etapas 4 e 5 |
| 10 | [Relatórios e PDF](10-relatorios-e-pdf.md) | Resumos consolidados e relatórios com pdfmake | Etapas 4, 5, 7 e 9 |
| 11 | [PWA, acessibilidade e qualidade](11-pwa-acessibilidade-e-qualidade.md) | Aplicação instalável, confiável e pronta para uso contínuo | Todas as etapas aplicáveis |

## Marcos de entrega

### Marco 1 — MVP financeiro

Composto pelas etapas 1 a 6. Entrega contas, categorias, receitas, despesas, dashboard básico, persistência local e backup JSON.

### Marco 2 — Gestão financeira completa

Adiciona as etapas 7 a 9. Entrega cartões, faturas, parcelamentos, transferências, recorrências, orçamentos e metas.

### Marco 3 — Relatórios e produto final

Composto pelas etapas 10 e 11. Entrega PDFs, PWA, refinamentos de acessibilidade, desempenho, segurança e cobertura de testes.

## Definição de pronto geral

Uma funcionalidade só é considerada concluída quando:

- atende a todos os critérios de aceite de sua especificação;
- possui estados de carregamento, vazio, sucesso e erro quando aplicáveis;
- funciona com teclado e em telas pequenas;
- usa as regras financeiras compartilhadas, sem duplicação de cálculos;
- possui testes unitários para regras de negócio críticas;
- não compromete importações criadas por versões anteriores;
- apresenta textos, moedas e datas no padrão configurado pelo usuário;
- não depende de backend nem envia dados financeiros a serviços externos.

## Ordem sugerida dentro de cada etapa

1. Confirmar regras e modelo de dados.
2. Criar casos de uso e serviços de domínio.
3. Implementar a persistência necessária.
4. Construir a interface e os fluxos.
5. Tratar estados alternativos e erros.
6. Criar testes automatizados.
7. Validar os critérios de aceite.
