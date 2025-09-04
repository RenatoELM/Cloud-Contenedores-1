const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Healthcheck
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Listar productos
app.get('/api/products', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Crear producto
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, quantity } = req.body || {};
    if (!name || isNaN(Number(price)) || isNaN(Number(quantity))) {
      return res.status(400).json({ error: 'name, price y quantity son requeridos y válidos' });
    }
    const { rows } = await pool.query(
      'INSERT INTO products (name, price, quantity) VALUES ($1, $2, $3) RETURNING *',
      [String(name).trim(), Number(price), parseInt(quantity, 10)]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Actualizar producto
app.put('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, price, quantity } = req.body || {};

    // Construcción dinámica de SET
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(String(name).trim()); }
    if (price !== undefined) {
      if (isNaN(Number(price))) return res.status(400).json({ error: 'price debe ser numérico' });
      fields.push(`price = $${idx++}`); values.push(Number(price));
    }
    if (quantity !== undefined) {
      if (isNaN(parseInt(quantity, 10))) return res.status(400).json({ error: 'quantity debe ser entero' });
      fields.push(`quantity = $${idx++}`); values.push(parseInt(quantity, 10));
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    values.push(id);
    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await pool.query(sql, values);
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Eliminar producto
app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`API escuchando en http://0.0.0.0:${PORT}`);
});
