const express = require('express');
const healthRouter = require('./routes/health');
const versionRouter = require('./routes/version');
const pingRouter = require('./routes/ping');

const app = express();

app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/version', versionRouter);
app.use('/api/ping', pingRouter);

module.exports = app;
