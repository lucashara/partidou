// Identifica o arquivo como banco do Partidou (ASCII "PART").
export const APPLICATION_ID = 0x50415254;

/** Cada item vira a versão do esquema (índice + 1). Migração publicada nunca é editada. */
export const MIGRACOES = [
  `
  CREATE TABLE resenhas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 40),
    seq INTEGER NOT NULL DEFAULT 0,
    chave_recuperacao_hash TEXT NOT NULL UNIQUE,
    criada_em INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE membros (
    id TEXT PRIMARY KEY,
    resenha_id TEXT NOT NULL REFERENCES resenhas(id) ON DELETE CASCADE,
    apelido TEXT NOT NULL CHECK (length(apelido) BETWEEN 1 AND 24),
    apelido_chave TEXT NOT NULL,
    papel TEXT NOT NULL CHECK (papel IN ('criador','participante')),
    criado_em INTEGER NOT NULL,
    revogado_em INTEGER,
    seq INTEGER NOT NULL
  ) STRICT;
  CREATE UNIQUE INDEX uq_membro_apelido ON membros(resenha_id, apelido_chave) WHERE revogado_em IS NULL;
  CREATE UNIQUE INDEX uq_membro_criador ON membros(resenha_id) WHERE papel = 'criador' AND revogado_em IS NULL;

  CREATE TABLE sessoes (
    token_hash TEXT PRIMARY KEY,
    membro_id TEXT NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
    criada_em INTEGER NOT NULL,
    ultimo_uso_em INTEGER NOT NULL,
    revogada_em INTEGER
  ) STRICT;
  CREATE INDEX idx_sessoes_membro ON sessoes(membro_id);

  CREATE TABLE convites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resenha_id TEXT NOT NULL REFERENCES resenhas(id) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL UNIQUE,
    criado_por TEXT NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
    criado_em INTEGER NOT NULL,
    expira_em INTEGER NOT NULL,
    revogado_em INTEGER,
    usos INTEGER NOT NULL DEFAULT 0
  ) STRICT;
  CREATE INDEX idx_convites_resenha ON convites(resenha_id);

  CREATE TABLE transferencias (
    codigo_hash TEXT PRIMARY KEY,
    membro_id TEXT NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
    expira_em INTEGER NOT NULL,
    usada_em INTEGER
  ) STRICT;
  CREATE INDEX idx_transferencias_membro ON transferencias(membro_id);

  CREATE TABLE competidores (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 40),
    resenha_id TEXT NOT NULL REFERENCES resenhas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 30),
    nome_chave TEXT NOT NULL,
    criado_por TEXT NOT NULL REFERENCES membros(id),
    criado_em INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    UNIQUE (resenha_id, nome_chave)
  ) STRICT;

  CREATE TABLE partidas (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 40),
    resenha_id TEXT NOT NULL REFERENCES resenhas(id) ON DELETE CASCADE,
    lado_a TEXT NOT NULL REFERENCES competidores(id),
    lado_b TEXT NOT NULL REFERENCES competidores(id),
    placar_a INTEGER NOT NULL CHECK (placar_a BETWEEN 0 AND 999),
    placar_b INTEGER NOT NULL CHECK (placar_b BETWEEN 0 AND 999),
    penaltis_a INTEGER CHECK (penaltis_a BETWEEN 0 AND 999),
    penaltis_b INTEGER CHECK (penaltis_b BETWEEN 0 AND 999),
    modalidade TEXT,
    jogada_em INTEGER NOT NULL,
    criado_por TEXT NOT NULL REFERENCES membros(id),
    editado_por TEXT REFERENCES membros(id),
    criada_em INTEGER NOT NULL,
    atualizada_em INTEGER NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1,
    excluida_em INTEGER,
    seq INTEGER NOT NULL,
    CHECK (lado_a <> lado_b),
    CHECK ((penaltis_a IS NULL) = (penaltis_b IS NULL)),
    CHECK (penaltis_a IS NULL OR (placar_a = placar_b AND penaltis_a <> penaltis_b))
  ) STRICT;
  CREATE INDEX idx_partidas_resenha_seq ON partidas(resenha_id, seq);
  `,
  // A modalidade FIFA deixou de existir: vira Futebol. O seq novo faz os aparelhos baixarem as partidas alteradas.
  `
  UPDATE resenhas SET seq = seq + 1 WHERE id IN (SELECT resenha_id FROM partidas WHERE modalidade = 'fifa');
  UPDATE partidas SET modalidade = 'futebol', seq = (SELECT seq FROM resenhas WHERE id = partidas.resenha_id)
    WHERE modalidade = 'fifa';
  `,
];
