import express from 'express';
import { validateSearchParameters, blockQueryParams } from '../middleware/validation.js';

const router = express.Router();

router.get("/states", blockQueryParams, async (req, res) => {
  try {
    const states = await req.db("data").distinct("state").pluck("state").orderBy("state");
    res.json(states);
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

router.get("/property-types", blockQueryParams, async (req, res) => {
  try {
    const types = await req.db("data").distinct("propertyType").pluck("propertyType").orderBy("propertyType");
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

router.get("/search", async (req, res) => {
  const errorMessage = validateSearchParameters(req.query);
  if (errorMessage) return res.status(400).json({ error: true, message: errorMessage });

  const {
    postcode, propertyTypes, state, suburb,
    minimumRent, maximumRent, minimumBathrooms, maximumBathrooms,
    minimumBedrooms, maximumBedrooms, minimumParking, maximumParking,
    minimumRating, maximumRating, sortBy, sortOrder, page
  } = req.query;

  const pageNum = parseInt(page) || 1;
  const perPage = 10;
  const offset = (pageNum - 1) * perPage;

  const applyFilters = (query) => {
    if (postcode) query.where("data.postcode", postcode);
    if (state) query.where("data.state", state);
    if (suburb) query.where("data.suburb", suburb);
    if (propertyTypes) query.whereIn("data.propertyType", Array.isArray(propertyTypes) ? propertyTypes : [propertyTypes]);
    if (minimumRent) query.where("data.rent", ">=", minimumRent);
    if (maximumRent) query.where("data.rent", "<=", maximumRent);
    if (minimumBathrooms) query.where("data.bathrooms", ">=", minimumBathrooms);
    if (maximumBathrooms) query.where("data.bathrooms", "<=", maximumBathrooms);
    if (minimumBedrooms) query.where("data.bedrooms", ">=", minimumBedrooms);
    if (maximumBedrooms) query.where("data.bedrooms", "<=", maximumBedrooms);
    if (minimumParking) query.where("data.parkingSpaces", ">=", minimumParking);
    if (maximumParking) query.where("data.parkingSpaces", "<=", maximumParking);
  };

  try {
    // Count total matches (using raw query or subquery for aggregates if needed)
    const [{ total }] = await req.db("data").modify(applyFilters).count("id as total");

    let query = req.db("data")
      .leftJoin("ratings", "data.id", "ratings.rentalId")
      .modify(applyFilters)
      .select("data.*")
      .select(req.db.raw("ROUND(AVG(ratings.rating), 1) as averageRating"))
      .select(req.db.raw("COUNT(ratings.id) as numRatings"))
      .groupBy("data.id");

    if (minimumRating) query.having("averageRating", ">=", minimumRating);
    if (maximumRating) query.having("averageRating", "<=", maximumRating);

    const rows = await query.orderBy(sortBy || 'id', sortOrder || 'asc').limit(perPage).offset(offset);

    const data = rows.map(row => ({
      ...row,
      averageRating: row.averageRating ? parseFloat(row.averageRating) : null,
      numRatings: parseInt(row.numRatings),
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null
    }));

    res.json({
      data,
      pagination: {
        perPage,
        currentPage: pageNum,
        from: offset,
        to: offset + data.length,
        total,
        lastPage: Math.ceil(total / perPage),
        prevPage: pageNum > 1 ? pageNum - 1 : null,
        nextPage: pageNum < Math.ceil(total / perPage) ? pageNum + 1 : null
      }
    });
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

router.get("/:id", blockQueryParams, async (req, res) => {
  try {
    const property = await req.db("data")
      .leftJoin("ratings", "data.id", "ratings.rentalId")
      .select("data.*")
      .select(req.db.raw("ROUND(AVG(ratings.rating), 2) as averageRating"))
      .select(req.db.raw("COUNT(ratings.id) as numRatings"))
      .where("data.id", req.params.id)
      .groupBy("data.id")
      .first();

    if (!property || property.id === null) {
      return res.status(404).json({ error: true, message: "No rental exists with this ID." });
    }

    const reviews = await req.db("ratings")
      .select("rating", "user", "comment", "dateTime")
      .where("rentalId", req.params.id)
      .orderBy("dateTime", "asc");

    res.status(200).json({
      ...property,
      averageRating: property.averageRating ? parseFloat(property.averageRating) : null,
      numRatings: parseInt(property.numRatings),
      latitude: property.latitude ? Number(property.latitude) : null,
      longitude: property.longitude ? Number(property.longitude) : null,
      reviews: reviews.map(r => ({
        rating: r.rating,
        user: r.user,
        dateTime: new Date(r.dateTime).toISOString(),
        ...(r.comment?.trim() && { comment: r.comment })
      }))
    });
  } catch (err) {
    res.status(500).json({ error: true, message: "Database error" });
  }
});

export default router;