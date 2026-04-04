# fintrack-web

Frontend do FinTrack Pro em Vite + React, servido por Nginx em contêiner dedicado e configurado em tempo de execução via `env.js`.

## Principais recursos

- login com JWT consumindo o backend FastAPI
- troca obrigatória de senha no primeiro acesso ou após reset administrativo
- dashboard com KPIs, gráficos e projeção de 6 meses
- cadastro, edição, exclusão e encerramento de custos fixos
- painel administrativo para criação e reset de usuários
- gestão administrativa de categorias e configurações de notificação
- suíte E2E com Playwright usando API mockada para proteger a migração de stack

## Arquivos relevantes

- `src/App.jsx`: aplicação React principal
- `src/main.jsx`: bootstrap do React
- `assets/styles.css`: estilos customizados do frontend
- `public/env.js`: fallback local para desenvolvimento
- `playwright.config.js`: configuração da suíte E2E
- `tests/e2e/app.spec.js`: cenários principais de smoke test
- `env.template.js`: template do endpoint da API injetado no startup do contêiner
- `docker-entrypoint.sh`: gera `env.js` e inicia o Nginx

## CI

- workflow em `.github/workflows/ci.yml`
- valida `npm run build`, executa os smoke tests E2E e depois valida o build Docker em cada `push` e `pull_request`

## Desenvolvimento local

```bash
npm install
npm run dev
```

Por padrão, o arquivo `public/env.js` aponta para `http://localhost:8011`. Em contêiner, o `docker-entrypoint.sh` sobrescreve esse arquivo com os valores de ambiente.