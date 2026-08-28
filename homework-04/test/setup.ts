// Default env so modules that read config at import time (db, config consumers)
// can load during tests. Individual tests may override via vi.resetModules().
process.env.DATABASE_URL ??= 'mongodb://localhost:27017/';
process.env.DATABASE_NAME ??= 'test-sellers';
