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
            p.obs
            p.nota
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

// rota para upload
app.post("/api/producao/enviar-nota", upload.single("nota"), (req, res) => {
    const { producao_id, usuario_id } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: "Arquivo não enviado" });
    }

    const arquivo = req.file.filename;

    db.run(`
        UPDATE producao
        SET nota = ?
        WHERE id = ? AND usuario_id = ?
    `, [arquivo, producao_id, usuario_id], (err) => {
        if (err) {
            return res.status(500).json({ error: "Erro ao salvar no banco" });
        }
        res.json({ success: true, file: arquivo });
    });
});

// ======================================
// START SERVER
// ======================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('Server running on port', PORT);
});
