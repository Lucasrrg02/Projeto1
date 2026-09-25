require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_padrao_dev';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Inicializador de tabelas no banco de dados
async function inicializarBanco() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS distribuidoras (
                slug VARCHAR(50) PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                whatsapp VARCHAR(20) NOT NULL,
                senha_admin VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE,
                senha_hash VARCHAR(255),
                vende_gas BOOLEAN DEFAULT true,
                nome_gas VARCHAR(100) DEFAULT 'Botijão de gás 13kg',
                preco_gas DECIMAL(10,2) NOT NULL DEFAULT 135.00,
                vende_agua BOOLEAN DEFAULT true,
                nome_agua VARCHAR(100) DEFAULT 'Galão de água 20L',
                preco_agua DECIMAL(10,2) NOT NULL DEFAULT 20.00,
                logo_url TEXT,
                status_loja BOOLEAN DEFAULT true,
                aviso_loja TEXT DEFAULT '',
                horario_abertura VARCHAR(5) DEFAULT '07:00',
                horario_fechamento VARCHAR(5) DEFAULT '18:00'
            );
        `);

        await pool.query(`
            ALTER TABLE distribuidoras
            ADD COLUMN IF NOT EXISTS email VARCHAR(150) UNIQUE,
            ADD COLUMN IF NOT EXISTS senha_hash VARCHAR(255),
            ADD COLUMN IF NOT EXISTS status_loja BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS aviso_loja TEXT DEFAULT '',
            ADD COLUMN IF NOT EXISTS horario_abertura VARCHAR(5) DEFAULT '07:00',
            ADD COLUMN IF NOT EXISTS horario_fechamento VARCHAR(5) DEFAULT '18:00',
            ADD COLUMN IF NOT EXISTS vende_gas BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS nome_gas VARCHAR(100) DEFAULT 'Botijão de gás 13kg',
            ADD COLUMN IF NOT EXISTS vende_agua BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS nome_agua VARCHAR(100) DEFAULT 'Galão de água 20L';
        `);

        await pool.query(`
            INSERT INTO distribuidoras (slug, nome, whatsapp, senha_admin, preco_gas, preco_agua, logo_url)
            VALUES ('padrao', 'Disk Gás & Água Principal', '5514996905008', '123456', 135.00, 20.00)
            ON CONFLICT (slug) DO NOTHING;
        `);
    } catch (err) {
        console.error("Erro ao inicializar tabelas do banco:", err);
    }
}
inicializarBanco();

function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Acesso negado. Faça login para continuar." });
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: "Sessão expirada ou token inválido." });
        }
        req.empresaSlug = decoded.slug;
        next();
    });
}

// Rota de teste
app.get('/', (req, res) => {
    res.send('API Disk Gás e Água Multi-tenant rodando!');
});

// Rotas de autenticação e cadastro em 2 etapas
app.post('/api/auth/registrar-usuario', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ error: "Informe e-mail e senha para criar a conta." });
        }

        const emailTratado = email.toLowerCase().trim();

        const checkEmail = await pool.query('SELECT email FROM distribuidoras WHERE email = $1', [emailTratado]);
        if (checkEmail.rows.length > 0) {
            return res.status(409).json({ error: "Este e-mail já está cadastrado. Faça login para continuar." });
        }

        const salt = await bcrypt.genSalt(10);
        const senha_hash = await bcrypt.hash(senha, salt);

        const tempSlug = `user-${Date.now()}`;

        await pool.query(`
            INSERT INTO distribuidoras (slug, nome, whatsapp, senha_admin, email, senha_hash, preco_gas, preco_agua)
            VALUES ($1, 'Minha Distribuidora', '00000000000', '123456', $2, $3, 135.00, 20.00)
        `, [tempSlug, emailTratado, senha_hash]);

        const token = jwt.sign({ slug: tempSlug }, JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({
            message: "Conta criada com sucesso!",
            token
        });

    } catch (err) {
        console.error("Erro ao criar conta:", err);
        res.status(500).json({ error: "Erro interno ao criar conta." });
    }
});

app.post('/api/dashboard/criar-loja', autenticarToken, async (req, res) => {
    try {
        const { nome, slug, whatsapp } = req.body;

        if (!nome || !slug || !whatsapp) {
            return res.status(400).json({ error: "Preencha o nome da empresa, o link (slug) e o WhatsApp." });
        }

        const slugTratado = slug.toLowerCase().trim();

        const checkSlug = await pool.query('SELECT slug FROM distribuidoras WHERE slug = $1 AND slug != $2', [slugTratado, req.empresaSlug]);
        if (checkSlug.rows.length > 0) {
            return res.status(409).json({ error: "Este link (slug) já está em uso por outra distribuidora. Escolha outro." });
        }

        await pool.query(`
            UPDATE distribuidoras 
            SET slug = $1, nome = $2, whatsapp = $3 
            WHERE slug = $4
        `, [slugTratado, nome, whatsapp.trim(), req.empresaSlug]);

        const novoToken = jwt.sign({ slug: slugTratado }, JWT_SECRET, { expiresIn: '1d' });

        res.json({
            message: "Distribuidora cadastrada com sucesso!",
            token: novoToken,
            slug: slugTratado
        });

    } catch (err) {
        console.error("Erro ao cadastrar loja:", err);
        res.status(500).json({ error: "Erro interno ao cadastrar distribuidora." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ error: "Informe o e-mail e a senha." });
    }

    try {
        const result = await pool.query('SELECT * FROM distribuidoras WHERE email = $1', [email.toLowerCase().trim()]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "E-mail ou senha incorretos." });
        }

        const empresa = result.rows[0];

        if (!empresa.senha_hash) {
            return res.status(401).json({ error: "Esta conta ainda não possui senha de acesso cadastrada." });
        }

        const senhaValida = await bcrypt.compare(senha, empresa.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ error: "E-mail ou senha incorretos." });
        }

        const token = jwt.sign({ slug: empresa.slug }, JWT_SECRET, { expiresIn: '1d' });

        res.json({
            message: "Login realizado com sucesso!",
            token,
            slug: empresa.slug
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rotas do painel / Dashboard
app.get('/api/dashboard/meus-dados', autenticarToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT slug, nome, email, whatsapp, vende_gas, nome_gas, preco_gas, vende_agua, nome_agua, preco_agua, logo_url, status_loja, aviso_loja, horario_abertura, horario_fechamento FROM distribuidoras WHERE slug = $1',
            [req.empresaSlug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Distribuidora não encontrada." });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/dashboard/meus-dados', autenticarToken, async (req, res) => {
    const { 
        vende_gas, nome_gas, preco_gas, 
        vende_agua, nome_agua, preco_agua, 
        whatsapp, status_loja, aviso_loja, logo_url, 
        horario_abertura, horario_fechamento 
    } = req.body;

    try {
        const precoGas = parseFloat(preco_gas) || 0;
        const precoAgua = parseFloat(preco_agua) || 0;

        if (!whatsapp || whatsapp.trim() === '') {
            return res.status(400).json({ error: "O WhatsApp não pode ficar em branco." });
        }

        await pool.query(
            `UPDATE distribuidoras 
             SET vende_gas = $1,
                 nome_gas = $2,
                 preco_gas = $3, 
                 vende_agua = $4,
                 nome_agua = $5,
                 preco_agua = $6, 
                 whatsapp = $7, 
                 status_loja = $8, 
                 aviso_loja = $9, 
                 horario_abertura = $10, 
                 horario_fechamento = $11, 
                 logo_url = COALESCE($12, logo_url) 
             WHERE slug = $13`,
            [
                vende_gas !== undefined ? vende_gas : true,
                nome_gas || 'Botijão de gás 13kg',
                precoGas,
                vende_agua !== undefined ? vende_agua : true,
                nome_agua || 'Galão de água 20L',
                precoAgua, 
                whatsapp.trim(), 
                status_loja !== undefined ? status_loja : true, 
                aviso_loja || '', 
                horario_abertura || '07:00', 
                horario_fechamento || '18:00', 
                logo_url || null, 
                req.empresaSlug
            ]
        );

        res.json({ message: "Dados da distribuidora atualizados com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/dashboard/alterar-senha', autenticarToken, async (req, res) => {
    const { senha_atual, nova_senha } = req.body;

    if (!senha_atual || !nova_senha) {
        return res.status(400).json({ error: "Informe a senha atual e a nova senha." });
    }

    try {
        const result = await pool.query('SELECT senha_hash FROM distribuidoras WHERE slug = $1', [req.empresaSlug]);
        const empresa = result.rows[0];

        const senhaValida = await bcrypt.compare(senha_atual, empresa.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ error: "Senha atual incorreta." });
        }

        const salt = await bcrypt.genSalt(10);
        const nova_senha_hash = await bcrypt.hash(nova_senha, salt);

        await pool.query('UPDATE distribuidoras SET senha_hash = $1 WHERE slug = $2', [nova_senha_hash, req.empresaSlug]);

        res.json({ message: "Senha alterada com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rotas públicas e administração mestre
app.get('/api/:slug/precos', async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await pool.query(
            'SELECT nome, whatsapp, vende_gas, nome_gas, preco_gas, vende_agua, nome_agua, preco_agua, logo_url, status_loja, aviso_loja, horario_abertura, horario_fechamento FROM distribuidoras WHERE slug = $1',
            [slug.toLowerCase()]     
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Distribuidora não encontrada." });
        }

        const row = result.rows[0];
        res.json({
            nome: row.nome,
            whatsapp: row.whatsapp,
            vende_gas: row.vende_gas !== false,
            nome_gas: row.nome_gas || 'Botijão de gás 13kg',
            preco_gas: parseFloat(row.preco_gas),
            vende_agua: row.vende_agua !== false,
            nome_agua: row.nome_agua || 'Galão de água 20L',
            preco_agua: parseFloat(row.preco_agua),
            logo_url: row.logo_url || '',
            status_loja: row.status_loja !== false,
            aviso_loja: row.aviso_loja || '',
            horario_abertura: row.horario_abertura || '07:00',
            horario_fechamento: row.horario_fechamento || '18:00'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));