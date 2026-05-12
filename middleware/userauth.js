import jwt from 'jsonwebtoken';

const authorization = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            error: true, 
            message: "Authorization header ('Bearer token') not found" 
        });
    }

    // Split by space and take the second part to avoid regex issues
    const token = authHeader.split(' ')[1];

    try {
        // Log this if you are still getting 401s to ensure it's not undefined
        // console.log("Secret used for verification:", process.env.JWT_SECRET);
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (e) {
        if (e.name === "TokenExpiredError") {
            return res.status(401).json({ error: true, message: "JWT token has expired" });
        }
        
        // If you reach here, the token is technically malformed or signed with a different key
        return res.status(401).json({ error: true, message: "Invalid JWT token" });
    }
};

export default authorization;