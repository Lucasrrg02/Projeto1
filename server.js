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

// Rota de teste
app.get('/', (req, res) => {
    res.send('API Disk Gás e Água rodando!');
});

// Buscar preços
app.get('/api/precos', async (req, res) => {
    try {
        const result = await pool.query('SELECT chave, valor FROM configuracoes');
        const precos = {};
        result.rows.forEach(row => {
            precos[row.chave] = parseFloat(row.valor);
        });
        res.json(precos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Buscar cliente por telefone
app.get('/api/clientes/:telefone', async (req, res) => {
    const { telefone } = req.params;
    try {
        const result = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [telefone]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Cliente não encontrado' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Salvar/Atualizar cliente
app.post('/api/clientes', async (req, res) => {
    const { telefone, nome, endereco } = req.body;
    try {
        const query = `
            INSERT INTO clientes (telefone, nome, endereco)
            VALUES ($1, $2, $3)
            ON CONFLICT (telefone)
            DO UPDATE SET nome = EXCLUDED.nome, endereco = EXCLUDED.endereco;
            `;
    await pool.query(query, [telefone, nome, endereco]);
    res.json({ message: 'Cliente salvo com sucesso!' });
    } catch (err) {
    res.status(500).json({ error: err.message });
    }
});

// 4. Atualizar preços (Admin)
app.post('/api/precos', async (req, res) => {
    const { gas, agua } = req.body;
    try {
        await pool.query("UPDATE configuracoes SET valor = $1 WHERE chave = 'preco_gas'", [gas]);
        await pool.query("UPDATE configuracoes SET valor = $1 WHERE chave = 'preco_agua'", [agua]);
        res.json({ message: 'Preços atualizados!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));