// Fonction Vercel : délègue à l'application Nest compilée par « nest build » (dist/).
module.exports = require('../dist/serverless.js').default;
