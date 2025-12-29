import app from './app.js';
import './redis.js';

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`[API] Server is running on http://localhost:${PORT}`);
});