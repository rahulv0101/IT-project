import 'dotenv/config';

process.env.NODE_ENV ||= 'development';
if (process.env.NODE_ENV === 'development')
  process.env.COOKIE_SECURE ||= 'false';
if (!process.env.AI_SERVICE_TOKEN)
  throw new Error('AI_SERVICE_TOKEN is missing: run npm run setup:token');
const { app } = await import('./app.js');
const port = Number(process.env.PORT || 4000);
app.listen(port, '127.0.0.1', () =>
  console.log(`EduQuest API listening on 127.0.0.1:${port}`),
);
