require('dotenv').config({ path: './backend/.env' });
const mongoose = require('mongoose');

async function deleteAllListings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const result = await mongoose.connection.db.collection('listings').deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} listings`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

deleteAllListings();
