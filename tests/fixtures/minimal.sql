-- Fixture for a database that has no festival data. It gives the http suite a
-- wallet nobody writes to and an empty wallet to work on, and nothing else.
INSERT INTO asistentes (id, nombre, email, documento, fecha_nacimiento) VALUES
  (1, 'Fixture Uno', 'uno@example.test', 'DOC-1', '1990-01-01'),
  (2, 'Fixture Dos', 'dos@example.test', 'DOC-2', '1991-02-02');

INSERT INTO movimientos (asistente_id, tipo, monto, descripcion) VALUES
  (1, 'RECARGA', 200000, 'opening balance'),
  (1, 'CONSUMO', 50000, 'opening spend');
