
// ======================================================
//  COELHOLOG SERVER + WHATSAPP API (Z-API) - NO EXTERNAL LIBS
// ======================================================

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const https = require('https');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname,'../public')));

const DB = process.env.DB_PATH || './database.sqlite';
const db = new sqlite3.Database(DB);

// ==========================
// WHATSAPP Z-API
// ==========================
const ZAPI_INSTANCE = '3EA8C2DFDF843142F1BD324DD30A57B5';
const ZAPI_TOKEN = 'E27F2FADD7C07BF4B31E49A5';
const ADMIN_WHATSAPP = '5511956914104';

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  return '55' + digits;
}

function formatCurrencyBR(value) {
  const num = Number(value || 0);
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.join(',');
}

function sendWhatsAppMessage(phone, message) {
  return new Promise((resolve) => {
    const normalized = normalizePhone(phone);
    if (!normalized || !message) return resolve();

    const postData = JSON.stringify({
      phone: normalized,
      message
    });

    const options = {
      hostname: 'api.z-api.io',
      path: `/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });

    req.on('error', (err) => {
      console.error('Erro ao enviar mensagem WhatsApp:', err.message);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

function notifyAdmin(message) {
  return sendWhatsAppMessage(ADMIN_WHATSAPP, message);
}

// ==========================
// LOGIN
// ==========================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get(
    'SELECT id,nome,email,role FROM usuarios WHERE email=? AND senha=?',
    [email, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'db' });
      if (!row) return res.status(401).json({ error: 'invalid' });
      res.json(row);
    }
  );
});

// ==========================
// USUÁRIOS
// ==========================
app.get('/api/usuarios', (req, res) => {
  db.all(
    'SELECT id,nome,email,role,cnpj,telefone FROM usuarios ORDER BY id',
    [],
    (e, rows) => {
      if (e) return res.status(500).json({ error: 'db' });
      res.json(rows);
    }
  );
});

app.post('/api/usuarios', (req, res) => {
  const { nome, email, senha, role, cnpj, telefone } = req.body;

  db.get('SELECT id FROM usuarios WHERE email=?', [email], (err, row) => {
    if (row) return res.status(409).json({ error: 'exists' });

    db.run(
      'INSERT INTO usuarios(nome,email,senha,role,cnpj,telefone) VALUES (?,?,?,?,?,?)',
      [nome, email, senha, role || 'colaborador', cnpj || '', telefone || ''],
      function (err) {
        if (err) return res.status(500).json({ error: 'db' });

        db.get(
          'SELECT id,nome,email,role FROM usuarios WHERE id=?',
          [this.lastID],
          (e, u) => res.json(u)
        );
      }
    );
  });
});

// ==========================
// RECEBIVEIS
// ==========================
app.get('/api/recebiveis', (req, res) => {
  const userId = req.query.user_id;

  if (userId) {
    db.all(
      `SELECT r.id,r.usuario_id,u.nome,r.data,r.valor,r.tipo,r.status
       FROM recebiveis r
       LEFT JOIN usuarios u ON u.id=r.usuario_id
       WHERE r.usuario_id=?
       ORDER BY r.id DESC`,
      [userId],
      (e, rows) => {
        if (e) return res.status(500).json({ error: 'db' });
        res.json(rows);
      }
    );
    return;
  }

  db.all(
    `SELECT r.id,r.usuario_id,u.nome,r.data,r.valor,r.tipo,r.status
     FROM recebiveis r
     LEFT JOIN usuarios u ON u.id=r.usuario_id
     ORDER BY r.id DESC`,
    [],
    (e, rows) => {
      if (e) return res.status(500).json({ error: 'db' });
      res.json(rows);
    }
  );
});

app.post('/api/recebiveis', (req, res) => {
  const { usuario_id, data, valor, tipo, status } = req.body;

  db.run(
    'INSERT INTO recebiveis(usuario_id,data,valor,tipo,status) VALUES (?,?,?,?,?)',
    [usuario_id, data, valor, tipo, status || 'Pendente'],
    function (err) {
      if (err) return res.status(500).json({ error: 'db' });
      res.json({ id: this.lastID });
    }
  );
});

// Update recebível + WhatsApp
app.put('/api/recebiveis/:id', (req, res) => {
  const { data, valor, tipo, status, usuario_id } = req.body;
  const id = req.params.id;

  const sql = 'UPDATE recebiveis SET data=?, valor=?, tipo=?, status=? WHERE id=?';
  db.run(sql, [data, valor, tipo, status, id], function (err) {
    if (err) {
      console.error('Erro ao atualizar recebível:', err);
      return res.status(500).json({ error: 'Erro ao atualizar recebível' });
    }

    res.json({ ok: true });

    db.get(
      `SELECT r.id, r.usuario_id, r.valor, r.data, r.status, u.nome, u.telefone
       FROM recebiveis r
       JOIN usuarios u ON u.id=r.usuario_id
       WHERE r.id = ?`,
      [id],
      (erroBusca, row) => {
        if (erroBusca || !row) return;

        const valorFormatado = formatCurrencyBR(row.valor);
        const dataTexto = row.data || '';
        const statusTexto = status;

        const msgAdmin = `Recebível #${row.id} de ${row.nome} foi atualizado para "${statusTexto}" no valor de R$ ${valorFormatado}.`;
        notifyAdmin(msgAdmin);

        if (statusTexto === 'Pago' && row.telefone) {
          const msgColab = `Olá ${row.nome}, seu recebível de R$ ${valorFormatado} com vencimento em ${dataTexto} foi marcado como "${statusTexto}".`;
          sendWhatsAppMessage(row.telefone, msgColab);
        }
      }
    );
  });
});

// ==========================
// EMPRESTIMOS
// ==========================
app.get('/api/emprestimos', (req, res) => {
  const userId = req.query.user_id;

  if (userId) {
    db.all(
      `SELECT e.id,e.usuario_id,u.nome,e.valor,e.parcelamentos,e.status,e.criado_em
       FROM emprestimos e
       LEFT JOIN usuarios u ON u.id=e.usuario_id
       WHERE e.usuario_id=?
       ORDER BY e.id DESC`,
      [userId],
      (e, rows) => res.json(rows)
    );
    return;
  }

  db.all(
    `SELECT e.id,e.usuario_id,u.nome,e.valor,e.parcelamentos,e.status,e.criado_em
     FROM emprestimos e
     LEFT JOIN usuarios u ON u.id=e.usuario_id
     ORDERORDER BY e.id DESC`,
    [],
    (e, rows) => res.json(rows)
  );
});

app.post('/api/emprestimos', (req, res) => {
  const { usuario_id, valor, parcelamentos } = req.body;

  db.get(
    'SELECT id FROM emprestimos WHERE usuario_id=? AND status IN ("Em análise","Aprovado")',
    [usuario_id],
    (err, row) => {
      if (row) return res.status(400).json({ error: 'Já existe um empréstimo ativo' });

      db.run(
        `INSERT INTO emprestimos(usuario_id,valor,parcelamentos,status,criado_em)
         VALUES (?,?,?,"Em análise",datetime("now"))`,
        [usuario_id, valor, parcelamentos],
        function (e) {
          if (e) return res.status(500).json({ error: 'db' });

          res.json({ id: this.lastID, status: 'Em análise' });

          db.get(
            'SELECT nome, telefone FROM usuarios WHERE id=?',
            [usuario_id],
            (erroUsuario, usuario) => {
              if (!usuario) return;
              const msgAdmin = `Novo pedido de empréstimo de ${usuario.nome} no valor de R$ ${formatCurrencyBR(valor)}.`;
              notifyAdmin(msgAdmin);
            }
          );
        }
      );
    }
  );
});

// ==========================
// START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running:", PORT));
