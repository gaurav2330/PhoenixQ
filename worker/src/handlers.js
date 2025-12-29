export async function handleJob(job) {
  console.log(`[WORKER] Processing job ${job.id} of type ${job.type}`);

  // Simulate failure for first 2 attempts
  if (job.attempts < 1) {
    throw new Error('Simulated job failure');
  }

  // throw new Error('Permanent job failure');

  // Simulate job processing time
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`[WORKER] Completed job ${job.id}`);
}