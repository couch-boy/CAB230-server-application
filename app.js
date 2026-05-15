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
      CAB230 server-application<br>Semester 1 2026<br>Mitchell de Waard<br>n8578524
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