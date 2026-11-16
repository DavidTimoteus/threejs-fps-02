// Round economy: the player's money, kill rewards, round-end income with a loss streak bonus,
// and the buy-menu catalog.

export const CATALOG = {
  deagle: { id: 'deagle', name: 'Desert Eagle', category: 'pistol', price: 700, slot: 2 },
  mp5: { id: 'mp5', name: 'MP5-SD', category: 'smg', price: 1500, slot: 1 },
  ak47: { id: 'ak47', name: 'AK-47', category: 'rifle', price: 2700, slot: 1 },
  awp: { id: 'awp', name: 'AWP Sniper', category: 'sniper', price: 4750, slot: 1 },
  armor: { id: 'armor', name: 'Kevlar Vest', category: 'gear', price: 650, slot: 'armor' },
  defuseKit: { id: 'defuseKit', name: 'Defusal Kit', category: 'gear', price: 400, slot: 'kit' },
  heGrenade: { id: 'heGrenade', name: 'HE Grenade', category: 'grenade', price: 300, slot: 4 },
  smokeGrenade: { id: 'smokeGrenade', name: 'Smoke Grenade', category: 'grenade', price: 300, slot: 5 },
};

export const KILL_REWARD = { knife: 1500, sniper: 100, smg: 600, default: 300 };
const MAX_MONEY = 16000;

export function createEconomy() {
  let playerMoney = 800;
  let lossStreak = 0;

  const clamp = (m) => Math.min(MAX_MONEY, Math.max(0, m));

  return {
    get money() { return playerMoney; },
    add(amount) {
      playerMoney = clamp(playerMoney + amount);
      return playerMoney;
    },
    rewardKill(weaponDef) {
      const amount = weaponDef.type === 'melee' ? KILL_REWARD.knife : KILL_REWARD[weaponDef.type] ?? KILL_REWARD.default;
      playerMoney = clamp(playerMoney + amount);
      return amount;
    },
    canAfford(id) {
      const item = CATALOG[id];
      return item ? playerMoney >= item.price : false;
    },
    // owned: { armor, hasKit, alreadyOwned } describing what the player carries now.
    buy(id, owned) {
      const item = CATALOG[id];
      if (!item || playerMoney < item.price) return null;
      if (item.id === 'armor' && owned.armor >= 100) return null;
      if (item.id === 'defuseKit' && owned.hasKit) return null;
      if (item.slot !== 'armor' && item.slot !== 'kit' && owned.alreadyOwned) return null;
      playerMoney -= item.price;
      return item;
    },
    onRoundEnd(winnerTeam, playerTeam, bombPlanted) {
      if (winnerTeam === playerTeam) {
        lossStreak = 0;
        playerMoney = clamp(playerMoney + 3250);
      } else {
        playerMoney = clamp(playerMoney + Math.min(3400, 1400 + lossStreak * 500));
        lossStreak += 1;
        if (playerTeam === 'T' && bombPlanted) playerMoney = clamp(playerMoney + 800);
      }
      return playerMoney;
    },
    reset() {
      playerMoney = 800;
      lossStreak = 0;
    },
  };
}
