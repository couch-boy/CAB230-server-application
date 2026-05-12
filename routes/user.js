import express from 'express';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';

import 'dotenv/config';
import authorization from '../middleware/userauth.js';
import { isValidDate } from '../middleware/validation.js';

const router = express.Router();

// Helper to handle the actual authentication logic
const performLogin = (req, res, expiresIn) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed"
    });
  }

  req.db.from("users").select("*").where("email", "=", email)
    .then(users => {
      if (users.length === 0) {
        return res.status(401).json({ error: true, message: "Incorrect email or password" });
      }

      const { hash } = users[0];
      return argon2.verify(hash, password).then(match => {
        if (!match) {
          return res.status(401).json({ error: true, message: "Incorrect email or password" });
        }

        const exp = Math.floor(Date.now() / 1000) + expiresIn;
        const token = jwt.sign({ email, exp }, process.env.JWT_SECRET);

        res.json({
          token,
          tokenType: "Bearer",
          expiresIn
        });
      });
    })
    .catch(e => {
      console.error(e);
      if (!res.headersSent) {
        res.status(500).json({ error: true, message: "Internal Server Error" });
      }
    });
};

// ============================== /register ==============================

router.post('/register', (req, res, next) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed"
    });
  }

  req.db.from("users").select("*").where("email", "=", email)
    .then(users => {
      if (users.length > 0) {
        res.status(409).json({ error: true, message: "User already exists" });
        return null; // Return null to signal we shouldn't proceed
      }
      return argon2.hash(password);
    })
    .then(hash => {
      // If hash is null, it means we already sent a 409
      if (!hash) return;
      return req.db.from("users").insert({ email, hash });
    })
    .then(result => {
      if (res.headersSent) return;
      res.status(201).json({ success: true, message: "User created" });
    })
    .catch(e => {
      console.error(e);
      res.status(500).json({ error: true, message: "Error in MySQL query or hashing" });
    });
});

// ============================== /login ==============================

// Standard Login (10 minutes)
router.post('/login', (req, res) => {
  const ONE_DAY = 60 * 60 * 24;
  performLogin(req, res, ONE_DAY);
});

// ============================== /debugLogin ==============================

// Debug Login (1 second)
router.post('/debugLogin', (req, res) => {
  const ONE_SEC = 1;
  performLogin(req, res, ONE_SEC);
});

// ============================== GET /{email}/profile ==============================

router.get('/:email/profile', (req, res) => {
  const requestedEmail = req.params.email;
  const authHeader = req.headers.authorization;
  let authenticatedEmail = null;

  // 1. Optional JWT Verification
  if (authHeader) {
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: true, message: "Authorization header is malformed" });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      authenticatedEmail = decoded.email;
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: true, message: "JWT token has expired" });
      }
      return res.status(401).json({ error: true, message: "Invalid JWT token" });
    }
  }

  // 2. Database Query
  req.db.from("users")
    .select("email", "firstName", "lastName", "dob", "address")
    .where("email", "=", requestedEmail)
    .first()
    .then(user => {
      if (!user) {
        return res.status(404).json({ error: true, message: "User not found" });
      }

      // 3. Determine Output Level
      // If the person logged in IS the owner of the profile, show everything
      if (authenticatedEmail === requestedEmail) {
        res.status(200).json(user);
      } else {
        // Otherwise, show only the public fields
        res.status(200).json({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        });
      }
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: true, message: "Error in MySQL query" });
    });
});

// ============================== PUT /{email}/profile ==============================

router.put('/:email/profile', (req, res) => {
  const requestedEmail = req.params.email;
  const authHeader = req.headers.authorization;
  const { firstName, lastName, dob, address } = req.body;

  // 1. Authorization Header Check
  if (!authHeader) {
    return res.status(401).json({ error: true, message: "Authorization header ('Bearer token') not found" });
  }
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: true, message: "Authorization header is malformed" });
  }

  // 2. JWT Verification
  const token = authHeader.split(' ')[1];
  let authenticatedEmail;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    authenticatedEmail = decoded.email;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: true, message: "JWT token has expired" });
    }
    return res.status(401).json({ error: true, message: "Invalid JWT token" });
  }

  // 3. Ownership Check (Forbidden)
  if (authenticatedEmail !== requestedEmail) {
    return res.status(403).json({ error: true, message: "Forbidden" });
  }

  // 4. Content Validation (Incomplete Body)
  if (firstName === undefined || lastName === undefined || dob === undefined || address === undefined) {
    return res.status(400).json({
      error: true,
      message: "Request body incomplete: firstName, lastName, dob and address are required."
    });
  }

  // 5. Type Check (Must be strings)
  if (typeof firstName !== 'string' || typeof lastName !== 'string' || typeof address !== 'string' || typeof dob !== 'string') {
    return res.status(400).json({
      error: true,
      message: "Request body invalid: firstName, lastName and address must be strings only."
    });
  }

  // 6. Date Validation (Format & Reality)
  if (!isValidDate(dob)) {
    return res.status(400).json({
      error: true,
      message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
    });
  }

  // 7. Date Validation (In the Past)
  const dobDate = new Date(dob);
  if (dobDate >= new Date()) {
    return res.status(400).json({ error: true, message: "Invalid input: dob must be a date in the past." });
  }

  // 8. Database Update
  req.db.from("users")
    .where("email", "=", requestedEmail)
    .update({ firstName, lastName, dob, address })
    .then(updatedRows => {
      if (updatedRows === 0) {
        return res.status(404).json({ error: true, message: "User not found" });
      }

      // Return the updated profile
      res.status(200).json({
        email: requestedEmail,
        firstName,
        lastName,
        dob,
        address
      });
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: true, message: "Error in MySQL query" });
    });
});

export default router;