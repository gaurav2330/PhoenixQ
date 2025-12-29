import express from 'express';
import jobsRouter from './jobs.routes.js';

const app = express();

app.use(express.json());

app.use(jobsRouter);

app.get('/health', (_, res) => {
  res.status(200).send('OK');
});

export default app;