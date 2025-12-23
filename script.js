let bancoDados = [];
let headersBase = [];
let chart;
let ordem = 'DESC';

function toggleOrdem() {
    ordem = ordem === 'DESC' ? 'ASC' : 'DESC';
    gerarAlertas();
}

function parseCSV(texto) {
    const linhas = texto.trim().split(/\r?\n/);
    const headers = linhas.shift().split(',').map(h => h.trim());
    return {
        headers,
        dados: linhas.map(l => {
            const v = l.split(',');
            const o = {};
            headers.forEach((h, i) => o[h] = v[i]?.trim() || '');
            return o;
        })
    };
}

function extrairDataDoNome(nome) {
    const m = nome.match(/(\d{2})_(\d{2})_(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : new Date().toISOString().slice(0, 10);
}

function parsePercent(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(String(v).replace('%', ''));
    return isNaN(n) ? null : n;
}

function normalizarLinha(l) {
    const f = parsePercent(l['Fotocondutor preto (%)']) || 0;
    const u = parsePercent(l['Unidade de imagem (%)']) || 0;
    l['Fotocondutor preto (%)'] = f + u;
    delete l['Unidade de imagem (%)'];

    Object.keys(l).forEach(k => {
        if (l[k] === '' || l[k] == null) l[k] = '0';
    });
    return l;
}

function ehColorida(l) {
    const m = parsePercent(l['Magenta (%)']) || 0;
    const a = parsePercent(l['Amarelo (%)']) || 0;
    const c = parsePercent(l['Ciano (%)']) || 0;
    return !(m === 0 && a === 0 && c === 0);
}

function calcularDiferencas() {
    const map = {};
    bancoDados.forEach(l => {
        if (!map[l['Número de série']]) map[l['Número de série']] = [];
        map[l['Número de série']].push(l);
    });

    Object.values(map).forEach(lista => {
        lista.sort((a, b) => a.Data.localeCompare(b.Data));
        lista.forEach((l, i) => {
            if (i === 0) {
                l['Diferenca Mono'] = 0;
                l['Diferenca Color'] = 0;
            } else {
                l['Diferenca Mono'] = Number(l['Contagem de páginas monocromáticas durante toda a vida útil']) -
                    Number(lista[i - 1]['Contagem de páginas monocromáticas durante toda a vida útil']);
                l['Diferenca Color'] = Number(l['Contagem de páginas coloridas durante toda a vida útil']) -
                    Number(lista[i - 1]['Contagem de páginas coloridas durante toda a vida útil']);
            }
        });
    });
}

function gerarAlertas() {

    const filtroSerie = document.getElementById('filtroSerie').value || 'ALL';
    const filtroSup = document.getElementById('filtroSuprimento').value || 'ALL';
    const filtroStatus = document.getElementById('filtroStatus').value || 'ALL';

    const div = document.getElementById('alertas');
    div.innerHTML = '';

    // Pega sempre o último registro por impressora
    const ultimos = {};
    bancoDados.forEach(l => {
        const serie = l['Número de série'];
        if (!ultimos[serie] || l.Data > ultimos[serie].Data) {
            ultimos[serie] = l;
        }
    });

    let lista = Object.values(ultimos)
        .filter(l => filtroSerie === 'ALL' || l['Número de série'] === filtroSerie);

    // 🔽 ORDENAÇÃO CORRETA BASEADA NO SUPRIMENTO SELECIONADO
    lista.sort((a, b) => {

        function valorOrdenacao(linha) {
            switch (filtroSup) {

                case 'Preto':
                    return parsePercent(linha['Preto (%)']) ?? 0;

                case 'Fotocondutor':
                    return Number(linha['Fotocondutor preto (%)']) ?? 0;

                case 'Kit':
                    return parsePercent(linha['Kit de manutenção (%)']) ?? 0;

                case 'CMY':
                    return Math.min(
                        parsePercent(linha['Ciano (%)']) ?? 100,
                        parsePercent(linha['Magenta (%)']) ?? 100,
                        parsePercent(linha['Amarelo (%)']) ?? 100
                    );

                default:
                    // fallback padrão
                    return parsePercent(linha['Preto (%)']) ?? 0;
            }
        }

        const va = valorOrdenacao(a);
        const vb = valorOrdenacao(b);

        return ordem === 'ASC' ? va - vb : vb - va;
    });

    // 🔔 GERA ALERTAS
    lista.forEach(l => {

        const serie = l['Número de série'];
        const colorida = ehColorida(l);

        const suprimentos = {
            Preto: parsePercent(l['Preto (%)']),
            Fotocondutor: Number(l['Fotocondutor preto (%)']),
            Kit: parsePercent(l['Kit de manutenção (%)'])
        };

        if (colorida) {
            suprimentos.Magenta = parsePercent(l['Magenta (%)']);
            suprimentos.Amarelo = parsePercent(l['Amarelo (%)']);
            suprimentos.Ciano = parsePercent(l['Ciano (%)']);
        }

        Object.entries(suprimentos).forEach(([nome, valor]) => {

            if (valor === null) return;

            let status = 'OK';
            let classe = 'alert-ok';

            if (valor === 0) {
                status = 'CRIT';
                classe = 'alert-danger';
            } else if (valor < 15) {
                status = 'WARN';
                classe = 'alert-warning';
            }

            // 🎯 FILTROS
            if (filtroSup !== 'ALL') {
                if (filtroSup === 'CMY' && !['Ciano', 'Magenta', 'Amarelo'].includes(nome)) return;
                if (filtroSup !== 'CMY' && filtroSup !== nome) return;
            }

            if (filtroStatus !== 'ALL' && filtroStatus !== status) return;

            div.innerHTML += `
                <div class="alert ${classe}">
                    ${serie} – ${nome}: ${valor}%
                </div>
            `;
        });
    });

    if (div.innerHTML === '') {
        div.innerHTML = `<div class="alert alert-ok">🟢 Nenhum alerta encontrado</div>`;
    }
}


function gerarRankingDiario() {
    const map = {};
    bancoDados.forEach(l => {
        const t = Number(l['Diferenca Mono']) + Number(l['Diferenca Color']);
        map[l['Número de série']] = (map[l['Número de série']] || 0) + t;
    });

    const ord = Object.entries(map).sort((a, b) => b[1] - a[1]);
    document.getElementById('ranking').innerHTML = `
 <h3>Top 5</h3><ul>${ord.slice(0, 5).map(i => `<li>${i[0]}: ${i[1]}</li>`).join('')}</ul>
 <h3>Bottom 5</h3><ul>${ord.slice(-5).reverse().map(i => `<li>${i[0]}: ${i[1]}</li>`).join('')}</ul>`;
}

function gerarGrafico() {
    const total = {};
    bancoDados.forEach(l => {
        const t = Number(l['Diferenca Mono']) + Number(l['Diferenca Color']);
        total[l['Número de série']] = (total[l['Número de série']] || 0) + t;
    });

    if (chart) chart.destroy();
    chart = new Chart(document.getElementById('chartPorImpressora'), {
        type: 'bar',
        data: { labels: Object.keys(total), datasets: [{ label: 'Páginas', data: Object.values(total) }] }
    });
}

async function carregarBase() {
    const f = document.getElementById('baseCSV').files[0];
    const t = await f.text();
    const { headers, dados } = parseCSV(t);

    headersBase = headers.filter(h => h !== 'Unidade de imagem (%)');
    ['Fotocondutor preto (%)', 'Data', 'Diferenca Mono', 'Diferenca Color'].forEach(c => {
        if (!headersBase.includes(c)) headersBase.push(c);
    });

    bancoDados = dados.map(l => {
        l.Data = extrairDataDoNome(f.name);
        return normalizarLinha(l);
    });

    calcularDiferencas();
    atualizarFiltro();
    gerarAlertas();
    gerarRankingDiario();
    gerarGrafico();
    atualizarGraficos();
    calcularDiferencaDigitalizacao();

    document.getElementById('dailyCSV').disabled = false;
    document.getElementById('btnAdd').disabled = false;
    document.getElementById('btnExport').disabled = false;
}

async function adicionarCSVDoDia() {
    const f = document.getElementById('dailyCSV').files[0];
    const t = await f.text();
    const { dados } = parseCSV(t);
    const d = extrairDataDoNome(f.name);

    dados.forEach(l => {
        l.Data = d;
        bancoDados.push(normalizarLinha(l));
    });

    calcularDiferencas();
    gerarAlertas();
    gerarRankingDiario();
    gerarGrafico();
    atualizarGraficos();
    calcularDiferencaDigitalizacao();
    document.getElementById('dailyCSV').value = '';
}

function atualizarFiltro() {
    const s = document.getElementById('filtroSerie');
    s.innerHTML = '<option value="ALL">Todas</option>';
    [...new Set(bancoDados.map(l => l['Número de série']))]
        .forEach(v => s.innerHTML += `<option>${v}</option>`);
}

function exportarCSV() {
    let csv = headersBase.join(',') + '\n';
    bancoDados.forEach(l => {
        csv += headersBase.map(h => l[h] ?? 0).join(',') + '\n';
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv]));
    a.download = 'CSV_BASE_HISTORICO.csv';
    a.click();
}
let graficoStatus;
let graficoSuprimentos;

/* ===============================
   STATUS GERAL DO PARQUE
================================ */
function gerarGraficoStatus() {

    let ok = 0, warn = 0, crit = 0;
    const ultimos = obterUltimosRegistros();

    ultimos.forEach(l => {

        const valores = [];

        const preto = parsePercent(l['Preto (%)']);
        if (preto !== null) valores.push(preto);

        if (ehColorida(l)) {
            ['Ciano', 'Magenta', 'Amarelo'].forEach(c => {
                const v = parsePercent(l[`${c} (%)`]);
                if (v !== null) valores.push(v);
            });
        }

        const fotocondutor = Number(l['Fotocondutor preto (%)']);
        if (!isNaN(fotocondutor)) valores.push(fotocondutor);

        const kit = parsePercent(l['Kit de manutenção (%)']);
        if (kit !== null) valores.push(kit);

        const menor = Math.min(...valores);

        if (menor === 0) crit++;
        else if (menor < 15) warn++;
        else ok++;
    });

    if (graficoStatus) graficoStatus.destroy();

    graficoStatus = new Chart(document.getElementById('graficoStatus'), {
        type: 'doughnut',
        data: {
            labels: ['OK', 'Atenção', 'Crítico'],
            datasets: [{
                data: [ok, warn, crit],
                backgroundColor: ['#16a34a', '#facc15', '#dc2626']
            }]
        }
    });
}



/* ===============================
   ATUALIZA TUDO JUNTO
================================ */
function atualizarGraficos() {
    gerarGraficoStatus();
    gerarGraficoDigitalizacoes();

}
function obterUltimosRegistros() {
    const ultimos = {};
    bancoDados.forEach(l => {
        const serie = l['Número de série'];
        if (!ultimos[serie] || l.Data > ultimos[serie].Data) {
            ultimos[serie] = l;
        }
    });
    return Object.values(ultimos);
}
let graficoDigitalizacoes;

/* ===============================
   DIFERENÇA DE DIGITALIZAÇÕES
================================ */
function calcularDiferencaDigitalizacao() {

    const campoDigitalizacao =
        headersBase.find(h =>
            h.toLowerCase().includes('digitaliza')
        );

    if (!campoDigitalizacao) return;

    const map = {};

    bancoDados.forEach(l => {
        if (!map[l['Número de série']]) map[l['Número de série']] = [];
        map[l['Número de série']].push(l);
    });

    Object.values(map).forEach(lista => {
        lista.sort((a, b) => a.Data.localeCompare(b.Data));
        lista.forEach((l, i) => {
            if (i === 0) {
                l['Diferenca Digitalizacao'] = 0;
            } else {
                l['Diferenca Digitalizacao'] =
                    Number(l[campoDigitalizacao]) -
                    Number(lista[i - 1][campoDigitalizacao]);
            }
        });
    });

    if (!headersBase.includes('Diferenca Digitalizacao')) {
        headersBase.push('Diferenca Digitalizacao');
    }
}

/* ===============================
   GRÁFICO DIGITALIZAÇÕES
================================ */
function gerarGraficoDigitalizacoes() {
    const campoDigitalizacao = headersBase.find(h => h.toLowerCase().includes('digitaliza'));
    if (!campoDigitalizacao) {
        console.warn("Campo de digitalização não encontrado!");
        return;
    }

    const map = {};

    // Agrupa registros por impressora
    bancoDados.forEach(l => {
        const serie = l['Número de série'];
        if (!map[serie]) map[serie] = [];
        map[serie].push(l);
    });

    const totalPorSerie = {};

    Object.entries(map).forEach(([serie, lista]) => {
        // Ordena por data
        lista.sort((a, b) => a.Data.localeCompare(b.Data));

        const primeiro = Number(lista[0][campoDigitalizacao]) || 0;
        const ultimo = Number(lista[lista.length - 1][campoDigitalizacao]) || 0;

        const diferenca = ultimo - primeiro;
        if (diferenca > 0) totalPorSerie[serie] = diferenca;
    });

    // Ordena do maior para o menor
    const ordenado = Object.entries(totalPorSerie)
        .sort((a, b) => b[1] - a[1]);

    const labels = ordenado.map(i => i[0]);
    const valores = ordenado.map(i => i[1]);

    // Destrói gráfico antigo se existir
    if (graficoDigitalizacoes) graficoDigitalizacoes.destroy();

    graficoDigitalizacoes = new Chart(
        document.getElementById('graficoDigitalizacoes'),
        {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Digitalizações',
                    data: valores,
                    backgroundColor: '#2563eb'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.raw} digitalizações`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            autoSkip: true,
                            maxRotation: 45,
                            minRotation: 30
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Quantidade de digitalizações'
                        }
                    }
                }
            }
        }
    );

}
function identificarTrocasSuprimentos() {

    const trocas = [];

    const map = {};
    bancoDados.forEach(l => {
        if (!map[l['Número de série']]) map[l['Número de série']] = [];
        map[l['Número de série']].push(l);
    });

    Object.entries(map).forEach(([serie, lista]) => {

        lista.sort((a, b) => a.Data.localeCompare(b.Data));

        for (let i = 1; i < lista.length; i++) {

            const atual = lista[i];
            const anterior = lista[i - 1];

            const suprimentos = [
                { nome: 'Preto', campo: 'Preto (%)' },
                { nome: 'Fotocondutor', campo: 'Fotocondutor preto (%)' },
                { nome: 'Kit de manutenção', campo: 'Kit de manutenção (%)' }
            ];

            if (ehColorida(atual)) {
                ['Ciano', 'Magenta', 'Amarelo'].forEach(c => {
                    suprimentos.push({ nome: c, campo: `${c} (%)` });
                });
            }

            suprimentos.forEach(s => {
                const vAnt = parsePercent(anterior[s.campo]);
                const vAtu = parsePercent(atual[s.campo]);

                if (vAnt !== null && vAtu !== null && vAtu > vAnt + 20) {
                    trocas.push({
                        serie,
                        suprimento: s.nome,
                        data: atual.Data,
                        antes: vAnt,
                        depois: vAtu
                    });
                }
            });
        }
    });

    return trocas;
}
function impressoraQueMaisImprimiu() {

    const total = {};

    bancoDados.forEach(l => {
        const t = Number(l['Diferenca Mono']) + Number(l['Diferenca Color']);
        total[l['Número de série']] = (total[l['Número de série']] || 0) + t;
    });

    const ordenado = Object.entries(total).sort((a, b) => b[1] - a[1]);

    return {
        maior: ordenado[0],
        menor: ordenado[ordenado.length - 1],
        ranking: ordenado
    };
}
function impressoraQueMaisDigitalizou() {
    const campoDigitalizacao =
        headersBase.find(h =>
            h.toLowerCase().includes('digitaliza')
        );

    if (!campoDigitalizacao) {
        return {
            maior: ['—', 0],
            menor: ['—', 0],
            ranking: []
        };
    }

    const map = {};

    // Agrupa registros por impressora
    bancoDados.forEach(l => {
        const serie = l['Número de série'];
        if (!map[serie]) map[serie] = [];
        map[serie].push(l);
    });

    const totalPorSerie = {};

    Object.entries(map).forEach(([serie, lista]) => {

        // Ordena por data
        lista.sort((a, b) => a.Data.localeCompare(b.Data));

        const primeiro = Number(lista[0][campoDigitalizacao]) || 0;
        const ultimo = Number(lista[lista.length - 1][campoDigitalizacao]) || 0;

        const diferenca = ultimo - primeiro;

        totalPorSerie[serie] = diferenca >= 0 ? diferenca : 0;
    });

    const ordenado = Object.entries(totalPorSerie)
        .sort((a, b) => b[1] - a[1]);

    return {
        maior: ordenado[0] || ['—', 0],
        menor: ordenado[ordenado.length - 1] || ['—', 0],
        ranking: ordenado
    };
}
function resumoRiscoParque() {

    const ultimos = obterUltimosRegistros();

    let crit = 0, warn = 0, ok = 0;

    ultimos.forEach(l => {

        const valores = [];

        const preto = parsePercent(l['Preto (%)']);
        if (preto !== null) valores.push(preto);

        if (ehColorida(l)) {
            ['Ciano', 'Magenta', 'Amarelo'].forEach(c => {
                const v = parsePercent(l[`${c} (%)`]);
                if (v !== null) valores.push(v);
            });
        }

        const fot = Number(l['Fotocondutor preto (%)']);
        if (!isNaN(fot)) valores.push(fot);

        const kit = parsePercent(l['Kit de manutenção (%)']);
        if (kit !== null) valores.push(kit);

        const menor = Math.min(...valores);

        if (menor === 0) crit++;
        else if (menor < 15) warn++;
        else ok++;
    });

    return { crit, warn, ok, total: ultimos.length };
}
function gerarRelatorioPeriodo() {

    const trocas = identificarTrocasSuprimentos();
    const imp = impressoraQueMaisImprimiu();
    const dig = impressoraQueMaisDigitalizou();
    const risco = resumoRiscoParque();

    return {
        periodo: {
            inicio: bancoDados[0]?.Data,
            fim: bancoDados[bancoDados.length - 1]?.Data
        },
        trocasSuprimentos: trocas,
        impressao: {
            maior: imp.maior,
            menor: imp.menor
        },
        digitalizacao: {
            maior: dig.maior,
            menor: dig.menor
        },
        riscoParque: risco
    };
}
function exibirRelatorioPeriodo() {

    if (bancoDados.length === 0) {
        alert('Carregue uma base CSV primeiro.');
        return;
    }

    const rel = gerarRelatorioPeriodo();

    /* ===============================
       IMPRESSÃO
    ============================== */
    document.getElementById('relatorioImpressaoMaior').innerHTML = `
        <strong>${rel.impressao.maior[0]}</strong><br>
        ${rel.impressao.maior[1]} páginas no período
    `;
    document.getElementById('relatorioImpressaoMenor').innerHTML = `
        <strong>${rel.impressao.menor[0]}</strong><br>
        ${rel.impressao.menor[1]} páginas no período
    `;


    /* ===============================
       DIGITALIZAÇÃO
    ============================== */
    document.getElementById('relatorioDigitalizacaoMaior').innerHTML = `
        <strong>${rel.digitalizacao.maior[0]}</strong><br>
        ${rel.digitalizacao.maior[1]} digitalizações `;

    document.getElementById('relatorioDigitalizacaoMenor').innerHTML = `
        <strong>${rel.digitalizacao.menor[0]}</strong><br>
        ${rel.digitalizacao.menor[1]} digitalizações
    `;

    /* ===============================
       SAÚDE DO PARQUE
    ============================== */
    document.getElementById('relatorioRisco').innerHTML = `
        🟢 OK: ${rel.riscoParque.ok}<br>
        🟡 Atenção: ${rel.riscoParque.warn}<br>
        🔴 Crítico: ${rel.riscoParque.crit}<br>
        <small>Total: ${rel.riscoParque.total} impressoras</small>
    `;

    /* ===============================
       TROCAS DE SUPRIMENTOS
    ============================== */
    const divTrocas = document.getElementById('listaTrocas');
    divTrocas.innerHTML = '';

    if (rel.trocasSuprimentos.length === 0) {
        divTrocas.innerHTML = `<p class="muted">Nenhuma troca identificada no período.</p>`;
        return;
    }

    rel.trocasSuprimentos.forEach(t => {
        divTrocas.innerHTML += `
            <div class="troca-item">
                <span>${t.serie}</span><br>
                ${t.suprimento} — ${t.antes}% → ${t.depois}%<br>
                <small>📅 ${t.data}</small>
            </div>
        `;
    });
}
async function gerarRelatorioExecutivoPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const container = document.getElementById('relatorioContainer');
    container.style.display = 'block'; // mostrar temporariamente

    // ----------------------------
    // Obter relatório do período
    // ----------------------------
    const rel = gerarRelatorioPeriodo();

    // ----------------------------
    // 1️⃣ Período do relatório
    // ----------------------------
    const inicioPeriodo = rel.periodo.inicio || '—';
    const fimPeriodo = rel.periodo.fim || '—';
    document.getElementById('relPeriodoInicio').textContent = inicioPeriodo;
    document.getElementById('relPeriodoFim').textContent = fimPeriodo;

    // ----------------------------
    // 2️⃣ Impressão
    // ----------------------------
    document.getElementById('relImpressaoMaior').textContent = `${rel.impressao.maior[0]} — ${rel.impressao.maior[1]} páginas`;
    document.getElementById('relImpressaoMenor').textContent = `${rel.impressao.menor[0]} — ${rel.impressao.menor[1]} páginas`;

    // ----------------------------
    // 3️⃣ Digitalização
    // ----------------------------
    document.getElementById('relDigitalizacaoMaior').textContent = `${rel.digitalizacao.maior[0]} — ${rel.digitalizacao.maior[1]} digitalizações`;
    document.getElementById('relDigitalizacaoMenor').textContent = `${rel.digitalizacao.menor[0]} — ${rel.digitalizacao.menor[1]} digitalizações`;

    // ----------------------------
    // 4️⃣ Saúde do Parque
    // ----------------------------
    document.getElementById('relSaudeOk').textContent = rel.riscoParque.ok;
    document.getElementById('relSaudeWarn').textContent = rel.riscoParque.warn;
    document.getElementById('relSaudeCrit').textContent = rel.riscoParque.crit;

    // ----------------------------
    // 5️⃣ Trocas de Suprimentos
    // ----------------------------
    const relTrocas = document.getElementById('relTrocas');
    relTrocas.innerHTML = '';
    if (rel.trocasSuprimentos.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Nenhuma troca identificada no período.';
        relTrocas.appendChild(li);
    } else {
        rel.trocasSuprimentos.forEach(t => {
            const li = document.createElement('li');
            li.textContent = `${t.serie} — ${t.suprimento}: ${t.antes}% → ${t.depois}% (📅 ${t.data})`;
            relTrocas.appendChild(li);
        });
    }

    // ----------------------------
    // 6️⃣ Ranking de Impressoras (Top 5 + Bottom 5)
    // ----------------------------
    const relRanking = document.getElementById('relRanking');
    relRanking.innerHTML = '';
    const ranking = impressoraQueMaisImprimiu().ranking;
    const top5 = ranking.slice(0, 5);
    const bottom5 = ranking.slice(-5).reverse();

    relRanking.innerHTML += '<strong>Top 5:</strong>';
    top5.forEach(r => {
        const li = document.createElement('li');
        li.textContent = `${r[0]} — ${r[1]} páginas`;
        relRanking.appendChild(li);
    });

    relRanking.innerHTML += '<strong>Bottom 5:</strong>';
    bottom5.forEach(r => {
        const li = document.createElement('li');
        li.textContent = `${r[0]} — ${r[1]} páginas`;
        relRanking.appendChild(li);
    });

    // ----------------------------
    // 7️⃣ Gerar PDF com html2canvas ajustando proporção
    // ----------------------------
    const canvas = await html2canvas(container, {
        scale: 2,            // resolução menor para caber tudo
        useCORS: true,
        backgroundColor: '#f4f6f8'
    });

    const imgData = canvas.toDataURL('image/png');
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = doc.internal.pageSize.getWidth() - 40;  // margem
    const pdfHeight = doc.internal.pageSize.getHeight() - 40; // margem
    const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

    // Se a altura da imagem for maior que a altura do PDF, redimensiona proporcionalmente
    const finalHeight = imgHeight > pdfHeight ? pdfHeight : imgHeight;

    doc.addImage(imgData, 'PNG', 20, 20, pdfWidth, finalHeight);

    // ----------------------------
    // Salvar PDF
    // ----------------------------
    doc.save(`Relatorio_Executivo_Impressoras_${inicioPeriodo}_a_${fimPeriodo}.pdf`);

    container.style.display = 'none'; // esconder novamente
}








