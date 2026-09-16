const express = require('express');
const healthRouter = require('./routes/health');
const versionRouter = require('./routes/version');

const app = express();

app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/version', versionRouter);

module.exports = app;
