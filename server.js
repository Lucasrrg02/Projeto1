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

// Inicializador de Tabelas no Banco de Dados
async function inicializarBanco() {
    try {
        // Tabela de Distribuidoras (Multi-tenant)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS distribuidoras (
                slug VARCHAR(50) PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                whatsapp VARCHAR(20) NOT NULL,
                senha_admin VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE,
                senha_hash VARCHAR(255),
                preco_gas DECIMAL(10,2) NOT NULL DEFAULT 135.00,
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
            ADD COLUMN IF NOT EXISTS horario_fechamento VARCHAR(5) DEFAULT '18:00';
        `);

        // Insere a distribuidora padrão caso o banco esteja limpo
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

// =========================================================================
// ROTAS DE AUTENTICAÇÃO E CADASTRO EM 2 ETAPAS
// =========================================================================

// ETAPA 1: Criar Conta de Usuário (Apenas E-mail e Senha)
app.post('/api/auth/registrar-usuario', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ error: "Informe e-mail e senha para criar a conta." });
        }

        const emailTratado = email.toLowerCase().trim();

        // Verifica se o e-mail já existe
        const checkEmail = await pool.query('SELECT email FROM distribuidoras WHERE email = $1', [emailTratado]);
        if (checkEmail.rows.length > 0) {
            return res.status(409).json({ error: "Este e-mail já está cadastrado. Faça login para continuar." });
        }

        // Gera o hash da senha
        const salt = await bcrypt.genSalt(10);
        const senha_hash = await bcrypt.hash(senha, salt);

        // Gera um slug temporário/pendente baseado no timestamp até o usuário criar a loja
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

// ETAPA 2: Criar/Configurar a Distribuidora (Requer Token JWT da Etapa 1)
app.post('/api/dashboard/criar-loja', autenticarToken, async (req, res) => {
    try {
        const { nome, slug, whatsapp } = req.body;

        if (!nome || !slug || !whatsapp) {
            return res.status(400).json({ error: "Preencha o nome da empresa, o link (slug) e o WhatsApp." });
        }

        const slugTratado = slug.toLowerCase().trim();

        // Verifica se o slug escolhido já existe na base
        const checkSlug = await pool.query('SELECT slug FROM distribuidoras WHERE slug = $1 AND slug != $2', [slugTratado, req.empresaSlug]);
        if (checkSlug.rows.length > 0) {
            return res.status(409).json({ error: "Este link (slug) já está em uso por outra distribuidora. Escolha outro." });
        }

        // Atualiza a conta temporária para os dados oficiais da loja
        await pool.query(`
            UPDATE distribuidoras 
            SET slug = $1, nome = $2, whatsapp = $3 
            WHERE slug = $4
        `, [slugTratado, nome, whatsapp.trim(), req.empresaSlug]);

        // Emite um novo Token com o Slug oficial da distribuidora
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

// Rota de Login Tradicional
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

// =========================================================================
// ROTAS DO PAINEL / DASHBOARD
// =========================================================================

// Buscar dados do Painel
app.get('/api/dashboard/meus-dados', autenticarToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT slug, nome, email, whatsapp, preco_gas, preco_agua, logo_url, status_loja, aviso_loja, horario_abertura, horario_fechamento FROM distribuidoras WHERE slug = $1',
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

// Atualizar dados do Painel
app.put('/api/dashboard/meus-dados', autenticarToken, async (req, res) => {
    const { preco_gas, preco_agua, whatsapp, status_loja, aviso_loja, logo_url, horario_abertura, horario_fechamento } = req.body;

    try {
        const precoGas = parseFloat(preco_gas);
        const precoAgua = parseFloat(preco_agua);

        if (isNaN(precoGas) || isNaN(precoAgua)) {
            return res.status(400).json({ error: "Forneça valores válidos para os preços." });
        }

        if (!whatsapp || whatsapp.trim() === '') {
            return res.status(400).json({ error: "O WhatsApp não pode ficar em branco." });
        }

        await pool.query(
            `UPDATE distribuidoras 
             SET preco_gas = $1, 
                 preco_agua = $2, 
                 whatsapp = $3, 
                 status_loja = $4, 
                 aviso_loja = $5, 
                 horario_abertura = $6, 
                 horario_fechamento = $7, 
                 logo_url = COALESCE($8, logo_url) 
             WHERE slug = $9`,
            [
                precoGas, 
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

// Alterar Senha do Painel
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

// =========================================================================
// ROTAS PÚBLICAS E ADMINISTRAÇÃO MESTRE
// =========================================================================

// Cadastrar Distribuidora via Admin Mestre (Mantido como opção)
app.post('/api/admin/distribuidoras', async (req, res) => {
    try {
        const { slug, nome, whatsapp, senha_admin, preco_gas, preco_agua, logo_url, senha_mestre, email, senha_login } = req.body;

        const SENHA_MESTRE_SISTEMA = process.env.SENHA_MESTRE;
        
        if (!senha_mestre || senha_mestre !== SENHA_MESTRE_SISTEMA) {
            return res.status(401).json({ error: "Acesso negado: Senha Mestre Do Sistema incorreta!" });
        }

        if (!slug || !nome || !whatsapp || !senha_admin) {
            return res.status(400).json({ error: "Preencha todos os campos obrigatórios (slug, nome, whatsapp, senha_admin)." });
        }

        const slugTratado = slug.toLowerCase().trim();

        const checkExist = await pool.query(
            'SELECT slug FROM distribuidoras WHERE slug = $1',
            [slugTratado]
        );

        if (checkExist.rows.length > 0) {
            return res.status(409).json({
                error: `O identificador '${slugTratado}' já está em uso por outra distribuidora. Escolha outro slug.`
            });
        }

        let senha_hash = null;
        if (senha_login) {
            const salt = await bcrypt.genSalt(10);
            senha_hash = await bcrypt.hash(senha_login, salt);
        }

        await pool.query(`
            INSERT INTO distribuidoras (slug, nome, whatsapp, senha_admin, preco_gas, preco_agua, logo_url, email, senha_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (slug) DO UPDATE
            SET nome = EXCLUDED.nome,
                whatsapp = EXCLUDED.whatsapp,
                senha_admin = EXCLUDED.senha_admin,
                preco_gas = EXCLUDED.preco_gas,
                preco_agua = EXCLUDED.preco_agua,
                logo_url = EXCLUDED.logo_url,
                email = EXCLUDED.email,
                senha_hash = EXCLUDED.senha_hash;
        `, [slugTratado, nome, whatsapp, senha_admin, preco_gas || 135.00, preco_agua || 20.00, logo_url || null, email ? email.toLowerCase().trim() : null, senha_hash]);

        res.json({ message: `Distribuidora '${slug}' cadastrada/atualizada com sucesso!` });
    } catch (err) {
        console.error("Erro no cadastro:", err);
        return res.status(500).json({ error: err.message });
    }
});

// Buscar dados e preços públicos (Retorna horários para a loja pública)
app.get('/api/:slug/precos', async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await pool.query(
            'SELECT nome, whatsapp, preco_gas, preco_agua, logo_url, status_loja, aviso_loja, horario_abertura, horario_fechamento FROM distribuidoras WHERE slug = $1',
            [slug.toLowerCase()]     
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Distribuidora não encontrada." });
        }

        const row = result.rows[0];
        res.json({
            nome: row.nome,
            whatsapp: row.whatsapp,
            preco_gas: parseFloat(row.preco_gas),
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

// Atualizar preços por Senha Admin
app.post('/api/:slug/admin/precos', async (req, res) => {
    const { slug } = req.params;
    const { senha, gas, agua } = req.body;

    try {
        const check = await pool.query('SELECT senha_admin FROM distribuidoras WHERE slug = $1', [slug.toLowerCase()]);

        if (check.rows.length === 0) {
            return res.status(404).json({ error: "Distribuidora não encontrada." });
        }

        if (senha !== check.rows[0].senha_admin) {
            return res.status(401).json({ error: "Senha incorreta para esta Distribuidora!" });
        }

        const precoGas = parseFloat(gas);
        const precoAgua = parseFloat(agua);

        if (isNaN(precoGas) || isNaN(precoAgua)) {
            return res.status(400).json({ error: "Forneça valores válidos para os preços de gás e água." });
        }

        await pool.query(
            'UPDATE distribuidoras SET preco_gas = $1, preco_agua = $2 WHERE slug = $3',
            [precoGas, precoAgua, slug.toLowerCase()]
        );

        res.json({ message: "Preços da distribuidora atualizados com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));