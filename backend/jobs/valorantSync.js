const axios = require('axios');
const cron = require('node-cron');
const Skin = require('../models/Skin'); // Assuming you have a Mongoose model for Skins

// The mapping logic lives HERE on the backend now!
function determineTierClass(tierUuid) {
  switch(tierUuid) {
    case 'e046854e-406c-37f4-6607-19a9ba8426fc': return 'tier-exclusive'; // Orange
    case '411e4a55-4e59-7757-41f0-86a53f101bb5': return 'tier-ultra';     // Yellow
    case '0cebb8be-46d7-c12a-d306-e9907afef163': return 'tier-semiprem';  // Select (Blue)
    case '12683d76-48d7-84a3-4e09-6985794f0445': return 'tier-semiprem';  // Deluxe (Green)
    case 'battlepass': return 'tier-battlepass';                         // Grey
    default: return 'tier-premium';                                      // Pink (Premium)
  }
}

async function syncValorantData() {
  console.log('🔄 Starting daily Valorant API sync...');
  
  try {
    const response = await axios.get('https://valorant-api.com/v1/weapons/skins');
    const skins = response.data.data;

    // Process and format the skins
    const formattedSkins = skins.map(skin => ({
      uuid: skin.uuid,
      name: skin.displayName,
      icon: skin.displayIcon || skin.wallpaper, // Fallback if no icon
      displayTier: determineTierClass(skin.contentTierUuid) // Assign the CSS class!
    }));

    // Upsert pattern: Update existing skins or insert new ones
    // This is atomic and safe: if it fails mid-way, DB is not left empty
    const bulkOps = formattedSkins.map(skin => ({
      updateOne: {
        filter: { uuid: skin.uuid },
        update: { $set: skin },
        upsert: true
      }
    }));
    
    if (bulkOps.length > 0) {
      await Skin.bulkWrite(bulkOps);
      console.log(`✅ Successfully synced ${formattedSkins.length} skins.`);
    }
  } catch (error) {
    console.error('❌ Failed to sync Valorant data:', error.message);
  }
}

// Schedule this to run every day at 4:00 AM
cron.schedule('0 4 * * *', () => {
  syncValorantData();
});

module.exports = syncValorantData;