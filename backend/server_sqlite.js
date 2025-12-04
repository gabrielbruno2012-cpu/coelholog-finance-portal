const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require("multer");
const sqlite3 = require('sqlite3').verbose();

const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Caminho do banco correto
const DB = path.join(__dirname, "sql", "coelholog.db");
const db = new sqlite3.Database(DB);

// ======================================
// LOGIN
// ======================================
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get(
        `SELECT id, nome, email, role 
         FROM usuarios 
         WHERE email = ? AND senha = ?`,
        [email, password],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'db' });
            if (!row) return res.status(401).json({ error: 'invalid' });
            res.json(row);
        }
    );
});

// ======================================
// USUÁRIOS
// ======================================
app.get('/api/usuarios', (req, res) => {
    db.all(
        `SELECT id, nome, email, role, cnpj, telefone 
         FROM usuarios ORDER BY id`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'db' });
            res.json(rows);
        }
    );
});

app.post('/api/usuarios', (req, res) => {
    const { nome, email, senha, role, cnpj, telefone } = req.body;

    db.get(
        `SELECT id FROM usuarios WHERE email = ?`,
        [email],
        (err, row) => {
            if (row) return res.status(409).json({ error: 'exists' });

            db.run(
                `INSERT INTO usuarios (nome, email, senha, role, cnpj, telefone)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [nome, email, senha, role || 'colaborador', cnpj || '', telefone || ''],
                function (err2) {
                    if (err2) return res.status(500).json({ error: 'db' });

                    db.get(
                        `SELECT id, nome, email, role 
                         FROM usuarios WHERE id = ?`,
                        [this.lastID],
                        (err3, user) => {
                            res.json(user);
                        }
                    );
                }
            );
        }
    );
});

// ======================================
// RECEBÍVEIS
// ======================================
app.get('/api/recebiveis', (req, res) => {
    const userId = req.query.user_id;

    let sql = `
        SELECT r.id, r.usuario_id, u.nome, r.data, r.valor, r.tipo, r.status
        FROM recebiveis r
        LEFT JOIN usuarios u ON u.id = r.usuario_id
    `;

    const params = [];

    if (userId) {
        sql += ` WHERE r.usuario_id = ?`;
        params.push(userId);
    }

    sql += ` ORDER BY r.id DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'db' });
        res.json(rows);
    });
});

app.post('/api/recebiveis', (req, res) => {
    const { usuario_id, data, valor, tipo, status } = req.body;

    db.run(
        `INSERT INTO recebiveis (usuario_id, data, valor, tipo, status)
         VALUES (?, ?, ?, ?, ?)`,
        [usuario_id, data, valor, tipo, status || 'Pendente'],
        function (err) {
            if (err) return res.status(500).json({ error: 'db' });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/recebiveis/:id', (req, res) => {
    const id = req.params.id;
    const { data, valor, tipo, status } = req.body;

    db.run(
        `UPDATE recebiveis 
         SET data = ?, valor = ?, tipo = ?, status = ? 
         WHERE id = ?`,
        [data, valor, tipo, status, id],
        function (err) {
            if (err) return res.status(500).json({ error: 'db' });
            res.json({ ok: true });
        }
    );
});

// ======================================
// EMPRÉSTIMOS
// ======================================
app.get('/api/emprestimos', (req, res) => {
    const userId = req.query.user_id;

    let sql = `
        SELECT e.id, e.usuario_id, u.nome, e.valor, 
               e.parcelamentos, e.status, e.criado_em
        FROM emprestimos e
        LEFT JOIN usuarios u ON u.id = e.usuario_id
    `;

    const params = [];

    if (userId) {
        sql += ` WHERE e.usuario_id = ?`;
        params.push(userId);
    }

    sql += ` ORDER BY e.id DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'db' });
        res.json(rows);
    });
});

app.post('/api/emprestimos', (req, res) => {
    const { usuario_id, valor, parcelamentos } = req.body;

    db.get(
        `SELECT id FROM emprestimos 
         WHERE usuario_id = ? AND status IN ("Em análise", "Aprovado")`,
        [usuario_id],
        (err, row) => {
            if (row) {
                return res.status(400).json({ error: 'Já existe um empréstimo ativo' });
            }

            db.run(
                `INSERT INTO emprestimos 
                 (usuario_id, valor, parcelamentos, status, criado_em)
                 VALUES (?, ?, ?, ?, datetime("now"))`,
                [usuario_id, valor, parcelamentos, 'Em análise'],
                function (err2) {
                    if (err2) return res.status(500).json({ error: 'db' });
                    res.json({ id: this.lastID, status: 'Em análise' });
                }
            );
        }
    );
});

app.put('/api/emprestimos/:id', (req, res) => {
    const { status, valor, parcelamentos } = req.body;
    const id = req.params.id;

    db.run(
        `UPDATE emprestimos 
         SET status = ?, valor = ?, parcelamentos = ?
         WHERE id = ?`,
        [status, valor, parcelamentos, id],
        function (err) {
            if (err) return res.status(500).json({ error: 'db' });
            res.json({ ok: true });
        }
    );
});

// ======================================
// CLIENTES EMPRESAS
// ======================================
app.get('/api/clientes', (req, res) => {
    db.all(
        `SELECT * FROM clientes_empresas ORDER BY id DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'db' });
            res.json(rows);
        }
    );
});

app.post('/api/clientes', (req, res) => {
    const { nome, cnpj, telefone, email, endereco, obs } = req.body;

    db.run(
        `INSERT INTO clientes_empresas 
         (nome, cnpj, telefone, email, endereco, obs)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, cnpj, telefone, email, endereco, obs],
        function (err) {
            if (err) return res.status(500).json({ error: 'db' });
            res.json({ id: this.lastID });
        }
    );
});

// ======================================
// FATURAMENTO
// ======================================
app.get('/api/faturamento', (req, res) => {
    db.all(
        `SELECT 
            f.id,
            f.cliente_id,
            c.nome AS cliente_nome,
            f.mes,
            f.ano,
            f.valor,
            f.obs,
            f.criado_em
        FROM faturamento f
        LEFT JOIN clientes_empresas c 
               ON c.id = f.cliente_id
        ORDER BY f.id DESC`,
        [],
        (err, rows) => {
            if (err) {
    console.error("ERRO SQLITE:", err);
    return res.status(500).json({ error: 'db' });
}
            res.json(rows);
        }
    );
});

app.get('/api/faturamento/cliente/:id', (req, res) => {
    const id = req.params.id;

    db.all(
        `SELECT 
            f.id,
            f.cliente_id,
            c.nome AS cliente_nome,
            f.mes,
            f.ano,
            f.valor,
            f.obs,
            f.criado_em
        FROM faturamento f
        LEFT JOIN clientes_empresas c 
               ON c.id = f.cliente_id
        WHERE f.cliente_id = ?
        ORDER BY f.id DESC`,
        [id],
        (err, rows) => {
           if (err) {
    console.error("ERRO SQLITE:", err);
    return res.status(500).json({ error: 'db' });
}
            res.json(rows);
        }
    );
});

app.post('/api/faturamento', (req, res) => {
    const { cliente_id, mes, ano, valor, observacoes } = req.body;
    const obs = observacoes || "";


    db.run(
        `INSERT INTO faturamento 
         (cliente_id, mes, ano, valor, obs, criado_em)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [cliente_id, mes, ano, valor, obs || ""],
        function (err) {
            if (err) {
    console.error("ERRO SQLITE:", err);
    return res.status(500).json({ error: 'db' });
}
            res.json({
                id: this.lastID,
                cliente_id,
                mes,
                ano,
                valor,
                obs
            });
        }
    );
});

/// ============================
//   LANÇAR PRODUÇÃO (CORRIGIDO)
// ============================

app.post('/api/producao', (req, res) => {
    const {
        usuario_id,
        data,
        entregas,
        valor_por_entrega,
        producao_fs,
        valor_fs,
        producao_bobina,
        valor_bobina,
        fixo_diaria,
        desconto,
        total_calculado,
        obs
    } = req.body;

    if (!usuario_id || !data) {
        return res.status(400).json({ error: "missing_params" });
    }

    const sql = `
        INSERT INTO producao_colaborador (
            usuario_id,
            data,
            entregas,
            valor_por_entrega,
            producao_fs,
            valor_fs,
            producao_bobina,
            valor_bobina,
            fixo_diaria,
            desconto,
            total_calculado,
            obs,
            criado_em
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    const params = [
        usuario_id,
        data,
        entregas,
        valor_por_entrega,
        producao_fs,
        valor_fs,
        producao_bobina,
        valor_bobina,
        fixo_diaria,
        desconto,
        total_calculado,
        obs || ""
    ];

    db.run(sql, params, function (err) {
        if (err) {
            console.log("Erro INSERT produção:", err);
            return res.status(500).json({ error: "db" });
        }

        res.json({ ok: true, id: this.lastID });
    });
});


// ======================================
// PRODUÇÃO - BUSCAR POR COLABORADOR
// ======================================
app.get('/api/producao/colaborador', (req, res) => {
    const { usuario_id, mes, ano } = req.query;

    if (!usuario_id || !mes || !ano) {
        return res.status(400).json({ error: "params" });
    }

    const sql = `
        SELECT 
            p.id,
            p.usuario_id,
            u.nome AS colaborador,
            p.data,
            p.entregas,
            p.valor_por_entrega,
            p.producao_fs,
            p.valor_fs,
            p.producao_bobina,
            p.valor_bobina,
            p.fixo_diaria,
            p.desconto,
            p.total_calculado,
            p.obs,
            p.nota,
            p.nota_status
        FROM producao_colaborador p
        LEFT JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.usuario_id = ?
          AND strftime('%m', p.data) = ?
          AND strftime('%Y', p.data) = ?
        ORDER BY p.data ASC
    `;

    db.all(sql, [usuario_id, mes, ano], (err, rows) => {
        if (err) {
            console.log("Erro SELECT produção:", err);
            return res.status(500).json({ error: "db" });
        }

        res.json(rows);
    });
});

// ======================================
// UPLOAD NOTA 
// ======================================
// pasta onde vão ficar as notas
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, "uploads/notas/");
    },
    filename: function(req, file, cb) {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ======================================
// UPLOAD DE NOTA (COM TRAVA)
// ======================================

app.post("/api/producao/enviar-nota", upload.single("nota"), (req, res) => {
    const { producao_id, usuario_id } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: "Arquivo não enviado" });
    }

    const arquivo = req.file.filename;

    // 1️⃣ Verificar se a produção existe e se a nota pode ser enviada
    db.get(`
        SELECT nota_status 
        FROM producao_colaborador 
        WHERE id = ? AND usuario_id = ?
    `, [producao_id, usuario_id], (err, row) => {

        if (!row) {
            return res.status(404).json({ error: "Produção não encontrada" });
        }

        // Se já enviou e está pendente ou aprovado → TRAVA
        if (row.nota_status === "pendente" || row.nota_status === "aprovado") {
            return res.status(403).json({
                error: "Nota já enviada. Aguarde análise do administrador."
            });
        }

        // 2️⃣ Permitir envio caso esteja recusada ou null
        db.run(`
            UPDATE producao_colaborador
            SET nota = ?, nota_status = 'pendente'
            WHERE id = ? AND usuario_id = ?
        `, [arquivo, producao_id, usuario_id], (err2) => {

            if (err2) {
                return res.status(500).json({ error: "Erro ao salvar nota" });
            }

            res.json({
                success: true,
                file: arquivo,
                status: "pendente"
            });
        });
    });
});

// ======================================
// ADMIN - APROVAR NOTA
// ======================================
app.put("/api/producao/aprovar-nota/:id", (req, res) => {
    db.run(`
        UPDATE producao_colaborador
        SET nota_status = 'aprovado'
        WHERE id = ?
    `, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: "db" });
        res.json({ ok: true });
    });
});

// ======================================
// ADMIN - RECUSAR NOTA
// ======================================
app.put("/api/producao/recusar-nota/:id", (req, res) => {
    db.run(`
        UPDATE producao_colaborador
        SET nota = NULL,
            nota_status = 'recusado'
        WHERE id = ?
    `, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: "db" });
        res.json({ ok: true });
    });
});

// ======================================
// ADMIN – LISTAR TODAS AS PRODUÇÕES PENDENTES
// ======================================
app.get("/api/producao/pendentes", (req, res) => {
    const sql = `
        SELECT 
            p.id,
            p.data,
            p.total_calculado,
            p.nota,
            p.nota_status,
            u.nome AS colaborador
        FROM producao_colaborador p
        LEFT JOIN usuarios u ON u.id = p.usuario_id
        WHERE p.nota_status = 'pendente'
        ORDER BY p.data DESC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "db" });
        res.json(rows);
    });
});

app.post('/api/campanhas/criar', (req, res) => {
  const { nome, descricao, periodo_inicio, periodo_fim, meta_sla, tema } = req.body;

  if (!nome || !periodo_inicio || !periodo_fim) {
    return res.status(400).json({ erro: "Campos obrigatórios não preenchidos." });
  }

  const sql = `
    INSERT INTO campanhas 
    (nome, descricao, periodo_inicio, periodo_fim, meta_sla, tema) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [nome, descricao, periodo_inicio, periodo_fim, meta_sla, tema], function (err) {
    if (err) return res.status(500).json({ erro: "Erro ao criar campanha." });
    res.json({ ok: true, campanha_id: this.lastID });
  });
});

app.get('/api/campanhas/listar', (req, res) => {
  db.all("SELECT * FROM campanhas ORDER BY periodo_inicio DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ erro: "Erro ao listar campanhas." });
    res.json(rows);
  });
});

app.post('/api/campanhas/status', (req, res) => {
  const { campanha_id, ativa } = req.body;

  db.run("UPDATE campanhas SET ativa = ? WHERE id = ?", [ativa, campanha_id], (err) => {
    if (err) return res.status(500).json({ erro: "Erro ao atualizar campanha." });
    res.json({ ok: true });
  });
});

app.post('/api/campanhas/pontos/salvar', (req, res) => {
  const { campanha_id, usuario_id, semana, pontos, bonus_estimado, sla_semana, observacao } = req.body;

  if (!campanha_id || !usuario_id || !semana) {
    return res.status(400).json({ erro: "Campos obrigatórios não preenchidos." });
  }

  const sql = `
    INSERT INTO campanhas_pontos_semanais
    (campanha_id, usuario_id, semana, pontos, bonus_estimado, sla_semana, observacao)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [campanha_id, usuario_id, semana, pontos, bonus_estimado, sla_semana, observacao], function (err) {
    if (err) return res.status(500).json({ erro: "Erro ao registrar pontos." });
    res.json({ ok: true, id: this.lastID });
  });
});

app.get('/api/campanhas/pontos/listar', (req, res) => {
  const { campanha_id } = req.query;

  db.all(`
    SELECT cps.*, u.nome as colaborador 
    FROM campanhas_pontos_semanais cps
    LEFT JOIN usuarios u ON u.id = cps.usuario_id
    WHERE cps.campanha_id = ?
    ORDER BY cps.semana ASC
  `, [campanha_id], (err, rows) => {
    if (err) return res.status(500).json({ erro: "Erro ao listar pontos." });
    res.json(rows);
  });
});

app.post('/api/campanhas/sla/salvar', (req, res) => {
  const { campanha_id, periodo_ref, total_entregas, entregas_no_prazo } = req.body;

  if (!campanha_id || !periodo_ref) {
    return res.status(400).json({ erro: "Campos obrigatórios não preenchidos." });
  }

  const sla = total_entregas > 0 
    ? (entregas_no_prazo / total_entregas) * 100 
    : 0;

  const sql = `
    INSERT INTO campanhas_sla_geral
    (campanha_id, periodo_ref, total_entregas, entregas_no_prazo, sla_percentual)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [campanha_id, periodo_ref, total_entregas, entregas_no_prazo, sla], function (err) {
    if (err) return res.status(500).json({ erro: "Erro ao registrar SLA." });
    res.json({ ok: true, id: this.lastID });
  });
});

app.get('/api/campanhas/sla/listar', (req, res) => {
  const { campanha_id } = req.query;

  db.all(`
    SELECT * 
    FROM campanhas_sla_geral
    WHERE campanha_id = ?
    ORDER BY atualizado_em DESC
  `, [campanha_id], (err, rows) => {
    if (err) return res.status(500).json({ erro: "Erro ao listar SLA." });
    res.json(rows);
  });
});


// ======================================
// START SERVER
// ======================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('Server running on port', PORT);
});
