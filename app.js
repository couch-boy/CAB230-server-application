import express from 'express';
import knex from 'knex';
import knexConfig from './knexfile.js';
import rentalRouter from './routes/rentals.js';
import ratingRouter from './routes/ratings.js';
import userRouter from './routes/user.js';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUI from 'swagger-ui-express';
import swaggerDocument from './docs/rentals-openapi.json' with { type: 'json' };
import https from 'node:https';
import fs from 'node:fs';

const app = express();
const port = 3000;

const db = knex(knexConfig);
app.use((req, res, next) => {
  req.db = db;
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(morgan('dev'));

app.use('/docs', swaggerUI.serve);
app.get('/docs', swaggerUI.setup(swaggerDocument));

app.use('/rentals', rentalRouter);
app.use('/ratings', ratingRouter);
app.use('/user', userRouter);

app.get("/knex", (req, res, next) => {
  req.db.raw("SELECT VERSION()")
    .then(version => {
      console.log(version[0][0]);
      res.send("Version logged successfully");
    })
    .catch(err => {
      console.log(err);
      throw err;
    });
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Rental Search API</title>
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8f9fa; }
          .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .btn-group { display: flex; gap: 10px; margin-top: 20px; }
          .button { padding: 10px 20px; text-decoration: none; color: white; border-radius: 5px; font-weight: bold; transition: opacity 0.2s; }
          .rentals { background-color: #007bff; }
          .ratings { background-color: #28a745; }
          .user { background-color: #6c757d; }
          .docs { background-color: #ffc107; color: black; }
          .button:hover { opacity: 0.8; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Rental Search API Gateway</h1>
          <p>Select a module to explore the API endpoints:</p>
          <div class="btn-group">
            <a href="/rentals" class="button rentals">Rentals Search</a>
            <a href="/ratings" class="button ratings">My Ratings</a>
            <a href="/user" class="button user">User Auth</a>
            <a href="/docs" class="button docs">API Documentation</a>
          </div>
        </div>
      </body>
    </html>
  `);
});

const credentials = {
  key: fs.readFileSync('./certs/selfsigned.key'),
  cert: fs.readFileSync('./certs/selfsigned.crt')
};

https.createServer(credentials, app).listen(port, () => {
  console.log(`Server listening on https://localhost:${port}`);
});