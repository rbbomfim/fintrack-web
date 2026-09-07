# Testes E2E — FinTrack Pro

Playwright com navegador de verdade contra a **stack que estiver no ar**: abre o
Chromium, faz login pela tela, navega e dá baixa nas contas como o usuário faria.
Não há mock de API — se a stack estiver quebrada, o teste quebra.

## Rodar

```bash
cd fintrack-web

# 1x por máquina
npm ci
npm run e2e:browsers

# com a stack no ar (docker compose up -d na pasta Rafael/)
npm run test:e2e            # headless
npm run test:e2e:headed     # vendo o navegador
npm run test:e2e:ui         # modo interativo
```

## Apontar para outro ambiente

```bash
E2E_BASE_URL=http://192.168.3.12:3011 npm run test:e2e   # servidor do Portainer
```

| Variável            | Padrão                  | Para que serve                                   |
| ------------------- | ----------------------- | ------------------------------------------------ |
| `E2E_BASE_URL`      | `http://localhost:3011` | frontend alvo                                    |
| `E2E_API_BASE_URL`  | lido do `/env.js`       | força a API (normalmente não precisa)            |
| `E2E_ADMIN_USERNAME`/`E2E_ADMIN_PASSWORD` | `admin`/`admin123` | só para provisionar o usuário de teste |
| `E2E_USERNAME`/`E2E_PASSWORD` | `e2e_bot`/`e2e_bot_123` | usuário descartável dos testes       |

## Modo de conexão

A suíte funciona nos dois modos e se adapta sozinha lendo o `/env.js`:

- **same-origin** (padrão): `API_BASE_URL` é `/api` e o nginx do frontend repassa
  para o backend. Não há cross-origin, então o teste de CORS é pulado.
- **direto**: `API_BASE_URL` é uma URL absoluta e o teste de CORS roda.

## Isolamento dos dados

Os testes **não escrevem nada no seu usuário real**:

- todo plano/lançamento é criado no usuário descartável `e2e_bot`, provisionado
  automaticamente pelo `global-setup.js`;
- as escritas usam a competência-sandbox `2035-01`/`2035-02`, longe do mês corrente;
- cada teste marca a descrição com uma tag única (`E2E-XXXX`) e limpa no fim.

A API — corretamente — impede apagar plano recorrente ou plano com baixa já feita
(histórico imutável). Nesses casos a limpeza encerra a recorrência em vez de apagar,
e o resíduo fica no `e2e_bot`.

## Cobertura

| Arquivo                  | O que garante                                                                 |
| ------------------------ | ----------------------------------------------------------------------------- |
| `conectividade.spec.js`  | `env.js` publica um destino usável, a API responde `/health`, o app carrega sem falha de rede, o CORS libera a origem (só em modo direto) e **um PATCH disparado da página chega à API**. São as regressões do `ERR_CONNECTION_REFUSED` e do `Method PATCH is not allowed`. |
| `auth.spec.js`           | senha errada mostra erro, login abre o Dashboard, sessão sobrevive ao reload, logout limpa o token, menu abre todas as telas |
| `baixa-contas.spec.js`   | baixa de conta fixa, baixa de conta variável com valor ajustado, confirmação de receita, recorrência da fixa no mês seguinte, baixa persistida após reload |
| `lancamentos.spec.js`    | cadastro de conta fixa pela UI chegando na tabela de baixa, encerramento de recorrência preservando histórico |
| `manutencao-lancamentos.spec.js` | manutenção completa de entradas e saídas: cadastro, edição refletida na tela de baixa, inativação (encerrar) preservando o histórico pago e limpando a previsão futura, exclusão permitida e exclusão bloqueada com mensagem em português |

## Ao mexer no sistema

Todo ajuste/bug/feature entra aqui: adicione ou estenda o spec da área tocada e
rode `npm run test:e2e` antes de considerar pronto. Falhou? `npm run test:e2e:report`
mostra o trace, o screenshot e o vídeo do passo que quebrou.
