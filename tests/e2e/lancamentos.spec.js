// Cadastro das contas que alimentam a tabela de baixa.
// Contas fixas = plano MENSAL (se repete). Contas variadas = plano ÚNICO (só o mês).

import { expect, goToView, rowFor, setCompetence, test, topBar } from './support/fixtures.js';
import { SANDBOX_COMPETENCE, runTag } from './support/config.js';
import { createPlan, findEntryByDescription } from './support/api.js';

async function preencherModalNovoLancamento(page, dados) {
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('Novo lançamento');

  await modal.getByLabel('Descrição').fill(dados.descricao);
  await modal.getByLabel('Tipo').selectOption(dados.tipo);
  await modal.getByLabel('Recorrência').selectOption(dados.recorrencia);

  // As categorias recarregam quando o tipo muda; espera a lista popular.
  const categoria = modal.getByLabel('Categoria');
  await expect(categoria.locator('option')).not.toHaveCount(1);
  await categoria.selectOption({ index: 1 });

  await modal.getByLabel('Valor previsto (R$)').fill(dados.valor);
  await modal.getByLabel('Data de vencimento').fill(dados.vencimento);
  await modal.getByLabel('Competência de início').fill(dados.competencia);

  await modal.getByRole('button', { name: 'Criar lançamento' }).click();
  await expect(modal).toHaveCount(0);
}

test.describe('Cadastro de lançamentos', () => {
  test('cadastra uma conta fixa pela UI e ela vira linha de baixa', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Academia ${runTag()}`;

    await setCompetence(appPage, SANDBOX_COMPETENCE);
    await topBar(appPage).getByRole('button', { name: 'Novo lançamento' }).click();
    await preencherModalNovoLancamento(appPage, {
      descricao,
      tipo: 'FIXO',
      recorrencia: 'MENSAL',
      valor: '149,90',
      vencimento: `${SANDBOX_COMPETENCE}-12`,
      competencia: SANDBOX_COMPETENCE,
    });

    // Aparece na lista de lançamentos...
    await goToView(appPage, 'Lançamentos');
    const linha = rowFor(appPage, descricao);
    await expect(linha).toContainText('Custo fixo');
    await expect(linha).toContainText('Mensal');
    await expect(linha).toContainText(/149,90/);

    // ...e chega na tabela de baixa, pendente.
    await goToView(appPage, 'Movimentações');
    await expect(rowFor(appPage, descricao)).toContainText('PENDENTE');

    const entry = await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao);
    expect(entry).not.toBeNull();
    createdPlanIds.push(entry.plan.id);
  });

  test('encerrar a recorrência para de projetar a conta nos meses seguintes', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Streaming ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'FIXO',
      recurrence: 'MENSAL',
      expected_amount: '55.90',
      due_day: 3,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    await goToView(appPage, 'Lançamentos');
    await setCompetence(appPage, SANDBOX_COMPETENCE);

    await rowFor(appPage, descricao)
      .getByRole('button', { name: 'Encerrar recorrência' })
      .click();

    const modal = appPage.getByRole('dialog');
    await modal.locator('input[type="month"]').fill(SANDBOX_COMPETENCE);
    await modal.getByRole('button', { name: /Encerrar/ }).click();
    await expect(modal).toHaveCount(0);

    // O histórico da competência encerrada permanece (regra de ouro da especificação).
    await expect(rowFor(appPage, descricao)).toBeVisible();

    const atual = await api.get(`/plans/${plan.id}`);
    expect(atual.end_competence).toBe(SANDBOX_COMPETENCE);
  });
});
