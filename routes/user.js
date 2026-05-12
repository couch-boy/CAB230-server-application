import express from 'express';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import 'dotenv/config';
import { isValidDate } from '../middleware/validation.js';

const router = express.Router();

const performLogin = async (req, res, expiresIn) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: true, message: "Request body incomplete - email and password needed" });
  }

  try {
    const user = await req.db("users").where({ email }).first();
    if (!user || !(await argon2.verify(user.hash, password))) {
      return res.status(401).json({ error: true, message: "Incorrect email or password" });
    }

    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const token = jwt.sign({ email, exp }, process.env.JWT_SECRET);

    res.json({ token, tokenType: "Bearer", expiresIn });
  } catch (e) {
    res.status(500).json({ error: true, message: "Internal Server Error" });
  }
};

// ============================== POST /register ==============================
router.post('/register', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: true, message: "Request body incomplete - email and password needed" });
  }

  try {
    const existing = await req.db("users").where({ email }).first();
    if (existing) {
      return res.status(409).json({ error: true, message: "User already exists" });
    }

    const hash = await argon2.hash(password);
    await req.db("users").insert({ email, hash });
    res.status(201).json({ success: true, message: "User created" });
  } catch (e) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

// ============================== POST /login ==============================
router.post('/login', (req, res) => performLogin(req, res, 60 * 60 * 24));

// ============================== POST /debugLogin ==============================
router.post('/debugLogin', (req, res) => performLogin(req, res, 1));

// ============================== GET /{email}/profile ==============================
router.get('/:email/profile', async (req, res) => {
  const requestedEmail = req.params.email;
  const authHeader = req.headers.authorization;
  let authenticatedEmail = null;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      authenticatedEmail = decoded.email;
    } catch (err) {
      if (err.name === 'TokenExpiredError') return res.status(401).json({ error: true, message: "JWT token has expired" });
      return res.status(401).json({ error: true, message: "Invalid JWT token" });
    }
  }

  try {
    const user = await req.db("users").where("email", requestedEmail).first();
    if (!user) return res.status(404).json({ error: true, message: "User not found" });

    if (authenticatedEmail === requestedEmail) {
      const { hash, ...profile } = user;
      res.status(200).json(profile);
    } else {
      res.status(200).json({ email: user.email, firstName: user.firstName, lastName: user.lastName });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

// ============================== PUT /{email}/profile ==============================
router.put('/:email/profile', async (req, res) => {
  const requestedEmail = req.params.email;
  const { firstName, lastName, dob, address } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: true, message: "Authorization header ('Bearer token') not found" });
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.email !== requestedEmail) return res.status(403).json({ error: true, message: "Forbidden" });
  } catch (err) {
    return res.status(401).json({ error: true, message: "Invalid JWT token" });
  }

  if ([firstName, lastName, dob, address].some(field => field === undefined)) {
    return res.status(400).json({ error: true, message: "Request body incomplete: firstName, lastName, dob and address are required." });
  }

  if (![firstName, lastName, address, dob].every(val => typeof val === 'string')) {
    return res.status(400).json({ error: true, message: "Request body invalid: firstName, lastName and address must be strings only." });
  }

  if (!isValidDate(dob)) {
    return res.status(400).json({ error: true, message: "Invalid input: dob must be a real date in format YYYY-MM-DD." });
  }

  const dobDate = new Date(dob);
  if (dobDate >= new Date()) {
    return res.status(400).json({ error: true, message: "Invalid input: dob must be a date in the past." });
  }

  try {
    const updated = await req.db("users").where({ email: requestedEmail }).update({ firstName, lastName, dob, address });
    if (updated === 0) return res.status(404).json({ error: true, message: "User not found" });
    res.status(200).json({ email: requestedEmail, firstName, lastName, dob, address });
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

export default router;