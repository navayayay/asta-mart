require('dotenv').config();
const mongoose = require('mongoose');
const { VPPackage } = require('./models');

const vpPackages = [
    {
        region: 'PH',
        regionName: 'Philippines',
        vpAmount: 1000,
        packageName: '1000 VP',
        moogoldProductId: 'vp-ph-1000',
        priceINR: 500,
        active: true,
        sortOrder: 1
    },
    {
        region: 'PH',
        regionName: 'Philippines',
        vpAmount: 2500,
        packageName: '2500 VP',
        moogoldProductId: 'vp-ph-2500',
        priceINR: 1100,
        active: true,
        sortOrder: 2
    },
    {
        region: 'PH',
        regionName: 'Philippines',
        vpAmount: 5000,
        packageName: '5000 VP',
        moogoldProductId: 'vp-ph-5000',
        priceINR: 2000,
        active: true,
        sortOrder: 3
    },
    {
        region: 'ID',
        regionName: 'Indonesia',
        vpAmount: 1000,
        packageName: '1000 VP',
        moogoldProductId: 'vp-id-1000',
        priceINR: 550,
        active: true,
        sortOrder: 1
    },
    {
        region: 'ID',
        regionName: 'Indonesia',
        vpAmount: 2500,
        packageName: '2500 VP',
        moogoldProductId: 'vp-id-2500',
        priceINR: 1150,
        active: true,
        sortOrder: 2
    },
    {
        region: 'ID',
        regionName: 'Indonesia',
        vpAmount: 5000,
        packageName: '5000 VP',
        moogoldProductId: 'vp-id-5000',
        priceINR: 2100,
        active: true,
        sortOrder: 3
    },
    {
        region: 'TH',
        regionName: 'Thailand',
        vpAmount: 1000,
        packageName: '1000 VP',
        moogoldProductId: 'vp-th-1000',
        priceINR: 480,
        active: true,
        sortOrder: 1
    },
    {
        region: 'TH',
        regionName: 'Thailand',
        vpAmount: 2500,
        packageName: '2500 VP',
        moogoldProductId: 'vp-th-2500',
        priceINR: 1050,
        active: true,
        sortOrder: 2
    },
    {
        region: 'TH',
        regionName: 'Thailand',
        vpAmount: 5000,
        packageName: '5000 VP',
        moogoldProductId: 'vp-th-5000',
        priceINR: 1950,
        active: true,
        sortOrder: 3
    },
    {
        region: 'SG',
        regionName: 'Singapore',
        vpAmount: 1000,
        packageName: '1000 VP',
        moogoldProductId: 'vp-sg-1000',
        priceINR: 600,
        active: true,
        sortOrder: 1
    },
    {
        region: 'SG',
        regionName: 'Singapore',
        vpAmount: 2500,
        packageName: '2500 VP',
        moogoldProductId: 'vp-sg-2500',
        priceINR: 1300,
        active: true,
        sortOrder: 2
    },
    {
        region: 'SG',
        regionName: 'Singapore',
        vpAmount: 5000,
        packageName: '5000 VP',
        moogoldProductId: 'vp-sg-5000',
        priceINR: 2400,
        active: true,
        sortOrder: 3
    },
    {
        region: 'KH',
        regionName: 'Cambodia',
        vpAmount: 1000,
        packageName: '1000 VP',
        moogoldProductId: 'vp-kh-1000',
        priceINR: 450,
        active: true,
        sortOrder: 1
    },
    {
        region: 'KH',
        regionName: 'Cambodia',
        vpAmount: 2500,
        packageName: '2500 VP',
        moogoldProductId: 'vp-kh-2500',
        priceINR: 950,
        active: true,
        sortOrder: 2
    },
    {
        region: 'KH',
        regionName: 'Cambodia',
        vpAmount: 5000,
        packageName: '5000 VP',
        moogoldProductId: 'vp-kh-5000',
        priceINR: 1850,
        active: true,
        sortOrder: 3
    },
    {
        region: 'MY',
        regionName: 'Malaysia',
        vpAmount: 1000,
        packageName: '1000 VP',
        moogoldProductId: 'vp-my-1000',
        priceINR: 520,
        active: true,
        sortOrder: 1
    },
    {
        region: 'MY',
        regionName: 'Malaysia',
        vpAmount: 2500,
        packageName: '2500 VP',
        moogoldProductId: 'vp-my-2500',
        priceINR: 1100,
        active: true,
        sortOrder: 2
    },
    {
        region: 'MY',
        regionName: 'Malaysia',
        vpAmount: 5000,
        packageName: '5000 VP',
        moogoldProductId: 'vp-my-5000',
        priceINR: 2050,
        active: true,
        sortOrder: 3
    }
];

async function seedDatabase() {
    try {
        console.log('🌱 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        console.log('🧹 Clearing existing VP packages...');
        await VPPackage.deleteMany({});

        console.log('📦 Seeding VP packages...');
        const result = await VPPackage.insertMany(vpPackages);
        console.log(`✅ Successfully added ${result.length} VP packages`);

        console.log('\n📊 Packages by region:');
        const regions = await VPPackage.find({}).distinct('region');
        for (const region of regions) {
            const count = await VPPackage.countDocuments({ region });
            const regionName = await VPPackage.findOne({ region }).select('regionName');
            console.log(`   ${region} (${regionName.regionName}): ${count} packages`);
        }

        console.log('\n🎉 Seeding complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding error:', error.message);
        process.exit(1);
    }
}

seedDatabase();
