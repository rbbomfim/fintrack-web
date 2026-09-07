// Manutenção dos registros: cadastro, edição, inativação e exclusão,
// tanto de ENTRADAS (receitas) quanto de SAÍDAS (custos fixos e variáveis).

import { expect, goToView, rowFor, setCompetence, test, topBar } from './support/fixtures.js';
import { SANDBOX_COMPETENCE, SANDBOX_NEXT_COMPETENCE, runTag } from './support/config.js';
import { createPlan, findEntryByDescription } from './support/api.js';

async function abrirLancamentos(page, competence) {
  await goToView(page, 'Lançamentos');
  await setCompetence(page, competence);
  await expect(page.getByText('Planos e lançamentos')).toBeVisible();
}

async function abrirMovimentacoes(page, competence) {
  await goToView(page, 'Movimentações');
  await setCompetence(page, competence);
  await expect(page.getByText('Custos da competência', { exact: true })).toBeVisible();
}

async function criarPeloModal(page, dados) {
  await topBar(page).getByRole('button', { name: 'Novo lançamento' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('Novo lançamento');

  await modal.getByLabel('Descrição').fill(dados.descricao);
  await modal.getByLabel('Tipo').selectOption(dados.tipo);
  await modal.getByLabel('Recorrência').selectOption(dados.recorrencia);

  const categoria = modal.getByLabel('Categoria');
  await expect(categoria.locator('option')).not.toHaveCount(1);
  await categoria.selectOption({ index: 1 });

  await modal.getByLabel('Valor previsto (R$)').fill(dados.valor);
  await modal.getByLabel('Data de vencimento').fill(dados.vencimento);
  await modal.getByLabel('Competência de início').fill(dados.competencia);

  await modal.getByRole('button', { name: 'Criar lançamento' }).click();
  await expect(modal).toHaveCount(0);
}

test.describe('Manutenção de lançamentos - SAIDAS', () => {
  test('cadastra, edita e a edição chega na tela de baixa', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const tag = runTag();
    const descricao = `Mercado ${tag}`;
    const novaDescricao = `Mercado editado ${tag}`;

    await setCompetence(appPage, SANDBOX_COMPETENCE);
    await criarPeloModal(appPage, {
      descricao,
      tipo: 'VARIAVEL',
      recorrencia: 'UNICO',
      valor: '400,00',
      vencimento: `${SANDBOX_COMPETENCE}-18`,
      competencia: SANDBOX_COMPETENCE,
    });

    await abrirLancamentos(appPage, SANDBOX_COMPETENCE);
    await expect(rowFor(appPage, descricao)).toContainText(/400,00/);

    const criado = await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao);
    createdPlanIds.push(criado.plan.id);

    // Edita descrição e valor.
    await rowFor(appPage, descricao).getByRole('button', { name: 'Editar' }).click();
    const modal = appPage.getByRole('dialog');
    await expect(modal).toContainText('Editar plano');
    await modal.getByLabel('Descrição').fill(novaDescricao);
    await modal.getByLabel('Valor previsto (R$)').fill('455,50');
    await modal.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(modal).toHaveCount(0);

    await expect(rowFor(appPage, novaDescricao)).toContainText(/455,50/);

    // A edição precisa valer também para a baixa da competência aberta.
    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);
    await expect(rowFor(appPage, novaDescricao)).toContainText(/455,50/);
  });

  test('exclui custo variável ainda não pago', async ({ appPage, api }) => {
    const descricao = `Cinema ${runTag()}`;
    await createPlan(api, {
      description: descricao,
      type: 'VARIAVEL',
      recurrence: 'UNICO',
      expected_amount: '80.00',
      due_day: 9,
      start_competence: SANDBOX_COMPETENCE,
    });

    await abrirLancamentos(appPage, SANDBOX_COMPETENCE);
    await expect(rowFor(appPage, descricao)).toBeVisible();

    await rowFor(appPage, descricao).getByRole('button', { name: 'Excluir' }).click();
    const modal = appPage.getByRole('dialog');
    await expect(modal).toContainText('Excluir lançamento');
    await modal.getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(modal).toHaveCount(0);

    await expect(rowFor(appPage, descricao)).toHaveCount(0);
    expect(await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao)).toBeNull();
  });

  test('excluir plano recorrente não pode vazar mensagem crua do backend', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Seguro ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'FIXO',
      recurrence: 'MENSAL',
      expected_amount: '99.00',
      due_day: 7,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    await abrirLancamentos(appPage, SANDBOX_COMPETENCE);
    const linha = rowFor(appPage, descricao);

    const excluir = linha.getByRole('button', { name: 'Excluir' });
    if (await excluir.count()) {
      await excluir.click();
      const modal = appPage.getByRole('dialog');
      await modal.getByRole('button', { name: 'Excluir', exact: true }).click();
      await expect(modal).toHaveCount(0);
      // Não pode vazar mensagem crua do backend em inglês.
      await expect(appPage.getByText(/Only single|UNICO plans/i)).toHaveCount(0);
      await expect(appPage.getByText(/Encerrar recorrência/).first()).toBeVisible();
    }

    // O plano continua existindo.
    await expect(rowFor(appPage, descricao)).toBeVisible();
  });

  test('encerrar remove da previsão um mês futuro já materializado', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Consorcio ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'FIXO',
      recurrence: 'MENSAL',
      expected_amount: '310.00',
      due_day: 14,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    // Visitar o mês seguinte MATERIALIZA a entry lá (a listagem gera o que falta).
    await abrirMovimentacoes(appPage, SANDBOX_NEXT_COMPETENCE);
    await expect(rowFor(appPage, descricao)).toContainText('PENDENTE');

    // Agora encerra a partir da competência inicial.
    await abrirLancamentos(appPage, SANDBOX_COMPETENCE);
    await rowFor(appPage, descricao).getByRole('button', { name: 'Encerrar recorrência' }).click();
    const modal = appPage.getByRole('dialog');
    await modal.locator('input[type="month"]').fill(SANDBOX_COMPETENCE);
    await modal.getByRole('button', { name: 'Encerrar recorrência' }).click();
    await expect(modal).toHaveCount(0);

    // A previsão do mês seguinte tem que sumir, como o próprio aviso do modal promete.
    await abrirMovimentacoes(appPage, SANDBOX_NEXT_COMPETENCE);
    await expect(rowFor(appPage, descricao)).toHaveCount(0);
  });

  test('inativar (encerrar) para de projetar, mas preserva o histórico pago', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Ginastica ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'FIXO',
      recurrence: 'MENSAL',
      expected_amount: '120.00',
      due_day: 6,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    // Dá baixa na competência corrente, para provar que o histórico sobrevive.
    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);
    await rowFor(appPage, descricao).getByRole('button', { name: 'Pagar' }).click();
    let modal = appPage.getByRole('dialog');
    await modal.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await expect(modal).toHaveCount(0);
    await expect(rowFor(appPage, descricao)).toContainText('PAGO');

    // Encerra a recorrência a partir desta competência.
    await abrirLancamentos(appPage, SANDBOX_COMPETENCE);
    await rowFor(appPage, descricao).getByRole('button', { name: 'Encerrar recorrência' }).click();
    modal = appPage.getByRole('dialog');
    await modal.locator('input[type="month"]').fill(SANDBOX_COMPETENCE);
    await modal.getByRole('button', { name: 'Encerrar recorrência' }).click();
    await expect(modal).toHaveCount(0);

    // Histórico do mês encerrado permanece pago.
    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);
    await expect(rowFor(appPage, descricao)).toContainText('PAGO');

    // E não é mais projetado adiante.
    await setCompetence(appPage, SANDBOX_NEXT_COMPETENCE);
    await expect(rowFor(appPage, descricao)).toHaveCount(0);
  });
});

test.describe('Manutenção de lançamentos - ENTRADAS', () => {
  test('cadastra receita, edita o previsto e confirma a entrada', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Freela ${runTag()}`;

    await setCompetence(appPage, SANDBOX_COMPETENCE);
    await criarPeloModal(appPage, {
      descricao,
      tipo: 'RECEITA',
      recorrencia: 'UNICO',
      valor: '1200,00',
      vencimento: `${SANDBOX_COMPETENCE}-25`,
      competencia: SANDBOX_COMPETENCE,
    });

    const criado = await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao);
    expect(criado).not.toBeNull();
    createdPlanIds.push(criado.plan.id);

    // Edita o valor previsto antes de confirmar.
    await abrirLancamentos(appPage, SANDBOX_COMPETENCE);
    await rowFor(appPage, descricao).getByRole('button', { name: 'Editar' }).click();
    let modal = appPage.getByRole('dialog');
    await modal.getByLabel('Valor previsto (R$)').fill('1350,00');
    await modal.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(modal).toHaveCount(0);

    // Confirma a entrada na tela de baixa, já com o valor editado.
    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);
    const linha = rowFor(appPage, descricao);
    await expect(linha).toContainText('PREVISTO');
    await expect(linha).toContainText(/1\.350,00/);

    await linha.getByRole('button', { name: 'Confirmar' }).click();
    modal = appPage.getByRole('dialog');
    await expect(modal).toContainText('Confirmar entrada');
    await modal.getByRole('button', { name: 'Confirmar entrada' }).click();
    await expect(modal).toHaveCount(0);

    await expect(linha).toContainText('RECEBIDO');

    const entry = await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao);
    expect(entry.status).toBe('PAGO');
    expect(Number(entry.amount)).toBe(1350);
  });

  test('exclui receita ainda não confirmada', async ({ appPage, api }) => {
    const descricao = `Reembolso ${runTag()}`;
    await createPlan(api, {
      description: descricao,
      type: 'RECEITA',
      recurrence: 'UNICO',
      expected_amount: '300.00',
      due_day: 11,
      start_competence: SANDBOX_COMPETENCE,
    });

    await abrirLancamentos(appPage, SANDBOX_COMPETENCE);
    await rowFor(appPage, descricao).getByRole('button', { name: 'Excluir' }).click();
    const modal = appPage.getByRole('dialog');
    await modal.getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(modal).toHaveCount(0);

    await expect(rowFor(appPage, descricao)).toHaveCount(0);
    expect(await findEntryByDescription(api, SANDBOX_COMPETENCE, descricao)).toBeNull();
  });

  test('não oferece exclusão de lançamento já baixado (histórico imutável)', async ({
    appPage,
    api,
    createdPlanIds,
  }) => {
    const descricao = `Bonus ${runTag()}`;
    const plan = await createPlan(api, {
      description: descricao,
      type: 'RECEITA',
      recurrence: 'UNICO',
      expected_amount: '500.00',
      due_day: 4,
      start_competence: SANDBOX_COMPETENCE,
    });
    createdPlanIds.push(plan.id);

    await abrirMovimentacoes(appPage, SANDBOX_COMPETENCE);
    await rowFor(appPage, descricao).getByRole('button', { name: 'Confirmar' }).click();
    const modal = appPage.getByRole('dialog');
    await modal.getByRole('button', { name: 'Confirmar entrada' }).click();
    await expect(modal).toHaveCount(0);
    await expect(rowFor(appPage, descricao)).toContainText('RECEBIDO');

    // Na tela de lançamentos o botão de excluir não deve nem ser oferecido.
    await abrirLancamentos(appPage, SANDBOX_COMPETENCE);
    await expect(rowFor(appPage, descricao).getByRole('button', { name: 'Excluir' })).toHaveCount(0);
  });
});
