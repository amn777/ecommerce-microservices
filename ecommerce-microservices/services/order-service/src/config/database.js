const { Sequelize } = require('sequelize');
const sequelize = new Sequelize({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'orders_db',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  dialect: 'postgres',
  logging: false,
  pool: { max: 10, min: 2, acquire: 30000, idle: 10000 },
});
module.exports = { sequelize };
