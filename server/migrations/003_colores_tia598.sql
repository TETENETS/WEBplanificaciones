-- Ajusta los colores guardados de hilos y tubos a la carta TIA/EIA-598
WITH m(old_hex, new_hex) AS (VALUES
  ('#1f5fd6', '#1f3f99'), ('#f28c1b', '#f47b20'), ('#1f9d3a', '#00834a'), ('#7a4a24', '#6b3a0a'),
  ('#8c8c8c', '#6f6f6f'), ('#f4f4f4', '#ffffff'), ('#d62828', '#b5121b'), ('#151515', '#000000'),
  ('#f2d21b', '#fff200'), ('#7b3fb8', '#5f3f97'), ('#f08fb5', '#f6c3c8'), ('#2ec4c4', '#00b4d0'))
UPDATE fibers f SET color = m.new_hex FROM m WHERE f.color = m.old_hex;

WITH m(old_hex, new_hex) AS (VALUES
  ('#1f5fd6', '#1f3f99'), ('#f28c1b', '#f47b20'), ('#1f9d3a', '#00834a'), ('#7a4a24', '#6b3a0a'),
  ('#8c8c8c', '#6f6f6f'), ('#f4f4f4', '#ffffff'), ('#d62828', '#b5121b'), ('#151515', '#000000'),
  ('#f2d21b', '#fff200'), ('#7b3fb8', '#5f3f97'), ('#f08fb5', '#f6c3c8'), ('#2ec4c4', '#00b4d0'))
UPDATE fibers f SET tube_color = m.new_hex FROM m WHERE f.tube_color = m.old_hex;
