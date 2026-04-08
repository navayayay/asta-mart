const axios = require('axios');

// ⚠️  SECURITY: This module handles Riot OAuth access tokens which grant full account access.
// - Tokens must ALWAYS be transmitted over HTTPS (enforced in production)
// - Request bodies containing tokens must NEVER be logged
// - Tokens are validated before any Riot API calls
// - Error messages must NOT expose partial token values

// L7: JWT Verification Limitation Documentation
// Riot API tokens cannot be cryptographically verified server-side because:
// 1. Riot does not publish public keys for JWT signature verification
// 2. Token validation must be done via Riot's /entitlements endpoint API call (see syncFromToken)
// 3. This is a known limitation - signature verification is NOT possible
// 4. Alternative: Trust tokens only from HTTPS iframe redirects from official Riot auth
// 5. Current implementation validates token format, makes API calls, and validates responses
// 6. For future audits: Consider implementing token expiration tracking and refresh logic

const VP_UUID = '85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741';
const RP_UUID = 'e59aa87c-4cbf-517a-5983-6e81511be9b7';
const SKIN_ITEM_TYPE_UUID = 'e7c63390-eda7-46e0-bb7a-a6abdacd2433';
const AGENT_ITEM_TYPE_UUID = '01bb38e1-da47-4e6a-9b3d-945fe4655707'; 
const BUDDY_ITEM_TYPE_UUID = 'dd3bf334-87f3-40bd-b043-682a57a8dc3a';

const PREMIUM_TIERS = [
    '60bca009-4182-7998-dee7-b8a2558dc369', // Exclusive
    'e046854e-406c-37f4-6607-19a9ba8426fc', // Ultra
    '411e4a55-4e59-7757-41f0-86a53f101bb5'  // Premium
];

// Expanded Master Dictionary of EVERY Battlepass Collection (Including Ep 8 & 9)
const BP_COLLECTIONS = [
    'kingdom', 'couture', '.exe', 'hivemind', 'polyfox', 'red alert', 'ruin', 'serenity', 'surge', 
    'aerosol', 'infinity', 'outpost', 'cavalier', 'polyfrog', 'prism iii', 'depths', 'lightwave', 'songsteel', 
    'k/tac', 'jigsaw', 'monarch', 'artisan', 'nitro', 'varnish', 'aero', 'genesis', 'goldwing', 
    'hydrodip', 'schema', 'velocity', 'divine swine', "lycan's bane", 'striker', 'coalition 87', 'hue shift', 'sys', 
    'shimmer', 'spitfire', 'task force 809', 'immortalized', 'piedra', 'premiere collision', 'iridian thorn', 'rune stone', 'starlit epiphany', 
    '9 lives', 'gridcrash', 'venturi', 'bound', 'monstrocity', 'signature', 'moondash', 'tilde', 'topotek', 
    'blush', 'composite', 'digihex', 'guardrail', 'libretto', 'silhouette', 'sandswept', 'transition', 'venter', 
    'aquatica', 'fiber optic', 'retrowave', 'shellspire', 'systres', 'cloudweaver', 'comet', 'tacti-series', 
    'convergence', 'bubble pop', 'bumble brigade', 'torque', 'frequency', 'bloodline', 'underscore', 'overlay', 'mementos', 
    'destination', 'wonderstallion', 'daydreams', 'rdvr', 'montage', 'heart splitter', 'atlas', 'interhelm', 'impeccable', 'flare'
];

class RiotAPI {
    constructor() {
        this.client = axios.create({ headers: { 'User-Agent': 'RiotClient/60.0.0.4852364.4789131 rso-auth (Windows;10;;Professional, x64)', 'Content-Type': 'application/json' } });
    }

    async syncFromToken(accessToken, idToken, masterCatalog) {
        let entToken = "", puuid = "";
        let country = "";

        try {
            // Validate token format before processing
            if (!accessToken || typeof accessToken !== 'string') {
                throw new Error('Invalid token format: token must be a non-empty string.');
            }
            const tokenRegex = /^[A-Za-z0-9\-._~+/]+=*\.[A-Za-z0-9\-._~+/]+=*\.[A-Za-z0-9\-._~+/]+=*$/;
            if (!tokenRegex.test(accessToken) || accessToken.length < 50 || accessToken.length > 5000) {
                throw new Error('Invalid token format: token does not match JWT structure.');
            }

            console.log(`\n--- STARTING DYNAMIC RIOT SYNC ---`);
            
            // 1. Entitlements
            const entResponse = await this.client.post('https://entitlements.auth.riotgames.com/api/token/v1', {}, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            entToken = entResponse.data.entitlements_token;

            const tokenParts = accessToken.split('.');
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf-8'));
            puuid = payload.sub;

            // 2. Exact Country Detection
            if (idToken) {
                try {
                    const geoRes = await this.client.put('https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant', 
                        { id_token: idToken }, 
                        { headers: { 'Authorization': `Bearer ${accessToken}` } }
                    );
                    if (geoRes.data && geoRes.data.country) {
                        country = geoRes.data.country;
                    } else {
                        const idPayload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
                        country = idPayload.cpid || idPayload.country || "";
                    }
                } catch (e) {}
            }

            const versionRes = await this.client.get('https://valorant-api.com/v1/version');
            const liveClientVersion = versionRes.data.data.riotClientVersion;
            const gameHeaders = { 'Authorization': `Bearer ${accessToken}`, 'X-Riot-Entitlements-JWT': entToken, 'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9', 'X-Riot-ClientVersion': liveClientVersion };

            // 3. Shard detection
            const regions = ['ap', 'na', 'eu', 'kr', 'latam', 'br'];
            let activeRegion = null, walletRes = null;
            for (const r of regions) {
                try { walletRes = await this.client.get(`https://pd.${r}.a.pvp.net/store/v1/wallet/${puuid}`, { headers: gameHeaders }); activeRegion = r; break; } catch (e) {}
            }
            if (!activeRegion) throw new Error('Account region not found.');

            const balances = walletRes.data.Balances;
            const vp = balances[VP_UUID] || 0;
            const rp = balances[RP_UUID] || 0;

            // 4. Level
            let accountLevel = 1;
            try {
                const xpRes = await this.client.get(`https://pd.${activeRegion}.a.pvp.net/account-xp/v1/players/${puuid}`, { headers: gameHeaders });
                accountLevel = xpRes.data.Progress.Level;
            } catch (err) {}

            // 5. RIOT ID
            let riotId = "ValorantPlayer";
            try {
                const nameRes = await this.client.put(`https://pd.${activeRegion}.a.pvp.net/name-service/v2/players`, [puuid], { headers: gameHeaders });
                if (nameRes.data && nameRes.data.length > 0) {
                    riotId = `${nameRes.data[0].GameName}#${nameRes.data[0].TagLine}`;
                }
            } catch (err) {}

            // 6. Player Card (Using disguised fetch)
            let playerCardImage = "https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/largeart.png";
            try {
                const fetchOpts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' } };
                const loadoutRes = await this.client.get(`https://pd.${activeRegion}.a.pvp.net/personalization/v2/players/${puuid}/playerloadout`, { headers: gameHeaders });
                const cardId = loadoutRes.data.Identity.PlayerCardID;
                
                const cardRes = await fetch(`https://valorant-api.com/v1/playercards/${cardId}`, fetchOpts);
                if (cardRes.ok) {
                    const cardData = await cardRes.json();
                    if(cardData.data && cardData.data.largeArt) playerCardImage = cardData.data.largeArt; 
                }
            } catch(err) { console.log(">> Failed to fetch player card image."); }

            // 7. Rank
            let currentRank = 'Unranked', peakRank = 'Unranked';
            try {
                const mmrRes = await this.client.get(`https://pd.${activeRegion}.a.pvp.net/mmr/v1/players/${puuid}`, { headers: gameHeaders });
                const tiersRes = await this.client.get('https://valorant-api.com/v1/competitivetiers');
                const latestTiersSet = tiersRes.data.data[tiersRes.data.data.length - 1].tiers;
                const getRankName = (t) => (t < 3 ? 'Unranked' : latestTiersSet.find(x => x.tier === t)?.tierName || 'Unranked');

                let currentRankTier = 0, peakRankTier = 0;
                if (mmrRes.data?.QueueSkills?.competitive?.SeasonalInfoBySeasonID) {
                    const seasonalInfo = mmrRes.data.QueueSkills.competitive.SeasonalInfoBySeasonID;
                    for (const sID in seasonalInfo) {
                        let t = seasonalInfo[sID].CompetitiveTier || 0;
                        if (t > peakRankTier) peakRankTier = t;
                    }
                    const compUpdate = await this.client.get(`https://pd.${activeRegion}.a.pvp.net/mmr/v1/players/${puuid}/competitiveupdates?startIndex=0&endIndex=1&queue=competitive`, { headers: gameHeaders });
                    if (compUpdate.data?.Matches?.length > 0) currentRankTier = compUpdate.data.Matches[0].TierAfterUpdate;
                    
                    if (currentRankTier > peakRankTier) peakRankTier = currentRankTier;
                    peakRank = getRankName(peakRankTier);
                    currentRank = getRankName(currentRankTier);
                }
            } catch (err) {}

            // 8. Catalogs (Using disguised fetch)
            let agentsCatalog = [];
            let buddiesCatalog = [];
            try {
                const fetchOpts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36' } };
                
                const [agentsRes, buddiesRes] = await Promise.all([
                    fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true', fetchOpts),
                    fetch('https://valorant-api.com/v1/buddies', fetchOpts)
                ]);

                if (agentsRes.ok) agentsCatalog = (await agentsRes.json()).data || [];
                if (buddiesRes.ok) buddiesCatalog = (await buddiesRes.json()).data || [];
                
            } catch (err) { console.log(">> Failed to fetch Agent/Buddy catalogs."); }

            // 9. 🟢 THE WATERTIGHT SKIN SCANNER (BP KNIVES ONLY)
            let premiumSkins = [];
            let battlepassSkins = []; 
            const limitedKeywords = ['champions', 'vct', 'arcane', 'ignite', 'lock//in'];

            try {
                const storeRes = await this.client.get(`https://pd.${activeRegion}.a.pvp.net/store/v1/entitlements/${puuid}/${SKIN_ITEM_TYPE_UUID}`, { headers: gameHeaders });
                
                storeRes.data.Entitlements.forEach(item => {
                    const skin = masterCatalog.find(s => s.levels?.some(l => l.uuid === item.ItemID));
                    
                    if (skin) {
                        const name = skin.displayName.toLowerCase();
                        const isStandard = name.includes('standard');
                        // Use assetPath to definitively verify if the item is a melee weapon (knife)
                        const isKnife = skin.assetPath && skin.assetPath.toLowerCase().includes('melee');
                        
                        if (!isStandard) {
                            // Check if the skin name belongs to any known BP Collection
                            const isBattlepass = BP_COLLECTIONS.some(col => name.startsWith(col + ' ') || name.startsWith(col + '//') || name === col);
                            
                            if (isBattlepass) {
                                // 🟢 ONLY ALLOW BATTLEPASS KNIVES. Regular BP Guns vanish into the void.
                                if (isKnife) {
                                    if (!battlepassSkins.some(s => s.name === skin.displayName)) {
                                        battlepassSkins.push({ 
                                            name: skin.displayName, 
                                            icon: skin.displayIcon || skin.levels[0].displayIcon, 
                                            tier: 'battlepass' 
                                        });
                                    }
                                }
                            } else {
                                // 🔵 STORE SKINS (Premium Guns & Premium Knives)
                                const isPremiumTier = PREMIUM_TIERS.includes(skin.contentTierUuid);
                                const isLimited = limitedKeywords.some(kw => name.includes(kw));

                                if (isPremiumTier || isLimited) {
                                    if (!premiumSkins.some(s => s.name === skin.displayName)) {
                                        premiumSkins.push({ 
                                            name: skin.displayName, 
                                            icon: skin.displayIcon || skin.levels[0].displayIcon, 
                                            tier: skin.contentTierUuid 
                                        });
                                    }
                                }
                            }
                        }
                    }
                });
            } catch(e) { console.log(">> Failed to fetch skins"); }

            // 10. Agents
            let unlockedAgents = [];
            try {
                const agentEnts = await this.client.get(`https://pd.${activeRegion}.a.pvp.net/store/v1/entitlements/${puuid}/${AGENT_ITEM_TYPE_UUID}`, { headers: gameHeaders });
                agentEnts.data.Entitlements.forEach(item => {
                    const agent = agentsCatalog.find(a => a.uuid === item.ItemID);
                    if (agent && !unlockedAgents.some(a => a.name === agent.displayName)) {
                        unlockedAgents.push({ name: agent.displayName, icon: agent.displayIcon });
                    }
                });
            } catch (e) {}

            // 11. Buddies
            let unlockedBuddies = [];
            try {
                const buddyEnts = await this.client.get(`https://pd.${activeRegion}.a.pvp.net/store/v1/entitlements/${puuid}/${BUDDY_ITEM_TYPE_UUID}`, { headers: gameHeaders });
                buddyEnts.data.Entitlements.forEach(item => {
                    const buddy = buddiesCatalog.find(b => b.levels?.some(l => l.uuid === item.ItemID) || b.uuid === item.ItemID);
                    if (buddy && !unlockedBuddies.some(b => b.name === buddy.displayName)) {
                        unlockedBuddies.push({ name: buddy.displayName, icon: buddy.displayIcon });
                    }
                });
            } catch (e) {}

            console.log(`--- SYNC COMPLETE ---\n`);

            const displayCountry = country.toUpperCase();
            const displayRegion = activeRegion.toUpperCase();

            return {
                region: displayRegion,
                country: displayCountry,
                riotId: riotId,                 
                playerCardImage: playerCardImage, 
                rank: currentRank,
                peakRank: peakRank,
                level: accountLevel,
                premiumSkins: premiumSkins,           
                battlepassSkins: battlepassSkins,     
                limitedSkins: premiumSkins.filter(s => limitedKeywords.some(kw => s.name.toLowerCase().includes(kw))),
                unlockedAgents: unlockedAgents, 
                unlockedBuddies: unlockedBuddies,
                vpBalance: vp,
                rpBalance: rp,
                autoTitle: `${currentRank} | ${premiumSkins.length} Premium Skins | ${displayCountry ? displayCountry + ' (' + displayRegion + ')' : displayRegion} Server`
            };

        } catch (error) {
            console.error("❌ RiotAPI Error:", error.message);
            throw new Error('Verification failed. Check token or try again.');
        }
    }
}

module.exports = new RiotAPI();