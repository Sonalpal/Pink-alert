const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        

        // Connect to MongoDB
        const conn = await mongoose.connect(process.env.MONGO_URI);

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error Connecting to MongoDB: ${error.message}`);
        // Exit process with failure
        process.exit(1);
    }
};

module.exports = connectDB;
