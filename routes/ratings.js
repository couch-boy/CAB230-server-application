import express from 'express';
import authorization from '../middleware/userauth.js';
import { blockQueryParams } from '../middleware/validation.js';

const router = express.Router();

// Helper to format rating objects for response.
const formatRating = ({ rating, dateTime, rentalId, comment }) => ({
  rating,
  dateTime: new Date(dateTime).toISOString(),
  ...(rentalId && { rentalId: parseInt(rentalId) }),
  ...(comment != null && comment.trim() !== "" && { comment })
});

// ============================== POST /debugEraseRatings ==============================
router.post('/debugEraseRatings', async (req, res) => {
  try {
    await req.db("ratings").truncate();
    res.status(200).json({ message: "All ratings successfully erased." });
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

// ============================== GET / ==============================
router.get('/', authorization, async (req, res) => {
  const actualParams = Object.keys(req.query);
  const invalidParams = actualParams.filter(p => p !== 'page');

  if (invalidParams.length > 0) {
    return res.status(400).json({
      error: true,
      message: `Invalid query parameters: ${invalidParams.join(", ")}. Query parameters are not permitted.`
    });
  }

  const user = req.user.email;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = 20;
  const offset = (page - 1) * perPage;

  try {
    const [{ total }] = await req.db("ratings").where({ user }).count("id as total");
    const rows = await req.db("ratings")
      .select("rentalId", "rating", "comment", "dateTime")
      .where({ user })
      .limit(perPage)
      .offset(offset);

    const lastPage = Math.ceil(total / perPage) || 1;

    res.status(200).json({
      data: rows.map(formatRating),
      pagination: {
        total,
        lastPage,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page < lastPage ? page + 1 : null,
        perPage,
        currentPage: page,
        from: offset,
        to: offset + rows.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

// ============================== GET /rentals/:id ==============================
router.get('/rentals/:id', authorization, blockQueryParams, async (req, res) => {
  const rentalId = parseInt(req.params.id);

  if (isNaN(rentalId)) {
    return res.status(404).json({ error: true, message: "No rating exists with this rental ID." });
  }

  try {
    const row = await req.db("ratings")
      .select("rating", "comment", "dateTime")
      .where({ rentalId, user: req.user.email })
      .first();

    if (!row) {
      return res.status(404).json({ error: true, message: "No rating exists with this rental ID." });
    }
    res.status(200).json(formatRating(row));
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

// ============================== POST /rentals/:id ==============================
router.post('/rentals/:id', authorization, async (req, res) => {
  const rentalId = parseInt(req.params.id);
  const user = req.user.email;
  const { rating, comment } = req.body;

  if (rating === undefined || typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return res.status(400).json({
      error: true,
      message: "Invalid rating. Rating must be an integer value between 1 and 5."
    });
  }

  if (req.body.hasOwnProperty('comment')) {
    if (typeof comment !== 'string' || comment.length < 1 || comment.length > 2000) {
      return res.status(400).json({
        error: true,
        message: "Invalid comment parameter. Comment must be a string 1-2000 characters long."
      });
    }
  }

  try {
    const property = await req.db("data").where("id", rentalId).first();
    if (!property) {
      return res.status(404).json({ error: true, message: "No rental exists with this ID." });
    }

    const now = new Date();
    const dbComment = comment || null;

    await req.db("ratings")
      .insert({ rentalId, user, rating, comment: dbComment, dateTime: now })
      .onConflict(['rentalId', 'user'])
      .merge({ rating, comment: dbComment, dateTime: now });

    res.status(201).json(formatRating({ rating, comment: dbComment, dateTime: now }));
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

export default router;