import express from 'express';
import authorization from '../middleware/userauth.js';

const router = express.Router();

/**
 * Helper to format rating objects for response.
 */
const formatRating = (row) => {
  const formatted = {
    rating: row.rating,
    dateTime: new Date(row.dateTime).toISOString()
  };

  // The GET /ratings endpoint expects rentalId
  if (row.rentalId) formatted.rentalId = parseInt(row.rentalId);

  // Only add comment if it's not null/undefined
  if (row.comment !== null && row.comment !== undefined) {
    formatted.comment = row.comment;
  }

  return formatted;
};

// ============================== POST /debugEraseRatings ==============================
router.post('/debugEraseRatings', (req, res) => {
  req.db("ratings")
    .truncate()
    .then(() => {
      res.status(200).json({ message: "All ratings successfully erased." });
    })
    .catch(err => {
      res.status(500).json({ error: true, message: "Database error" });
    });
});

// ============================== GET / ==============================
router.get('/', authorization, async (req, res) => {
  // Check for invalid query parameters (only 'page' is allowed)
  const allowedParams = ['page'];
  const actualParams = Object.keys(req.query);
  const invalidParams = actualParams.filter(p => !allowedParams.includes(p));

  if (invalidParams.length > 0) {
    return res.status(400).json({
      error: true,
      message: `Invalid query parameters: ${invalidParams.join(", ")}. Query parameters are not permitted.`
    });
  }

  const userEmail = req.user.email;
  let page = parseInt(req.query.page) || 1;
  const perPage = 20;

  if (isNaN(page) || page < 1) {
    return res.status(400).json({
      error: true,
      message: "Invalid page parameter. Must be an integer greater than or equal to 1."
    });
  }

  try {
    const countRes = await req.db("ratings").where("userEmail", userEmail).count("id as total");
    const total = countRes[0].total;
    const lastPage = Math.ceil(total / perPage) || 1;
    const offset = (page - 1) * perPage;

    const rows = await req.db("ratings")
      .select("rentalId", "rating", "comment", "dateTime")
      .where("userEmail", userEmail)
      .limit(perPage)
      .offset(offset);

    const data = rows.map(row => formatRating(row));

    res.status(200).json({
      data,
      pagination: {
        total,
        lastPage,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page < lastPage ? page + 1 : null,
        perPage,
        currentPage: page,
        from: offset,
        to: offset + data.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

// ============================== GET /rentals/{id} ==============================
router.get('/rentals/:id', authorization, (req, res) => {
  const rentalId = parseInt(req.params.id); // Parse to integer

  // Guard against non-numeric IDs which would cause DB errors
  if (isNaN(rentalId)) {
    return res.status(404).json({
      error: true,
      message: "No rating exists with this rental ID."
    });
  }

  req.db("ratings")
    .select("rating", "comment", "dateTime")
    .where({ rentalId, userEmail: req.user.email })
    .first()
    .then(row => {
      if (!row) {
        // This matches your test expectation exactly
        return res.status(404).json({
          error: true,
          message: "No rating exists with this rental ID."
        });
      }
      res.status(200).json(formatRating(row));
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: true, message: "Database error" });
    });
});

// ============================== POST /rentals/{id} ==============================
router.post('/rentals/:id', authorization, async (req, res) => {
  const rentalId = parseInt(req.params.id);
  const userEmail = req.user.email;
  const { rating, comment } = req.body;

  // 1. Validate Rating
  if (rating === undefined || typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return res.status(400).json({
      error: true,
      message: "Invalid rating. Rating must be an integer value between 1 and 5."
    });
  }

  // 2. Validate Comment
  if (req.body.hasOwnProperty('comment')) {
    if (typeof comment !== 'string' || comment.length < 1 || comment.length > 2000) {
      return res.status(400).json({
        error: true,
        message: "Invalid comment parameter. Comment must be a string 1-2000 characters long."
      });
    }
  }

  try {
    // 1. Verify property exists in 'data' table
    // If this is missing or the ID is malformed, the test expects 404
    const property = await req.db("data").where("id", rentalId).first();

    if (!property) {
      return res.status(404).json({
        error: true,
        message: "No rental exists with this ID."
      });
    }

    const now = new Date();
    const dbComment = comment || null;

    // 2. Perform the update/insert
    await req.db("ratings")
      .insert({ rentalId, userEmail, rating, comment: dbComment, dateTime: now })
      .onConflict(['rentalId', 'userEmail'])
      .merge({ rating, comment: dbComment, dateTime: now });

    res.status(201).json(formatRating({ rating, comment: dbComment, dateTime: now }));
  } catch (err) {
    console.error(err); // Look at your console to see the specific SQL error
    res.status(500).json({ error: true, message: "Database error" });
  }
});

export default router;