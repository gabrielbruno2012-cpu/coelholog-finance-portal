// backend/server_sqlite.js
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CAMINHO DO BANCO (ajuste o nome se o seu for outro)
const DB_PATH = path.join(__dirname, 'database.sqlite'); 
// Ex: se o seu arquivo for "coelholog.db", troque a linha acima para:
// const DB_PATH = path.join(__dirname, 'coelholog.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Erro ao conectar no SQLite:', err.message);
  } else {
    console.log('Conectado ao SQLite em:', DB_PATH);
  }
});

app.use(cors());
app.use(express.json());

// SERVE TUDO A PARTIR DA RAIZ DO PROJETO (index, css, js, admin, etc)
app.use(express.static(path.join(__dirname, '..')));

// ===== Helpers para usar o banco com Promises =====
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

// ================== ROTAS ADMIN ==================
// Listar colaboradores (para o select de lançar recebível)
app.get('/api/admin/listar-colaboradores', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT id, nome, email
      FROM colaboradores
      ORDER BY nome
    `);
    res.json(rows);
  } catch (err) {
    console.error('Erro listar-colaboradores:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar colaboradores' });
  }
});

// Criar colaborador (tela criar_colaborador.html)
app.post('/api/admin/criar-colaborador', async (req, res) => {
  try {
    const { nome, email, senha, cpf } = req.body;

    if (!nome || !email || !senha || !cpf) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios faltando' });
    }

    await dbRun(
      `INSERT INTO colaboradores (nome, email, senha, cpf) VALUES (?, ?, ?, ?)`,
      [nome, email, senha, cpf]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erro criar-colaborador:', err);
    res.status(500).json({ success: false, error: 'Erro ao criar colaborador' });
  }
});

// Recebíveis pendentes (dashboard + alterar_recebiveis.html)
app.get('/api/admin/recebiveis-pendentes', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT 
        r.id,
        r.valor,
        r.status,
        r.data,
        c.nome AS colaborador,
        c.email AS email_colaborador
      FROM recebiveis r
      LEFT JOIN colaboradores c ON c.id = r.colaborador_id
      WHERE r.status = 'PENDENTE'
      ORDER BY r.data DESC, r.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Erro recebiveis-pendentes:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar recebíveis pendentes' });
  }
});

// Recebíveis pagos (dashboard)
app.get('/api/admin/recebiveis-pagos', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT 
        r.id,
        r.valor,
        r.status,
        r.data,
        c.nome AS colaborador,
        c.email AS email_colaborador
      FROM recebiveis r
      LEFT JOIN colaboradores c ON c.id = r.colaborador_id
      WHERE r.status = 'PAGO'
      ORDER BY r.data DESC, r.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Erro recebiveis-pagos:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar recebíveis pagos' });
  }
});

// Atualizar status de recebível (alterar_recebiveis.html)
app.post('/api/admin/recebiveis-atualizar', async (req, res) => {
  try {
    const { id, status } = req.body;

    if (!id || !status) {
      return res.status(400).json({ success: false, error: 'ID ou status faltando' });
    }

    await dbRun(
      `UPDATE recebiveis SET status = ? WHERE id = ?`,
      [status, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erro recebiveis-atualizar:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar recebível' });
  }
});

// Empréstimos pendentes (dashboard + alterar_emprestimos.html)
app.get('/api/admin/emprestimos-pendentes', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT 
        e.id,
        e.valor,
        e.status,
        e.data,
        c.nome AS colaborador,
        c.email AS email_colaborador
      FROM emprestimos e
      LEFT JOIN colaboradores c ON c.id = e.colaborador_id
      WHERE e.status = 'PENDENTE'
      ORDER BY e.data DESC, e.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Erro emprestimos-pendentes:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar empréstimos' });
  }
});

// Atualizar status de empréstimo (alterar_emprestimos.html)
app.post('/api/admin/emprestimos-atualizar', async (req, res) => {
  try {
    const { id, status } = req.body;

    if (!id || !status) {
      return res.status(400).json({ success: false, error: 'ID ou status faltando' });
    }

    await dbRun(
      `UPDATE emprestimos SET status = ? WHERE id = ?`,
      [status, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erro emprestimos-atualizar:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar empréstimo' });
  }
});

// Lançar novo recebível (lancar_recebiveis.html)
app.post('/api/admin/lancar-recebivel', async (req, res) => {
  try {
    const { colaborador, valor, data } = req.body;

    if (!colaborador || !valor || !data) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios faltando' });
    }

    await dbRun(
      `INSERT INTO recebiveis (colaborador_id, valor, data, status)
       VALUES (?, ?, ?, 'PENDENTE')`,
      [colaborador, valor, data]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erro lancar-recebivel:', err);
    res.status(500).json({ success: false, error: 'Erro ao lançar recebível' });
  }
});

// ============== ROTA DEFAULT ==============
// Se alguém acessar /admin, cair em /admin/dashboard.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'dashboard.html'));
});

// SPA fallback (se necessário) – opcional
app.get('*', (req, res, next) => {
  // Deixa o Express servir arquivos estáticos normais
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/admin/')) return next();
  // Página inicial
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
