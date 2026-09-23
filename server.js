require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

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
                preco_gas DECIMAL(10,2) NOT NULL DEFAULT 135.00,
                preco_agua DECIMAL(10,2) NOT NULL DEFAULT 20.00
        );
    `);

    // Insere uma distribuidora padrão para testes caso o banco esteja limpo
    await pool.query(`
        INSERT INTO distribuidoras (slug, nome, whatsapp, senha_admin, preco_gas, preco_agua)
        VALUES ('padrao', 'Disk Gás & Água Principal', '5514996905008', '123456', 135.00, 20.00)
        ON CONFLICT (slug) DO NOTHING;
        `);
    } catch (err) {
        console.error("Erro ao inicializar tabelas do banco:", err);
    }
}
inicializarBanco();




// Rota de teste
app.get('/', (req, res) => {
    res.send('API Disk Gás e Água Multi-tenant rodando!');
});

// 1. Cadastrar/Criar Nova Distribuidora
app.post('/api/admin/distribuidoras', async (req, res) => {
    const { slug, nome, whatsapp, senha_admin, preco_gas, preco_agua } = req.body;

    if (!slug || !nome || !whatsapp || !senha_admin) {
        return res.status(400).json({ error: "Preencha todos os campos obrigatórios (slug, nome, whatsapp, senha_admin)." });
    }

    try {
        await pool.query(`
            INSERT INTO distribuidoras (slug, nome, whatsapp, senha_admin, preco_gas, preco_agua)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (slug) DO UPDATE
            SET nome = EXCLUDED.nome, whatsapp = EXCLUDED.whatsapp, senha_admin = EXCLUDED.senha_admin;
        `, [slug.toLowerCase().trim(), nome, whatsapp, senha_admin, preco_gas || 135.00, preco_agua || 20.00]);

        res.json({ message: `Distribuidora '${slug}' cadastrada/atualizada com sucesso!`});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Buscar dados e preços de uma distribuidora especifica
app.get('/api/:slug/precos', async (req, res) => {
    const { slug } = req.params;
    try {
        const result = await pool.query(
            'SELECT nome, whatsapp, preco_gas, preco_agua FROM distribuidoras WHERE slug = $1',
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
            preco_agua: parseFloat(row.preco_agua)
        });
    } catch (err) {
        res.status(500).json({ error: err.message});
    }
});

// 4. Atualizar preços da distribuidora com autenticação por senha individual (Admin)
app.post('/api/:slug/admin/precos', async (req, res) => {
    const { slug } = req.params;
    const { senha, gas, agua } = req.body;

    try {
        // Valida a senha cadastrada para esta distribuidora
        const check = await pool.query('SELECT senha_admin FROM distribuidoras WHERE slug = $1', [slug.toLowerCase()]);

        if (check.rows.length === 0) {
            return res.status(404).json({ error: "Distribuidora não encontrada."});
        }

        if (senha !== check.rows[0].senha_admin) {
            return res.status(401).json({ error: "Senha incorreta para esta Distribuidora!" });
        }

        const precoGas = parseFloat(gas);
        const precoAgua = parseFloat(agua);

        if (isNaN(precoGas) || isNaN(precoAgua)) {
            return res.status(400).json({ error: "Forneça valores válidos para os preços de gás e água." });
        }

        // Atualiza os preços apenas desta empresa
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