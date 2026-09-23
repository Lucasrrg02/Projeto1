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

// Buscar preços
app.get('/api/precos', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracoes (
                chave VARCHAR(50) PRIMARY KEY,
                valor VARCHAR(50) NOT NULL
        );
        `);

        const result = await pool.query('SELECT chave, valor FROM configuracoes');
        const precos = {};
        result.rows.forEach(row => {
            precos[row.chave] = parseFloat(row.valor);
        });
        res.json({
            preco_gas: precos.preco_gas || 135.00,
            preco_agua: precos.preco_agua || 20.00
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
            telefone VARCHAR(20) PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            endereco TEXT NOT NULL
            );
        `);
        const query = `
            INSERT INTO clientes (telefone, nome, endereco)
            VALUES ($1, $2, $3)
            ON CONFLICT (telefone)
            DO UPDATE SET nome = EXCLUDED.nome, endereco = EXCLUDED.endereco;
            `;
    await pool.query(query, [telefone, nome, endereco]);
    res.json({ message: 'Cliente salvo com sucesso!' });
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

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracoes (
                chave VARCHAR(50) PRIMARY KEY,
                valor VARCHAR(50) NOT NULL
        );
        `);

        await pool.query(
            "INSERT INTO configuracoes (chave, valor) VALUES ('preco_gas', $1), ('preco_agua', $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor",
            [gas.toString(), agua.toString()]
        );

        res.json({ message: "Preços da distribuidora atualizados com sucesso!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));