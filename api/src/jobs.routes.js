import express from 'express';
import { enqueueJob } from './enqueueJob.js';

const router = express.Router();

router.post('/jobs', async (req, res) => {
  const { type, payload } = req.body;

  const result = await enqueueJob({ type, payload });
  res.status(202).json(result);
});

export default router;