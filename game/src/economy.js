// Tactical economy system inspired by Counter-Strike.
// Manages team budgets, kill rewards, round bonuses, and equipment purchasing.

export const CATALOG = {
  p250: { id: 'p250', name: 'P250', category: 'pistol', price: 300, slot: 2 },
  deagle: { id: 'deagle', name: 'Desert Eagle', category: 'pistol', price: 700, slot: 2 },
  mp5: { id: 'mp5', name: 'MP5-SD', category: 'smg', price: 1500, slot: 1 },
  ak47: { id: 'ak47', name: 'AK-47', category: 'rifle', price: 2700, slot: 1 },
  awp: { id: 'awp', name: 'AWP Sniper', category: 'sniper', price: 4750, slot: 1 },
  armor: { id: 'armor', name: 'Kevlar Vest', category: 'gear', price: 650, slot: 'armor' },
  helmet: { id: 'helmet', name: 'Kevlar + Helmet', category: 'gear', price: 1000, slot: 'helmet' },
  defuseKit: { id: 'defuseKit', name: 'Defusal Kit', category: 'gear', price: 400, slot: 'kit' },
  heGrenade: { id: 'heGrenade', name: 'HE Grenade', category: 'grenade', price: 300, slot: 4 },
  smokeGrenade: { id: 'smokeGrenade', name: 'Smoke Grenade', category: 'grenade', price: 300, slot: 4 },
};

export function createEconomy() {
  let playerMoney = 800;
  let lossStreakCT = 0;
  let lossStreakT = 0;

  return {
    get money() { return playerMoney; },
    add(amount) {
      playerMoney = Math.min(16000, Math.max(0, playerMoney + amount));
      return playerMoney;
    },
    spend(amount) {
      if (playerMoney < amount) return false;
      playerMoney -= amount;
      return true;
    },
    canAfford(id) {
      const item = CATALOG[id];
      return item ? playerMoney >= item.price : false;
    },
    buy(id, inventory) {
      const item = CATALOG[id];
      if (!item || playerMoney < item.price) return null;

      // Handle armor upgrade
      if (item.id === 'armor') {
        if (inventory.armor >= 100 && !inventory.hasHelmet) return null;
      }
      if (item.id === 'helmet') {
        if (inventory.armor >= 100 && inventory.hasHelmet) return null;
      }
      if (item.id === 'defuseKit' && inventory.hasKit) return null;
      if (item.category === 'grenade' && (inventory.grenades ?? 0) >= 2) return null;

      playerMoney -= item.price;
      return item;
    },
    onRoundEnd(winnerTeam, playerTeam, bombPlanted) {
      const isWinner = winnerTeam === playerTeam;
      if (isWinner) {
        if (playerTeam === 'CT') lossStreakCT = 0;
        else lossStreakT = 0;
        playerMoney = Math.min(16000, playerMoney + 3250);
      } else {
        const streak = playerTeam === 'CT' ? lossStreakCT : lossStreakT;
        const lossReward = Math.min(3400, 1400 + streak * 500);
        playerMoney = Math.min(16000, playerMoney + lossReward);
        if (playerTeam === 'CT') lossStreakCT += 1;
        else {
          lossStreakT += 1;
          if (bombPlanted) playerMoney = Math.min(16000, playerMoney + 800);
        }
      }
      return playerMoney;
    },
    reset() {
      playerMoney = 800;
      lossStreakCT = 0;
      lossStreakT = 0;
    }
  };
}
