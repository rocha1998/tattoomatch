const { Pool } = require('pg')

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'meusistema',
    password: '221994',
    port: 5432,
})

module.exports = pool
