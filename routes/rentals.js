import express from 'express';
import { validateSearchParameters } from '../middleware/validation.js';

const router = express.Router();

// ============================== /states ==============================

router.get("/states", (req, res, next) => {
  const queryParams = Object.keys(req.query);

  if (queryParams.length > 0) {
    return res.status(400).json({
      error: true,
      message: `Invalid query parameters: ${queryParams.join(", ")}. Query parameters are not permitted.`
    });
  }

  req.db("data")
    .distinct("state")
    .pluck("state")
    .orderBy("state")
    .then(states => {
      res.json(states);
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ error: true, message: "Error in MySQL query" });
    });
});

// ============================== /property-types ==============================

router.get("/property-types", (req, res, next) => {
  const queryParams = Object.keys(req.query);

  if (queryParams.length > 0) {
    return res.status(400).json({
      error: true,
      message: `Invalid query parameters: ${queryParams.join(", ")}. Query parameters are not permitted.`
    });
  }

  req.db("data")
    .distinct("propertyType")
    .pluck("propertyType")
    .orderBy("propertyType")
    .then(types => {
      res.json(types);
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ error: true, message: "Error in MySQL query" });
    });
});

// ============================== /search ==============================

router.get("/search", (req, res, next) => {
  const errorMessage = validateSearchParameters(req.query);

  if (errorMessage) {
    return res.status(400).json({ error: true, message: errorMessage });
  }

  const {
    postcode, propertyTypes, state, suburb,
    minimumRent, maximumRent,
    minimumBathrooms, maximumBathrooms,
    minimumBedrooms, maximumBedrooms,
    minimumParking, maximumParking,
    sortBy, sortOrder, page
  } = req.query;

  const pageNum = parseInt(page) || 1;
  const perPage = 10;
  const offset = (pageNum - 1) * perPage;

  const applyFilters = (queryBuilder) => {
    if (postcode) queryBuilder.where("postcode", postcode);

    if (propertyTypes) {
      const typesArray = Array.isArray(propertyTypes) ? propertyTypes : [propertyTypes];
      queryBuilder.whereIn("propertyType", typesArray);
    }

    if (state) queryBuilder.where("state", state);
    if (suburb) queryBuilder.where("suburb", suburb);


    if (minimumRent) queryBuilder.where("rent", ">=", minimumRent);
    if (maximumRent) queryBuilder.where("rent", "<=", maximumRent);

    if (minimumBathrooms) queryBuilder.where("bathrooms", ">=", minimumBathrooms);
    if (maximumBathrooms) queryBuilder.where("bathrooms", "<=", maximumBathrooms);

    if (minimumBedrooms) queryBuilder.where("bedrooms", ">=", minimumBedrooms);
    if (maximumBedrooms) queryBuilder.where("bedrooms", "<=", maximumBedrooms);

    if (minimumParking) queryBuilder.where("parkingSpaces", ">=", minimumParking);
    if (maximumParking) queryBuilder.where("parkingSpaces", "<=", maximumParking);
  };

  req.db("data")
    .modify(applyFilters)
    .count("id as total")
    .then(countRes => {
      const total = countRes[0].total;
      const lastPage = Math.ceil(total / perPage);

      return req.db("data")
        .leftJoin("ratings", "data.id", "ratings.rentalId")
        .modify(applyFilters)
        .select(
          "data.id", "data.title", "data.rent", "data.propertyType", "data.latitude",
          "data.longitude", "data.postcode", "data.state", "data.suburb",
          "data.bathrooms", "data.bedrooms", "data.parkingSpaces"
        )
        .select(req.db.raw("ROUND(AVG(ratings.rating), 1) as averageRating"))
        .select(req.db.raw("COUNT(ratings.id) as numRatings"))
        .groupBy("data.id")
        .orderBy(sortBy || 'id', sortOrder || 'asc')
        .limit(perPage)
        .offset(offset)
        .then(rows => {
          const formattedRows = rows.map(row => ({
            ...row,
            // Map averageRating: Keep null as null, otherwise convert to float
            averageRating: row.averageRating !== null ? parseFloat(row.averageRating) : null,
            numRatings: parseInt(row.numRatings),
            latitude: row.latitude !== null ? +row.latitude : null,
            longitude: row.longitude !== null ? +row.longitude : null
          }));

          res.json({
            data: formattedRows,
            pagination: {
              perPage,
              currentPage: pageNum,
              from: offset,
              to: offset + rows.length,
              total,
              lastPage,
              prevPage: pageNum > 1 ? pageNum - 1 : null,
              nextPage: pageNum < lastPage ? pageNum + 1 : null
            }
          });
        });
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: true, message: "Error in MySQL query" });
    });
});

// ============================== /{id} ==============================

router.get("/:id", (req, res) => {
  const queryParams = Object.keys(req.query);
  if (queryParams.length > 0) {
    return res.status(400).json({
      error: true,
      message: `Invalid query parameters: ${queryParams.join(", ")}. Query parameters are not permitted.`
    });
  }

  // 1. Get Property Details + Aggregates
  const propertyQuery = req.db("data")
    .leftJoin("ratings", "data.id", "ratings.rentalId")
    .select(
      "data.title", "data.rent", "data.description", "data.propertyType", "data.locality",
      "data.latitude", "data.longitude", "data.postcode", "data.state",
      "data.streetAddress", "data.suburb", "data.bathrooms", "data.bedrooms",
      "data.parkingSpaces", "data.agencyName", "data.amenities"
    )
    .select(req.db.raw("ROUND(AVG(ratings.rating), 2) as averageRating"))
    .select(req.db.raw("COUNT(ratings.id) as numRatings"))
    .where("data.id", req.params.id)
    .groupBy("data.id")
    .first();

  // 2. Get Individual Reviews - Order is CRITICAL for the tests
  const reviewsQuery = req.db("ratings")
    .select("rating", "user", "comment", "dateTime")
    .where("rentalId", req.params.id)
    .orderBy("dateTime", "asc"); // 'asc' puts the first posted rating at index [0]

  Promise.all([propertyQuery, reviewsQuery])
    .then(([property, reviews]) => {
      // Check if property exists (leftJoin can return a row of nulls)
      if (!property || property.title === null) {
        return res.status(404).json({ 
          error: true, 
          message: "No rental exists with this ID." 
        });
      }

      const response = {
        ...property,
        averageRating: property.averageRating !== null ? parseFloat(property.averageRating) : null,
        numRatings: parseInt(property.numRatings),
        latitude: property.latitude !== null ? +property.latitude : null,
        longitude: property.longitude !== null ? +property.longitude : null,

        // 3. Format reviews array and conditionally add comment
        reviews: (reviews || []).map(r => {
          const review = {
            rating: r.rating,
            user: r.user,
            dateTime: new Date(r.dateTime).toISOString()
          };

          // Only add the comment key if it has a non-empty value
          if (r.comment && r.comment.trim() !== "") {
            review.comment = r.comment;
          }
          
          return review;
        })
      };

      res.status(200).json(response);
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: true, message: "Database error" });
    });
});

export default router;