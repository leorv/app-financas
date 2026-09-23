# Planejamento — Aplicativo de Finanças Pessoais

## 1. Visão do produto

Aplicação frontend em Angular para controle de finanças pessoais, sem backend e sem necessidade de cadastro. Os dados serão mantidos no navegador e poderão ser exportados para um arquivo JSON, permitindo backup e restauração em outra sessão ou dispositivo.

O aplicativo deverá ajudar o usuário a:

- registrar receitas, despesas e transferências;
- organizar movimentações por categorias, contas, cartões e tags;
- controlar contas a pagar, compras parceladas e lançamentos recorrentes;
- acompanhar orçamentos e metas financeiras;
- visualizar saldos, tendências e distribuição dos gastos;
- gerar resumos mensais e relatórios em PDF;
- exportar e importar seus dados sem depender de serviços externos.

## 2. Princípios do projeto

- **Somente frontend:** toda a aplicação será executada no navegador.
- **Offline-first:** as funções principais deverão funcionar sem internet.
- **Privacidade:** os dados financeiros não serão enviados a servidores.
- **Portabilidade:** o usuário poderá exportar e importar um arquivo JSON.
- **Segurança contra perda:** os dados também serão salvos automaticamente no navegador.
- **Evolução controlada:** o formato do JSON terá uma versão para permitir futuras migrações.
- **Responsividade:** a interface deverá funcionar bem em computadores, tablets e celulares.

## 3. Escopo funcional

### 3.1. Movimentações financeiras

Tipos de movimentação:

- receita;
- despesa;
- transferência entre contas;
- compra parcelada;
- lançamento recorrente;
- estorno ou reembolso.

Dados de uma movimentação:

- descrição;
- valor;
- tipo;
- data da movimentação;
- data de vencimento ou pagamento;
- situação: prevista, pendente, paga ou cancelada;
- categoria e subcategoria;
- conta ou cartão;
- forma de pagamento;
- tags;
- observações;
- identificador da recorrência, transferência ou parcelamento, quando aplicável.

### 3.2. Categorias

- categorias e subcategorias personalizadas;
- cor e ícone para identificação visual;
- categorias iniciais, como moradia, alimentação, transporte, saúde, educação, lazer, assinaturas, compras, impostos, investimentos e salário;
- arquivamento de categorias já utilizadas, preservando o histórico.

### 3.3. Contas

- conta corrente;
- poupança;
- dinheiro;
- carteira digital;
- investimentos;
- saldo inicial e saldo calculado;
- ativação e arquivamento de contas.

Transferências não deverão ser contabilizadas como receita ou despesa nos relatórios consolidados.

### 3.4. Cartões de crédito

- nome do cartão;
- limite;
- dia de fechamento;
- dia de vencimento;
- compras vinculadas;
- compras parceladas;
- fatura atual e histórico de faturas;
- acompanhamento do limite disponível.

### 3.5. Parcelamentos e recorrências

- geração automática das parcelas;
- vínculo entre parcelas e lançamento original;
- recorrências semanais, mensais, anuais ou personalizadas;
- opção de alterar somente um lançamento ou os lançamentos futuros;
- previsão das movimentações ainda não pagas.

### 3.6. Orçamentos

- limite mensal total;
- limite por categoria;
- comparação entre valor planejado e realizado;
- avisos visuais ao atingir faixas como 80% e 100%;
- reaproveitamento opcional do orçamento no mês seguinte.

### 3.7. Metas financeiras

- título, valor-alvo e prazo;
- valor acumulado;
- percentual de progresso;
- conta relacionada, quando aplicável;
- exemplos: reserva de emergência, viagem ou compra de um bem.

### 3.8. Dashboard

Indicadores principais:

- saldo total e saldo por conta;
- receitas, despesas e resultado do mês;
- contas vencidas e próximas do vencimento;
- valor das faturas dos cartões;
- orçamento utilizado;
- comparação com o mês anterior;
- evolução do patrimônio.

Gráficos sugeridos:

- despesas por categoria;
- receitas versus despesas por mês;
- evolução do saldo;
- gastos acumulados ao longo do mês;
- orçamento versus realizado;
- distribuição por conta ou forma de pagamento;
- projeção dos próximos meses.

### 3.9. Consulta e relatórios

Filtros:

- período;
- tipo de movimentação;
- categoria e subcategoria;
- conta ou cartão;
- situação;
- forma de pagamento;
- tags;
- texto livre.

A listagem deverá permitir ordenação, pesquisa, paginação e visualização dos totais do resultado filtrado.

## 4. Relatórios em PDF

A geração de PDF será feita integralmente no navegador com a biblioteca **pdfmake** (denominada “MakePDF” no escopo inicial), sem envio de informações financeiras para serviços externos.

### 4.1. Tipos iniciais de relatório

- resumo financeiro mensal consolidado;
- receitas e despesas por período;
- despesas por categoria;
- extrato de uma conta;
- fatura de cartão;
- orçamento planejado versus realizado;
- fluxo de caixa e projeções;
- evolução patrimonial;
- relatório personalizado com os filtros ativos.

### 4.2. Conteúdo do resumo mensal

- competência do relatório;
- data e hora de geração;
- saldo inicial e final;
- total de receitas;
- total de despesas;
- resultado do mês;
- despesas por categoria;
- contas e cartões consolidados;
- orçamento planejado versus realizado;
- movimentações relevantes ou maiores gastos;
- gráficos e tabelas resumidas.

### 4.3. Experiência de geração

Fluxo sugerido:

1. O usuário escolhe o tipo de relatório.
2. Define período, filtros e seções desejadas.
3. Visualiza uma prévia ou um resumo da configuração.
4. Gera e baixa o arquivo PDF.

Opções desejáveis:

- formato A4;
- cabeçalho e rodapé com paginação;
- moeda e datas no padrão configurado;
- nome do arquivo padronizado, por exemplo `resumo-financeiro-2026-09.pdf`;
- gráficos convertidos para imagem antes de serem inseridos no PDF;
- indicação dos filtros aplicados;
- tratamento para tabelas longas e quebra automática de páginas;
- opção de ocultar informações sensíveis, como saldo total.

## 5. Persistência, importação e exportação

### 5.1. Armazenamento local

O IndexedDB será utilizado para salvar automaticamente os dados no navegador. O aplicativo deverá informar a data da última alteração e deixar claro que a remoção dos dados do navegador pode apagar esse armazenamento.

### 5.2. Arquivo JSON

Estrutura inicial sugerida:

```json
{
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-09-20T18:00:00.000Z",
  "settings": {
    "currency": "BRL",
    "locale": "pt-BR",
    "theme": "system"
  },
  "accounts": [],
  "creditCards": [],
  "categories": [],
  "transactions": [],
  "budgets": [],
  "goals": [],
  "recurrenceRules": []
}
```

Requisitos:

- todos os registros terão identificadores UUID;
- valores monetários serão armazenados em centavos, como números inteiros;
- datas seguirão um formato consistente, preferencialmente `YYYY-MM-DD` para datas civis;
- o arquivo será validado antes da importação;
- será apresentado um resumo antes da substituição dos dados atuais;
- o aplicativo criará um backup dos dados atuais antes de concluir a importação;
- versões anteriores do esquema poderão ser migradas;
- totais e outros dados calculados não serão gravados quando puderem ser reconstruídos.

### 5.3. Outras exportações

- exportação CSV das movimentações filtradas;
- PDF para relatórios formatados;
- JSON para backup completo e restauração.

## 6. Arquitetura técnica sugerida

- Angular com componentes standalone;
- TypeScript em modo estrito;
- Angular Material para componentes e acessibilidade;
- Signals e serviços para o estado da aplicação;
- Reactive Forms para cadastros e filtros;
- IndexedDB para persistência local;
- Apache ECharts para gráficos;
- pdfmake para geração de PDFs;
- validação estrutural do JSON importado;
- PWA para instalação e funcionamento offline;
- testes unitários para regras financeiras;
- testes de integração para importação, exportação e persistência.

Organização funcional sugerida:

```text
App
├── Dashboard
├── Movimentações
├── Contas
├── Cartões e faturas
├── Categorias
├── Orçamentos
├── Metas
├── Relatórios e PDF
├── Importação e exportação
└── Configurações
```

## 7. Regras de negócio importantes

- transferências não afetam o total de receitas e despesas;
- uma compra parcelada mantém vínculo entre a compra original e suas parcelas;
- alterações em recorrências distinguem o lançamento atual dos futuros;
- categorias, contas e cartões com histórico devem ser arquivados, não excluídos;
- saldos e consolidações devem considerar a situação e a data das movimentações;
- relatórios devem usar a mesma fonte de cálculo apresentada na interface;
- a importação nunca deve substituir dados silenciosamente;
- operações importantes devem apresentar confirmação e permitir recuperação quando possível;
- cálculos financeiros devem ser centralizados e cobertos por testes.

## 8. Etapas de desenvolvimento

As especificações funcionais detalhadas, dependências e critérios de aceite estão organizados no [índice da documentação](docs/README.md).

### Fase 1 — Base e MVP

- estrutura Angular e identidade visual básica;
- modelos de dados e regras monetárias;
- categorias e contas;
- receitas e despesas;
- pesquisa e filtros;
- dashboard mensal básico;
- gráfico de despesas por categoria;
- persistência automática no IndexedDB;
- importação e exportação JSON;
- layout responsivo.

### Fase 2 — Consolidação financeira

- transferências;
- cartões e faturas;
- compras parceladas;
- lançamentos recorrentes;
- orçamentos mensais;
- exportação CSV;
- PWA e operação offline.

### Fase 3 — Relatórios em PDF

- infraestrutura de documentos com pdfmake;
- resumo mensal consolidado;
- relatório de movimentações filtradas;
- relatórios por categoria, conta e cartão;
- inclusão de gráficos nos PDFs;
- prévia, paginação e testes de documentos extensos.

### Fase 4 — Recursos avançados

- metas financeiras;
- projeções de fluxo de caixa;
- evolução patrimonial;
- comparação entre períodos;
- regras automáticas de categorização;
- múltiplos perfis ou arquivos financeiros;
- criptografia opcional do arquivo de backup.

## 9. Critérios de qualidade

- cálculos consistentes entre dashboard, listagens e PDFs;
- nenhuma dependência de backend para as funções principais;
- funcionamento offline após a primeira instalação;
- importação inválida não altera os dados existentes;
- exportação JSON permite restaurar integralmente o estado da aplicação;
- PDFs legíveis, paginados e corretos para períodos com muitos lançamentos;
- interface acessível por teclado e compatível com diferentes tamanhos de tela;
- mensagens claras para operações de risco, erros e dados vazios.

## 10. Próximos passos

1. Definir as entidades e regras de negócio detalhadas.
2. Criar os wireframes das telas principais.
3. Definir o design visual e a navegação.
4. Montar o backlog da Fase 1 em histórias de usuário.
5. Criar o projeto Angular e a camada de persistência.
6. Implementar o MVP antes de cartões, recorrências e relatórios avançados.
7. Validar os cálculos e o fluxo de backup com dados de exemplo.

O foco inicial deverá ser a confiabilidade do núcleo: movimentações, contas, categorias, cálculos e backup. Os módulos de cartões, recorrências e PDF deverão reutilizar essa mesma base, evitando regras duplicadas e resultados divergentes.
