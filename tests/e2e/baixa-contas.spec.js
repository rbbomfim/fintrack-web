// Fluxo de BAIXA DE CONTAS — o coração do sistema.
//
// Tela "Movimentações": as contas da competência aparecem em uma tabela e a baixa
// é a mudança de status PENDENTE -> PAGO (com o valor real efetivamente pago).
// A tabela é alimentada pelos planos: contas FIXAS (recorrência MENSAL, se repetem
// todo mês) e contas VARIÁVEIS (recorrência ÚNICA, valem só naquela competência).

import { expect, goToView, rowFor, setCompetence, test } from './support/fixtures.js';
import { SANDBOX_COMPETENCE, SANDBOX_NEXT_COMPETENCE, runTag } from './support/config.js';
import { createPlan, findEntryByDescription } from './support/api.js';

async function abrirMovimentacoes(page, competence) {
  await goToView(page, 'Movimentações');
  await setCompetence(page, competence);
  await expect(page.getByText('Custos da competência', { exact: true })).toBeVisible();
}

async function darBaixa(page, descricao, valor) {
  await rowFor(page, descricao).getByRole('button', { name: 'Pagar' }).click();

  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('Confirmar pagamento');
  await expect(modal).toContainText(descricao);

  if (valor !== undefined) {
    await modal.getByRole('textbox').fill(valor);
  }
  await modal.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect(modal).toHaveCount(0);
}

test.describe('Baixa de contas (Movimentações)', () => {
  test('conta fixa: dá baixa com o valor previsto e o status vira PAGO', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Aluguel ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'FIXO',
      recurrence: 'MENSAL',
      expected_amount: '1500.00',
      due_day: 10,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);

    const linha = rowFor(appPage, descricao);
    await expect(linha).toContainText('Custo fixo');
    await expect(linha).toContainText('PENDENTE');
    await expect(linha).toContainText(/1\.500,00/);

    await darBaixa(appPage, descricao);

    await expect(linha).toContainText('PAGO');
    await expect(linha.getByRole('button', { name: 'Pagar' })).toHaveCount(0);

    // A baixa tem que ter persistido no backend, não só na tela.
    const entry = await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao);
    expect(entry.status).toBe('PAGO');
    expect(Number(entry.amount)).toBe(1500);
    expect(entry.paid_at).not.toBeNull();
  });

  test('conta variável: dá baixa com valor ajustado e grava o valor real', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Dentista ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'VARIAVEL',
      recurrence: 'UNICO',
      expected_amount: '320.00',
      due_day: 15,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);

    const linha = rowFor(appPage, descricao);
    await expect(linha).toContainText('Custo variável');
    await expect(linha).toContainText('PENDENTE');

    // Pagou menos que o previsto: a baixa aceita o valor real da competência.
    await darBaixa(appPage, descricao, '289,90');

    await expect(linha).toContainText('PAGO');
    await expect(linha).toContainText(/289,90/);

    const entry = await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao);
    expect(entry.status).toBe('PAGO');
    expect(Number(entry.amount)).toBe(289.9);
    // O plano não muda: o ajuste vale só para esta competência.
    expect(Number(entry.expected_amount)).toBe(320);
  });

  test('entrada (receita): confirmar deixa o status RECEBIDO', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Salário ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'RECEITA',
      recurrence: 'UNICO',
      expected_amount: '8500.00',
      due_day: 5,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);

    const linha = rowFor(appPage, descricao);
    await expect(linha).toContainText('PREVISTO');

    await linha.getByRole('button', { name: 'Confirmar' }).click();
    const modal = appPage.getByRole('dialog');
    await expect(modal).toContainText('Confirmar entrada');
    await modal.getByRole('button', { name: 'Confirmar entrada' }).click();
    await expect(modal).toHaveCount(0);

    await expect(linha).toContainText('RECEBIDO');

    const entry = await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao);
    expect(entry.status).toBe('PAGO');
  });

  test('a conta fixa reaparece PENDENTE no mês seguinte; a variável não', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const tag = runTag();
    const fixa = `Internet ${tag}`;
    const variavel = `Presente ${tag}`;

    const planoFixo = await createPlan(api, {
      description: fixa,
      type: 'FIXO',
      recurrence: 'MENSAL',
      expected_amount: '129.90',
      due_day: 20,
      start_competence: SANDBOX_COMPETENCE,
    });
    const planoVariavel = await createPlan(api, {
      description: variavel,
      type: 'VARIAVEL',
      recurrence: 'UNICO',
      expected_amount: '250.00',
      due_day: 20,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(planoFixo.id, planoVariavel.id);

    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);
    await darBaixa(appPage, fixa);
    await expect(rowFor(appPage, fixa)).toContainText('PAGO');

    // Mês seguinte: a recorrência regenera a fixa zerada, pronta para nova baixa.
    await setCompetence(appPage, SANDBOX_NEXT_COMPETENCE);

    const linhaFixaProximoMes = rowFor(appPage, fixa);
    await expect(linhaFixaProximoMes).toContainText('PENDENTE');
    await expect(linhaFixaProximoMes.getByRole('button', { name: 'Pagar' })).toBeVisible();

    // A variável era de uma competência só.
    await expect(rowFor(appPage, variavel)).toHaveCount(0);
  });

  test('a baixa continua valendo depois de recarregar a página', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Energia ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'FIXO',
      recurrence: 'MENSAL',
      expected_amount: '210.00',
      due_day: 8,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);
    await darBaixa(appPage, descricao);
    await expect(rowFor(appPage, descricao)).toContainText('PAGO');

    await appPage.reload();
    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);

    await expect(rowFor(appPage, descricao)).toContainText('PAGO');
  });
});
