# Etapa 1 — Fundação e experiência

## Objetivo

Criar a base Angular, a navegação e o padrão visual que serão reutilizados por todos os módulos.

## Escopo funcional

- shell da aplicação com cabeçalho, menu lateral e área de conteúdo;
- navegação para Dashboard, Movimentações, Contas, Cartões, Categorias, Orçamentos, Metas, Relatórios e Configurações;
- layout responsivo para celular, tablet e desktop;
- temas claro, escuro e conforme o sistema;
- formatação de moeda e data conforme as configurações;
- notificações de sucesso, aviso e erro;
- diálogos de confirmação para ações sensíveis;
- páginas de estado vazio e rota não encontrada.

## Histórias de usuário

- Como usuário, quero navegar entre os módulos sem recarregar a página.
- Como usuário, quero utilizar o aplicativo no celular e no computador.
- Como usuário, quero escolher um tema visual confortável.
- Como usuário, quero receber mensagens claras sobre o resultado das minhas ações.

## Fluxos principais

### Primeiro acesso

1. O aplicativo abre com configurações padrão para `pt-BR` e `BRL`.
2. Uma apresentação curta explica que os dados ficam no dispositivo.
3. O usuário pode começar um arquivo novo ou importar um backup.
4. Ao continuar, o Dashboard é exibido em estado vazio com uma ação para criar o primeiro lançamento.

### Navegação em dispositivo móvel

1. O menu lateral permanece recolhido.
2. O usuário abre o menu pelo cabeçalho.
3. Após escolher uma seção, o menu é fechado e o foco vai para o conteúdo principal.

## Regras

- preferências visuais não devem fazer parte dos cálculos financeiros;
- ações destrutivas exigem confirmação com descrição do impacto;
- componentes interativos devem apresentar foco visível;
- erros inesperados devem ser registrados localmente sem expor dados financeiros.

## Entregáveis de desenvolvimento

- projeto Angular com componentes standalone e TypeScript estrito;
- Angular Material configurado;
- roteamento com carregamento por funcionalidade;
- tema e tokens visuais;
- componentes compartilhados de página, confirmação, estado vazio e notificação;
- configuração inicial de testes e análise estática.

## Critérios de aceite

- todas as rotas principais podem ser abertas pelo menu;
- a navegação funciona sem recarregar a aplicação;
- não há rolagem horizontal em larguras a partir de 320 px;
- tema, moeda e localidade permanecem após reabrir a aplicação;
- a interface principal pode ser utilizada somente com teclado;
- rotas inválidas exibem uma página de orientação para retornar ao Dashboard.

## Fora do escopo

- cadastros financeiros;
- autenticação;
- sincronização em nuvem;
- relatórios ou cálculos consolidados.
