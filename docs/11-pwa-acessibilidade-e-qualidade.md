# Etapa 11 — PWA, acessibilidade e qualidade

## Objetivo

Preparar a aplicação para uso contínuo, offline e confiável, garantindo acessibilidade, desempenho, segurança local e qualidade dos cálculos.

## PWA e funcionamento offline

- manifesto com nome, ícones e cores;
- instalação em dispositivos compatíveis;
- cache do shell e dos recursos estáticos;
- abertura sem conexão após o primeiro carregamento;
- aviso claro quando uma nova versão estiver disponível;
- atualização sem perda do estado local;
- página offline útil para falhas não previstas.

## Acessibilidade

- navegação completa por teclado;
- ordem de foco previsível;
- foco devolvido corretamente ao fechar diálogos;
- rótulos e mensagens de erro associados aos campos;
- contraste adequado;
- ícones acompanhados por nomes acessíveis;
- gráficos com resumo textual ou tabela equivalente;
- anúncios apropriados para salvamento e erros;
- respeito à preferência de redução de movimento.

## Desempenho

- carregamento sob demanda por funcionalidade;
- agregações eficientes e memoizadas quando apropriado;
- listas extensas paginadas ou virtualizadas;
- geração de PDF sem bloquear desnecessariamente a interface;
- testes com volume representativo de anos de movimentações;
- limites documentados para importação e relatórios.

## Segurança e privacidade

- nenhuma telemetria contendo dados financeiros;
- nenhum envio de arquivos a servidores;
- prevenção de injeção ao exibir textos importados;
- validação rigorosa de arquivos;
- limpeza explícita de dados e objetos temporários;
- aviso de que dados locais podem ser perdidos ao limpar o navegador;
- criptografia de backup tratada como evolução separada, não como promessa implícita.

## Estratégia de testes

### Testes unitários

- dinheiro e arredondamento;
- saldos;
- consolidação por período;
- parcelamentos;
- competência de faturas;
- transferências;
- recorrências;
- orçamentos;
- migrações e validação de arquivos.

### Testes de integração

- persistência e recuperação;
- importação e exportação completa;
- atualização de saldos após ações;
- geração de relatórios;
- migração entre versões.

### Testes ponta a ponta

- primeiro acesso e primeiro lançamento;
- fechamento mensal básico;
- compra parcelada e pagamento da fatura;
- exportação, limpeza e restauração;
- geração do resumo mensal em PDF.

## Observabilidade local

- erros técnicos podem ser registrados localmente de forma sanitizada;
- a interface deve oferecer uma forma de copiar informações técnicas sem incluir dados financeiros;
- logs temporários devem ter limite de tamanho e opção de limpeza.

## Critérios de aceite

- o aplicativo abre e consulta dados existentes sem internet;
- instalar ou atualizar a PWA não apaga o banco local;
- fluxos críticos são utilizáveis somente com teclado;
- cálculos críticos possuem cobertura automatizada;
- a aplicação permanece responsiva com o volume de referência definido;
- textos importados são exibidos como texto, nunca executados;
- a suíte de testes e a construção de produção passam sem erros;
- a documentação informa claramente as limitações de armazenamento e backup.

## Dependências

- a infraestrutura começa na Etapa 1;
- as validações finais acompanham todos os módulos implementados;
- o marco só termina depois da integração da Etapa 10.
