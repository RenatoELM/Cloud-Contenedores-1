CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO products (name, price, quantity) VALUES
('Teclado', 79.90, 10),
('Mouse', 39.90, 25),
('Monitor 24"', 599.00, 5);