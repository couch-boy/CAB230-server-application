const validSortFields = [
  "id", "title", "rent", "propertyType", "latitude", "longitude",
  "postcode", "state", "suburb", "bathrooms", "bedrooms",
  "parkingSpaces", "averageRating", "numRatings"
];

export const validateSearchParameters = (query) => {
  const {
    postcode, minimumRent, maximumRent,
    minimumBathrooms, maximumBathrooms,
    minimumBedrooms, maximumBedrooms,
    minimumParking, maximumParking,
    minimumRating, maximumRating,
    sortBy, sortOrder, page
  } = query;

  // Postcode
  if (postcode && !/^\d{4}$/.test(postcode)) {
    return "Invalid postcode parameter. Must be an integer in the range of 0000-9999.";
  }

  // Rent
  if (minimumRent && (isNaN(minimumRent) || minimumRent < 0)) {
    return "Invalid minimumRent parameter. Must be a non-negative integer.";
  }
  if (maximumRent && (isNaN(maximumRent) || maximumRent < 0)) {
    return "Invalid maximumRent parameter. Must be a non-negative integer.";
  }

  // Bathrooms
  if (minimumBathrooms && (isNaN(minimumBathrooms) || minimumBathrooms < 0)) {
    return "Invalid minimumBathrooms parameter. Must be a non-negative integer.";
  }
  if (maximumBathrooms && (isNaN(maximumBathrooms) || maximumBathrooms < 0)) {
    return "Invalid maximumBathrooms parameter. Must be a non-negative integer.";
  }

  // Bedrooms
  if (minimumBedrooms && (isNaN(minimumBedrooms) || minimumBedrooms < 0)) {
    return "Invalid minimumBedrooms parameter. Must be a non-negative integer.";
  }
  if (maximumBedrooms && (isNaN(maximumBedrooms) || maximumBedrooms < 0)) {
    return "Invalid maximumBedrooms parameter. Must be a non-negative integer.";
  }

  // Parking
  if (minimumParking && (isNaN(minimumParking) || minimumParking < 0)) {
    return "Invalid minimumParking parameter. Must be a non-negative integer.";
  }
  if (maximumParking && (isNaN(maximumParking) || maximumParking < 0)) {
    return "Invalid maximumParking parameter. Must be a non-negative integer.";
  }

  // Ratings
  if (minimumRating && (isNaN(minimumRating) || minimumRating < 0)) {
    return "Invalid minimumRating parameter. Must be a non-negative number.";
  }
  if (maximumRating && (isNaN(maximumRating) || maximumRating < 0)) {
    return "Invalid maximumRating parameter. Must be a non-negative number.";
  }

  // Sort Validation
  if (sortBy && !validSortFields.includes(sortBy)) {
    return "Invalid sortBy parameter. Must refer to a valid sortable property.";
  }
  if (sortOrder && !['asc', 'desc'].includes(sortOrder.toLowerCase())) {
    return "Invalid sortOrder parameter. Must be 'asc' or 'desc'.";
  }
  if (sortOrder && !sortBy) {
    return "Invalid sortOrder parameter. sortBy must be specified.";
  }

  if (page && (isNaN(page) || page < 1)) {
    return "Invalid page parameter. Must be an integer greater than or equal to 1.";
  }

  return null;
};

export const isValidDate = (dateString) => {
  // Check format YYYY-MM-DD
  const regEx = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateString.match(regEx)) return false;

  const d = new Date(dateString);
  const dNum = d.getTime();
  if (!dNum && dNum !== 0) return false; // NaN check

  // Check for "overflow" dates (e.g. Feb 30)
  return d.toISOString().slice(0, 10) === dateString;
};

export const blockQueryParams = (req, res, next) => {
  if (Object.keys(req.query).length > 0) {
    const params = Object.keys(req.query).join(", ");
    return res.status(400).json({
      error: true,
      message: `Invalid query parameters: ${params}. Query parameters are not permitted.`
    });
  }
  next();
};