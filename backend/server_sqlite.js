const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const axios = require("axios"); // <-- ADICIONADO
const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname,'../public')));

const DB = path.join(__dirname,'sql','coelholog.db');
const db = new sqlite3.Database(DB);

// ===============================
// WHATSAPP (Z-API) - AXIOS
// ===============================
const ZAPI_INSTANCE = "3EA8C2DFDF843142F1BD324DD30A57B5";
const ZAPI_TOKEN = "E27F2FADD7C07BF4B31E49A5";

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.toString().replace(/\D/g, "").replace(/^([^55])/, "55$1");
}

async function sendWhatsappMessage(phone, message) {
  const number = normalizePhone(phone);
  if (!number || !message) return;

  try {
    const response = await axios.post(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`,
      {
        phone: number,
        message: message
      },
      { timeout: 8000 }
    );

    console.log("📨 WhatsApp enviado:", response.data);
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem:", err.response?.data || err.message);
  }
}

// ===============================
// LOGIN
// ===============================
app.post('/api/login',(req,res)=>{
  const {email,password} = req.body;
  db.get(
    'SELECT id,nome,email,role FROM usuarios WHERE email=? AND senha=?',
    [email,password],
    (err,row)=>{
      if(err) return res.status(500).json({error:'db'});
      if(!row) return res.status(401).json({error:'invalid'});
      res.json(row);
    }
  );
});

// ===============================
// USUÁRIOS
// ===============================
app.get('/api/usuarios',(req,res)=>{
  db.all(
    'SELECT id,nome,email,role,cnpj,telefone FROM usuarios ORDER BY id',
    [],
    (e,rows)=>{ 
      if(e) return res.status(500).json({error:'db'}); 
      res.json(rows); 
    }
  );
});

app.post('/api/usuarios',(req,res)=>{
  const {nome,email,senha,role,cnpj,telefone} = req.body;

  db.get('SELECT id FROM usuarios WHERE email=?',[email],(err,row)=>{
    if(row) return res.status(409).json({error:'exists'});

    db.run(
      'INSERT INTO usuarios(nome,email,senha,role,cnpj,telefone) VALUES (?,?,?,?,?,?)',
      [nome,email,senha,role||'colaborador',cnpj||'',telefone||''],
      function(err){
        if(err) return res.status(500).json({error:'db'});

        db.get(
          'SELECT id,nome,email,role FROM usuarios WHERE id=?',
          [this.lastID],
          (e,u)=> res.json(u)
        );
      }
    );
  });
});

// ===============================
// RECEBÍVEIS
// ===============================
app.get('/api/recebiveis',(req,res)=>{
  const userId = req.query.user_id;

  if(userId){
    db.all(
      'SELECT r.id,r.usuario_id,u.nome,r.data,r.valor,r.tipo,r.status FROM recebiveis r LEFT JOIN usuarios u ON u.id=r.usuario_id WHERE r.usuario_id=? ORDER BY r.id DESC',
      [userId],
      (e,rows)=>{ 
        if(e) return res.status(500).json({error:'db'}); 
        res.json(rows); 
      }
    );
    return;
  }

  db.all(
    'SELECT r.id,r.usuario_id,u.nome,r.data,r.valor,r.tipo,r.status FROM recebiveis r LEFT JOIN usuarios u ON u.id=r.usuario_id ORDER BY r.id DESC',
    [],
    (e,rows)=>{ 
      if(e) return res.status(500).json({error:'db'}); 
      res.json(rows); 
    }
  );
});

app.post('/api/recebiveis',(req,res)=>{
  const {usuario_id,data,valor,tipo,status} = req.body;

  db.run(
    'INSERT INTO recebiveis(usuario_id,data,valor,tipo,status) VALUES (?,?,?,?,?)',
    [usuario_id,data,valor,tipo,status||'Pendente'],
    function(err){
      if(err) return res.status(500).json({error:'db'});
      res.json({id:this.lastID});
    }
  );
});

app.put('/api/recebiveis/:id',(req,res)=>{
  const id = req.params.id;
  const {data,valor,tipo,status} = req.body;

  // ------------- WHATSAPP PARA O COLABORADOR -------------
  db.get(
    "SELECT u.telefone, u.nome FROM recebiveis r JOIN usuarios u ON u.id = r.usuario_id WHERE r.id = ?",
    [id],
    async (err, row) => {
      if (!err && row && row.telefone) {
        await sendWhatsappMessage(
          row.telefone,
          `📢 Olá ${row.nome}, seu recebível foi atualizado para: *${status}*.`
        );
      }
    }
  );

  db.run(
    'UPDATE recebiveis SET data=?,valor=?,tipo=?,status=? WHERE id=?',
    [data,valor,tipo,status,id],
    function(err){
      if(err) return res.status(500).json({error:'db'});
      res.json({ok:true});
    }
  );
});

// ===============================
// EMPRÉSTIMOS
// ===============================
app.get('/api/emprestimos',(req,res)=>{
  const userId = req.query.user_id;

  if(userId){
    db.all(
      'SELECT e.id,e.usuario_id,u.nome,e.valor,e.parcelamentos,e.status,e.criado_em FROM emprestimos e LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE e.usuario_id=? ORDER BY e.id DESC',
      [userId],
      (e,rows)=>{ 
        if(e) return res.status(500).json({error:'db'}); 
        res.json(rows); 
      }
    );
    return;
  }

  db.all(
    'SELECT e.id,e.usuario_id,u.nome,e.valor,e.parcelamentos,e.status,e.criado_em FROM emprestimos e LEFT JOIN usuarios u ON u.id=e.usuario_id ORDER BY e.id DESC',
    [],
    (e,rows)=>{ 
      if(e) return res.status(500).json({error:'db'}); 
      res.json(rows); 
    }
  );
});

app.post('/api/emprestimos',(req,res)=>{
  const {usuario_id,valor,parcelamentos} = req.body;

  db.get(
    'SELECT id FROM emprestimos WHERE usuario_id=? AND status IN ("Em análise","Aprovado")',
    [usuario_id],
    (err,row)=>{
      if(err) return res.status(500).json({error:'db'});
      if(row) return res.status(400).json({error:'Já existe um empréstimo ativo'});

      // ------------- WHATSAPP PARA O ADMIN -------------
      sendWhatsappMessage(
        "5511956914104",
        `📢 *Novo pedido de Empréstimo*\nColaborador ID: ${usuario_id}\nValor: R$ ${valor}\nParcelas: ${parcelamentos}`
      );

      db.run(
        'INSERT INTO emprestimos(usuario_id,valor,parcelamentos,status,criado_em) VALUES (?,?,?,?,datetime("now"))',
        [usuario_id,valor,parcelamentos,'Em análise'],
        function(e){ 
          if(e) return res.status(500).json({error:'db'});
          res.json({id:this.lastID, status:'Em análise'}); 
        }
      );
    }
  );
});

app.put('/api/emprestimos/:id',(req,res)=>{
  const id = req.params.id;
  const {status,valor,parcelamentos} = req.body;

  db.run(
    'UPDATE emprestimos SET status=?,valor=?,parcelamentos=? WHERE id=?',
    [status,valor,parcelamentos,id],
    function(err){
      if(err) return res.status(500).json({error:'db'});
      res.json({ok:true});
    }
  );
});

// ===============================
// SERVER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running', PORT));
