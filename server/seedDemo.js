import { resetDailyData } from "./repository.js";

const reset = process.argv.includes("--reset");

resetDailyData({ seedDemo: true });
console.log(reset ? "Demo data reset." : "Demo data seeded.");
