module.exports = `
CREATE TABLE IF NOT EXISTS expense_entries (
  id          SERIAL PRIMARY KEY,
  spent_on    DATE         NOT NULL,
  item        VARCHAR(100) NOT NULL,
  category    VARCHAR(30)  NOT NULL,
  amount      BIGINT       NOT NULL CHECK (amount >= 0),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_entries_spent_on ON expense_entries (spent_on);
`;
